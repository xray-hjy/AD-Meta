"""Join immutable source facts, discovery and scoped reviews without inventing approval."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.core.config import BACKEND_ROOT
from app.services import gmrepo_service as reference
from app.services.gmrepo_ledger_models import ResearchRegistry

REGISTRY_PATH = BACKEND_ROOT / "metadata/gmrepo_research_registry.json"
DISCOVERY_PATH = BACKEND_ROOT / "metadata/gmrepo_discovery_registry.json"
PROTOCOL_PATH = BACKEND_ROOT / "metadata/gmrepo_evidence_protocol.json"
LEGACY_REVIEW_PATH = BACKEND_ROOT / "metadata/gmrepo_inference_review.json"


def run_set_digest(samples: list[dict]) -> str:
    return hashlib.sha256("\n".join(sorted(s["run_id"] for s in samples)).encode()).hexdigest()


def registry(data: reference.ReferenceDataset) -> tuple[ResearchRegistry | None, str, str]:
    try:
        raw = REGISTRY_PATH.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        record = ResearchRegistry.model_validate_json(raw)
        if record.referenceFingerprint != data.fingerprint:
            return None, "reference_version_mismatch", digest
        return record, "bound", digest
    except (OSError, ValueError, TypeError):
        return None, "invalid_or_unavailable", "unavailable"


def discovery(data: reference.ReferenceDataset) -> dict:
    try:
        raw = DISCOVERY_PATH.read_bytes()
        result = json.loads(raw)
        result["sourceFingerprint"] = hashlib.sha256(raw).hexdigest()
        if result.get("referenceFingerprint") != data.fingerprint:
            return {**result, "status": "reference_version_mismatch", "projects": [], "scopes": [], "queries": [],
                    "note": "发现清单绑定其他参考版本，不能当作本版本完整范围。"}
        receipts = acquisition_records(result)
        if receipts and any(r["availability"] != "verified" for r in receipts):
            return {**result, "status": "source_unavailable_or_changed", "projects": [], "scopes": [], "coverage": {},
                    "note": "发现目录原件不可读取或哈希已变化，暂停使用其范围结论；固定参考包仍按自身校验结果使用。"}
        installed = {s["project_id"] for s in data.samples}
        result["projects"] = [{**row, "installed": row["projectId"] in installed} for row in result.get("projects", [])]
        return result
    except (OSError, ValueError, TypeError, KeyError):
        return {"status": "unavailable", "projects": [], "queries": [], "note": "来源清点记录不可读取，不能声明完整覆盖。"}


def runtime_protocol(data: reference.ReferenceDataset) -> dict:
    raw = PROTOCOL_PATH.read_bytes()
    rules = json.loads(raw)
    found = discovery(data)
    record, state, digest = registry(data)
    status = found["status"]
    return {**rules, "fingerprint": hashlib.sha256(raw).hexdigest(), "discoveryStatus": status,
            "registryStatus": state, "registryFingerprint": digest,
            "registryVersion": record.version if record else None,
            "scopeMode": record.scopeMode if record else "not_bound",
            "plannedDiscoveryTerms": rules.get("discoveryTerms", []),
            "steps": [{**step, "status": status} if step["key"] == "discovery" else step for step in rules["steps"]]}


def blocker(project: str, code: str, message: str, affects: list[str], missing: str, action: str,
            refs: list[str] | None = None, scope: str = "当前固定版本的研究比较") -> dict:
    return {"reasonCode": code, "projectId": project, "scope": scope, "affects": affects,
            "message": message, "missingEvidence": missing, "nextAction": action,
            "status": "pending", "evidenceRefs": refs or []}


def comparison_digest(data: reference.ReferenceDataset, project: str) -> str:
    payload = {"reference": data.fingerprint, "project": project,
               "samples": sorted((s for s in data.samples if s["project_id"] == project), key=lambda s: s["run_id"]),
               "genera": sorted(data.genera), "method": json.loads(PROTOCOL_PATH.read_bytes())["methodVersion"]}
    payload["cohortRules"] = data.rules.get(project)
    payload["dataContract"] = data.contract
    payload["methodImplementation"] = {name: hashlib.sha256((BACKEND_ROOT / name).read_bytes()).hexdigest() for name in (
        "app/services/gmrepo_analysis_service.py", "app/compute/statistics.py", "app/compute/charts/boxplot.py")}
    try:
        legacy = json.loads(LEGACY_REVIEW_PATH.read_bytes())
        payload["legacyReviewScope"] = {"version": legacy.get("version"), "referenceFingerprint": legacy.get("referenceFingerprint"),
                                        "entry": legacy.get("cohorts", {}).get(project)}
    except (OSError, ValueError, TypeError):
        payload["legacyReviewScope"] = None
    record, _, _ = registry(data)
    link = next((p for p in record.projects if p.projectId == project), None) if record else None
    payload["researchFacts"] = link.model_dump(mode="json") if link else None
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()


def source_checks(data: reference.ReferenceDataset, record: ResearchRegistry) -> list[dict]:
    checks = []
    for source in record.sources:
        base = data.root if source.origin == "sealed_package" else BACKEND_ROOT.parent
        row = source.model_dump() | {"availability": "unavailable"}
        try:
            if base:
                base = base.resolve()
                path = (base / source.path).resolve()
                if path.is_relative_to(base) and path.is_file():
                    raw = path.read_bytes()
                    row["availability"] = "verified" if len(raw) == source.bytes and hashlib.sha256(raw).hexdigest() == source.sha256 else "integrity_error"
        except OSError:
            pass
        checks.append(row)
    return checks


def review_records(data: reference.ReferenceDataset, project: str, record: ResearchRegistry | None = None) -> list[dict]:
    if record is None:
        record, _, _ = registry(data)
    if record is None:
        return []
    if not any(r.projectId == project for r in record.reviews):
        return []
    replaced = {r.supersedes for r in record.reviews if r.supersedes}
    verified = {s["sourceId"] for s in source_checks(data, record) if s["availability"] == "verified"}
    sample_digest = run_set_digest([s for s in data.samples if s["project_id"] == project])
    content_digest = comparison_digest(data, project)
    method = json.loads(PROTOCOL_PATH.read_bytes())["methodVersion"]
    rows = []
    for review in record.reviews:
        if review.projectId != project:
            continue
        status = "valid"
        if review.decision == "pending":
            status = "pending"
        elif review.reviewId in replaced:
            status = "superseded"
        elif review.allRunSetSha256 != sample_digest or (record.schemaVersion == 2 and (review.comparisonFingerprint != content_digest or review.methodVersion != method)):
            status = "scope_mismatch"
        elif record.schemaVersion == 2 and not set(review.evidenceRefs) <= verified:
            status = "evidence_unavailable_or_changed"
        rows.append(review.model_dump(mode="json") | {"validationStatus": status, "isEffective": status == "valid",
                     "authorization": "scoped_review_only" if record.schemaVersion == 2 else "does_not_grant_inference"})
    return rows


def effective_opinion(data: reference.ReferenceDataset, project: str, purpose: str, scope: str | None = None) -> dict | None:
    record, _, _ = registry(data)
    if record is None or record.schemaVersion != 2 or not record.reviews:
        return None
    candidates = [r for r in review_records(data, project, record) if r["purpose"] == purpose and r["isEffective"] and (scope is None or r["scope"] == scope)]
    # More than one examined independence scope is not collapsed into universal independence.
    return candidates[0] if len(candidates) == 1 else None


def review_restrictions(data: reference.ReferenceDataset, project: str, samples: list[dict]) -> tuple[list[dict], str]:
    record, state, digest = registry(data)
    if state == "invalid_or_unavailable":
        return [blocker(project, "REGISTRY_UNAVAILABLE", "补充核查登记不可验证，暂缓沿用检验资格。", ["unadjusted", "adjusted"],
                        "可校验的研究登记及撤销记录", "恢复登记并重新验证；不根据缺文件推断没有撤销。")], digest
    result = []
    # A registry for a different immutable reference cannot authorize or revoke this one.
    for review in review_records(data, project, record) if record else []:
        if review["decision"] == "pending" or review["validationStatus"] == "superseded":
            continue
        if review["purpose"] not in {"identity", "unadjusted", "adjusted"}:
            continue
        affects = ["adjusted"] if review["purpose"] == "adjusted" else ["unadjusted", "adjusted"]
        if not review["isEffective"]:
            result.append(blocker(project, "REVIEW_SCOPE_MISMATCH" if review["validationStatus"] == "scope_mismatch" else "REVIEW_EVIDENCE_INVALID",
                                  "补充核查的范围或依据与当前研究不符。", affects,
                                  "绑定当前比较与完整依据的复核记录", "核对差异并重新复核。", review["evidenceRefs"]))
        elif review["decision"] in {"hold", "revoked"}:
            result.append(blocker(project, "REVIEW_REVOKED" if review["decision"] == "revoked" else "REVIEW_ON_HOLD",
                                  review["note"], affects, "恢复该用途所需的有效审查依据", "按撤销/暂缓记录补证复核；不得继续使用旧缓存。", review["evidenceRefs"]))
    return result, digest


def assessment(data: reference.ReferenceDataset, project: str, audit: dict | None, samples: list[dict] | None = None) -> dict:
    samples = [s for s in data.samples if s["project_id"] == project] if samples is None else samples
    profiles = sum(s.get("profile_status") == "complete_profile" for s in samples)
    plot = sum(reference.decision(s) == "plot_ready" for s in samples)
    issues = [i for i in audit.get("blockers", []) if i["reasonCode"] not in {
        "NOT_INSTALLED", "NO_AD_NC_COMPARISON", "PROFILE_INCOMPLETE", "INDEPENDENCE_UNREVIEWED",
        "SCIENTIFIC_REVIEW_PENDING", "PRIMARY_COMPARABILITY_PENDING", "INDEPENDENCE_SCOPE_LIMITED"}] if audit else []
    if not samples:
        issues.append(blocker(project, "NOT_INSTALLED", "该项目仅被发现，尚未接入当前运行包。", ["metadata", "profile", "distribution", "unadjusted", "adjusted"],
                              "经核查的来源数据和新处理版本", "先审查材料、疾病阶段和同研究对照，再决定接入。"))
    elif not plot:
        issues.append(blocker(project, "NO_AD_NC_COMPARISON", "当前没有可用于属级分布的 AD/NC 子集。", ["distribution", "unadjusted", "adjusted"],
                              "可信的样本级分组及可用 profile", "核对原研究与同研究对照；其他阶段保留原标签，不拼接对照。"))
    if profiles < len(samples):
        issues.append(blocker(project, "PROFILE_INCOMPLETE", f"{len(samples) - profiles} 条 Run 没有完整 profile；未补零。", ["profile"],
                              "缺失 Run 的来源 profile 或明确不可取得记录", "核对 QC、获取和处理状态，保留缺失。"))
    science = effective_opinion(data, project, "scientific_review")
    independence = effective_opinion(data, project, "independence")
    science_status = "reviewed_for_scope" if science and science["decision"] == "confirmed" else "pending"
    independence_status = "reviewed_limited_scope" if independence and independence["decision"] == "confirmed" else "pending"
    issues.extend([
        blocker(project, "INDEPENDENCE_SCOPE_LIMITED" if independence_status != "pending" else "INDEPENDENCE_UNREVIEWED",
                f"重叠审查仅覆盖 {independence['scope']}；结果 {independence['outcome']}，不认证独立复现。" if independence and independence_status != "pending" else "跨研究及主外样本重叠尚未完成核查。", ["independence", "replication"],
                "原研究关联和样本/参与者重叠审查", "逐项核查研究和参与者复用；无相同 Run 不等于独立。"),
        *([] if science_status != "pending" else [blocker(project, "SCIENTIFIC_REVIEW_PENDING", "科研方法与解释复核尚未完成。", ["scientificReview"],
                "真实复核者、日期、范围及意见", "由项目指定科研复核人员，记录通过、待补或不通过。"),
        ]),
        blocker(project, "PRIMARY_COMPARABILITY_PENDING", "属级参考不自动构成主物种/MAG 的数值复现。", ["primaryComparability", "replication"],
                "统一属级注释、主队列效应及跨队列参与者关系", "结合版本内已知单位与来源，统一分析口径后再评价效应方向。"),
    ])

    def capability(name: str, status: str) -> dict:
        return {"status": status, "reasonCodes": sorted({i["reasonCode"] for i in issues if name in i["affects"]})}

    return {"capabilities": {
        "metadata": capability("metadata", "available" if samples else "not_loaded"),
        "profile": capability("profile", "available" if samples and profiles == len(samples) else "partial" if profiles else "unavailable"),
        "distribution": capability("distribution", "available" if plot else "not_applicable" if samples else "not_loaded"),
        "unadjusted": capability("unadjusted", audit["unadjustedStatus"] if audit else "not_applicable" if samples else "not_loaded"),
        "adjusted": capability("adjusted", audit["adjustedStatus"] if audit else "not_applicable" if samples else "not_loaded"),
        "taxonomy": capability("taxonomy", "reference_genus_only" if samples else "pending"),
        "primaryComparability": capability("primaryComparability", "pending"),
        "independence": capability("independence", independence_status),
        "scientificReview": capability("scientificReview", science_status),
    }, "blockers": issues}


def project_record(data: reference.ReferenceDataset, project: str, audit: dict | None, found: dict | None = None) -> dict:
    found = found if found is not None else discovery(data)
    source = next((r for r in found.get("projects", []) if r["projectId"] == project), {})
    supplement, state, _ = registry(data)
    link = next((r for r in supplement.projects if r.projectId == project), None) if supplement else None
    samples = [s for s in data.samples if s["project_id"] == project]
    plot = [s for s in samples if reference.decision(s) == "plot_ready"]
    source_index = next((i for i, row in enumerate(found.get("projects", [])) if row["projectId"] == project), None)
    source_ref = f"backend/metadata/gmrepo_discovery_registry.json#/projects/{source_index}" if source_index is not None else "backend/metadata/gmrepo_research_registry.json"
    package_refs = [f"reference:{data.fingerprint}/cohort_rules.json#/{project}", f"reference:{data.fingerprint}/tables/sample_metadata_clean.json"]

    def field(value, raw=None, status="pending", refs=None):
        return {"value": value, "rawValue": raw, "status": status, "evidenceRefs": refs or []}

    fields = {key: field(getattr(link, key) if link else None, status="documented_pending_review" if link and getattr(link, key) else "pending",
                         refs=link.evidenceRefs if link else []) for key in ("studyTitle", "country", "material")}
    fields.update({
        "originalDescription": field(None, source.get("originalDescription"), "source_record_unreviewed", [source_ref]),
        "publicationCandidates": field(None, str(source["publications"]) if source.get("publications") else None, "source_record_unreviewed", [source_ref]),
        "sourcePhenotypes": field(None, source.get("phenotypes") or source.get("phenotype"), "source_record_unreviewed", [source_ref]),
        "researchGroups": field(sorted({s["research_group"] for s in samples}), status="curated_package" if samples else "not_loaded", refs=package_refs if samples else [source_ref]),
        "platform": field("16S 属级参考" if samples else None, sorted({str(s.get("library_strategy") or "未提供") for s in samples}) or source.get("platform"),
                          "package_contract" if samples else "source_record_unreviewed", [f"reference:{data.fingerprint}/data_contract.json"] if samples else [source_ref]),
    })
    checks = source_checks(data, supplement) if supplement else []
    valid_sources = {s["sourceId"] for s in checks if s["availability"] == "verified"}
    for key, assertion in link.facts.items() if link else []:
        valid = set(assertion.evidenceRefs) <= valid_sources
        opinion = effective_opinion(data, project, "field", f"field:{key}")
        reviewed = opinion and opinion["decision"] == "confirmed" and set(assertion.evidenceRefs) <= set(opinion["evidenceRefs"])
        fields[key] = {"value": assertion.value if valid else None, "rawValue": assertion.rawValue,
                       "status": "reviewed_for_scope" if valid and reviewed else "documented_pending_review" if valid else "evidence_unavailable_or_changed",
                       "evidenceRefs": assertion.evidenceRefs, "locator": assertion.locator}
    if state != "bound":
        fields["registry"] = field(None, status=state, refs=[str(REGISTRY_PATH.name)])
    reviews = review_records(data, project, supplement) if supplement else []
    if audit and audit.get("reviewVersion"):
        reviews.insert(0, {"reviewId": f"legacy:{project}:{audit['reviewVersion']}", "purpose": "identity",
                           "decision": audit["identityStatus"], "evidenceValidation": audit["reviewFingerprint"],
                           "reviewer": None, "reviewedOn": None, "evidenceRefs": audit["evidenceFiles"],
                           "note": "沿用已校验的历史专项身份依据；不等于本轮科研方法复核，人员与签署日期未在该记录提供。"})
    qualification = assessment(data, project, audit, samples)
    current_issues = {b["reasonCode"] for b in qualification["blockers"]}
    resolutions = []
    for resolution in supplement.resolutions if supplement else []:
        if resolution.projectId != project:
            continue
        effective_review = next((r for r in reviews if r.get("reviewId") == resolution.reviewId and r.get("isEffective") and r.get("decision") == "confirmed"), None)
        closed = resolution.status == "resolved" and resolution.reasonCode not in current_issues and effective_review and set(resolution.evidenceRefs) <= valid_sources
        resolutions.append(resolution.model_dump() | {"effectiveStatus": "resolved" if closed else "pending" if resolution.status == "resolved" else resolution.status})
    return {"projectId": project, "studyId": link.studyId if link and set(link.evidenceRefs) <= valid_sources else None, "installed": bool(samples), "fields": fields,
            "sourceUrl": link.originalStudyUrl if link and link.originalStudyUrl and set(link.evidenceRefs) <= valid_sources else audit.get("sourceUrl") if audit else data.rules.get(project, {}).get("original_study"),
            "comparison": {"intendedType": "AD_vs_same_study_NC", "status": "plot_subset_available" if plot else "not_established",
                           "observationUnit": "Run", "metadataRuns": len(samples) if samples else None,
                           "allRunSetSha256": run_set_digest(samples) if samples else None,
                           "contentFingerprint": comparison_digest(data, project),
                           "plotReadyRuns": len(plot), "plotRunSetSha256": run_set_digest(plot) if plot else None,
                           "groupCounts": audit["groupCounts"] if audit else {},
                           "adjustedCount": audit["adjustedCount"] if audit else None,
                           "adjustedRunSetSha256": audit.get("adjustedRunSetSha256") if audit else None,
                           "note": "比较范围来自固定处理包；疾病定义、同研究对照和重复关系按具体依据核查。"},
            **qualification, "reviews": reviews,
            "evidenceRefs": package_refs if samples else [source_ref],
            "screening": {"status": link.screeningStatus if link and set(link.screeningEvidenceRefs) <= valid_sources else "evidence_unavailable" if link and link.screeningEvidenceRefs else "pending", "note": link.screeningNote if link else None,
                          "evidenceRefs": link.screeningEvidenceRefs if link else [], "scientificReview": "not_granted_by_screening"},
            "sources": [s for s in checks if s["sourceId"] in ({ref for f in fields.values() for ref in f["evidenceRefs"]} | set(link.screeningEvidenceRefs + link.evidenceRefs if link else []))],
            "issueResolutions": resolutions}


def acquisition_records(found: dict) -> list[dict]:
    """Read-back checks are local only; retrieval status alone does not prove availability."""
    result = []
    archive = Path(found.get("archivePath") or "__missing_archive__")
    repo = BACKEND_ROOT.parent.resolve()
    for receipt in found.get("queries", []):
        row = {k: receipt.get(k) for k in ("url", "method", "body", "status", "retrievedAt", "file", "sha256", "bytes")}
        row["archivePath"] = str(archive).replace("\\", "/")
        path = (repo / archive / str(receipt.get("file") or "__missing_file__")).resolve()
        row["availability"] = "unavailable"
        try:
            if path.is_relative_to(repo) and path.is_file():
                raw = path.read_bytes()
                row["availability"] = "verified" if len(raw) == row["bytes"] and hashlib.sha256(raw).hexdigest() == row["sha256"] else "integrity_error"
        except OSError:
            row["availability"] = "unavailable"
        result.append(row)
    return result


def research_ledger(data: reference.ReferenceDataset, audits: dict[str, dict]) -> dict:
    from app.services.gmrepo_relationship_service import assess

    found = discovery(data)
    record, state, digest = registry(data)
    project_ids = {s["project_id"] for s in data.samples} | {r["projectId"] for r in found.get("projects", [])}
    if record:
        project_ids.update(r.projectId for r in record.projects)
    projects = sorted(project_ids)
    rows = [project_record(data, pid, audits.get(pid), found) for pid in projects]
    receipts = acquisition_records(found)
    relationships = assess(data, sorted(audits))
    keyword_scope = found.get("coverage", {}).get("keywordScope", {})
    remaining = ["项目描述未含检索词的研究", "同研究对照/材料/疾病阶段的逐样本对应", "WGS 丰度获取及重复采样处理", "研究与参与者去重"]
    if keyword_scope:
        if keyword_scope.get("notReturnedProjects"):
            remaining.insert(0, f"官方项目接口未返回的 {keyword_scope['notReturnedProjects']} 项记录")
    else:
        remaining.insert(0, "项目描述关键词检索")
    all_runs = found.get("coverage", {}).get("allRunInventory", {})
    if all_runs:
        remaining.insert(0, f"项目目录联合编号 {all_runs['unionProjects']}/{all_runs['sourceProjects']}；恢复的 5 项缺描述，另 {all_runs['unrecoveredProjectIdentities']} 项身份未恢复")
    for row in rows:
        row["relationships"] = [r for r in relationships["pairs"] if row["projectId"] in {r["leftNode"], r["rightNode"]}]
    return {"schemaVersion": 1, "version": record.version if record else "derived-unbound", "referenceFingerprint": data.fingerprint,
            "registryFingerprint": digest, "registryStatus": state, "discoveryStatus": found["status"],
            "discoveryFingerprint": found.get("sourceFingerprint"),
            "scientificReviewStatus": "reviewed_for_scope" if rows and all(r["capabilities"]["scientificReview"]["status"] == "reviewed_for_scope" for r in rows) else "partial" if any(r["capabilities"]["scientificReview"]["status"] == "reviewed_for_scope" for r in rows) else "pending",
            "sourceChecks": source_checks(data, record) if record else [], "relationships": relationships,
            "counts": {"registeredProjects": len(rows), "installedProjects": sum(r["installed"] for r in rows),
            "discoveredNotInstalled": sum(not r["installed"] for r in rows)},
            "records": rows, "acquisitions": receipts,
            "scope": {"mode": record.scopeMode if record else "not_bound", "recordedOn": str(record.recordedOn) if record else None,
                      "planned": record.searchScope if record else [], "completedPhenotypeScopes": found.get("scopes", []),
                      "completedProjectDescriptionScope": keyword_scope, "completedDiscoveryCoverage": found.get("coverage", {}), "remaining": remaining,
                      "note": "已登记、已获取、专项身份审查与科研复核分别报告；不是预注册或全库覆盖。"}}
