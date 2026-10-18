"""Concrete review questions and technical dossiers, never synthetic human signatures."""
from __future__ import annotations

import hashlib
import io
import json
import zipfile

from app.core.config import BACKEND_ROOT
from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_service as reference

SOURCE_ROOT = BACKEND_ROOT.parent / "ADMetaData/reference/gmrepo/release-sources"


def primary_semantics() -> dict:
    manifest_path = BACKEND_ROOT / "storage_manifest.json"
    raw = manifest_path.read_bytes()
    config = json.loads(raw)
    datasets = [{"datasetSlug": d["slug"], "abundanceScale": d.get("abundanceScale", "unknown"), "normalization": d.get("normalization", "unknown"),
                 "evidenceScope": "configured_import_manifest_not_an_active_revision_certificate", "sourceNote": d.get("source", {}).get("inferenceNote"),
                 "requested": ["绑定实际矩阵哈希的生成脚本/运行记录", "分类器及数据库版本", "单位、分母、零值与归一化规则", "匿名参与者及重复采样对应"]} for d in config["datasets"]]
    docs = []
    for relative in ("docs/guides/server-transfer-audit.md", "docs/guides/bioinformatics-script-provenance.md", "docs/guides/ngdc-metadata-verification.md"):
        path = BACKEND_ROOT.parent / relative
        docs.append({"path": relative, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "status": "local_audit_document_not_new_scientific_approval"})
    return {"status": "upstream_confirmation_required", "manifestSha256": hashlib.sha256(raw).hexdigest(), "datasets": datasets, "auditDocuments": docs,
            "mag": {"scope": "既有 MAG 包保留 CoverM 百分比语义及分类/质量依据；不得外推为 Reads 物种或 KO 语义。", "requested": ["具体主修订/样本集合的主外比较依据", "MAG 功能归属链（未完成不能由群落 KO 替代）"]},
            "note": "现有脚本、成功日志与本地派生矩阵不是同一种证据；物种表与服务器表的差异未被本轮自动消除。"}


def acquisition_batches() -> list[dict]:
    result = []
    for path in sorted(SOURCE_ROOT.glob("*/receipts.json")):
        payload = json.loads(path.read_bytes())
        rows = []
        for item in payload["records"]:
            receipt = item.get("receipt")
            status = "unavailable"
            if receipt:
                raw_path = (path.parent / receipt["file"]).resolve()
                if raw_path.is_relative_to(path.parent.resolve()) and raw_path.is_file():
                    raw = raw_path.read_bytes()
                    status = "verified" if len(raw) == receipt["bytes"] and hashlib.sha256(raw).hexdigest() == receipt["sha256"] else "integrity_error"
            rows.append({"object": item.get("projectId") or item.get("key"), "kind": item.get("kind"), "status": item["status"], "readback": status,
                         "total": item.get("total"), "retrieved": item.get("retrieved"), "paginationComplete": item.get("paginationComplete"),
                         "error": item.get("error"), "file": receipt.get("file") if receipt else None,
                         "note": "取得不等于完成筛查；HTTP/格式失败不当作零结果。"})
        result.append({"batch": path.parent.name, "manifestSha256": hashlib.sha256(path.read_bytes()).hexdigest(), "status": payload["status"], "records": rows})
    return result


def workspace(data: reference.ReferenceDataset) -> dict:
    from app.services.gmrepo_snapshot_service import code_fingerprint

    audits = {r["projectId"]: r for r in analysis.audit_catalog(data)["items"]}
    research = ledger.research_ledger(data, audits)
    questions = []
    for row in research["records"]:
        for issue in row["blockers"]:
            questions.append({"questionId": row["projectId"] + ":" + issue["reasonCode"], "projectId": row["projectId"], "question": issue["missingEvidence"],
                              "evidenceRefs": issue["evidenceRefs"], "requestedAction": issue["nextAction"], "affects": issue["affects"],
                              "responsibility": "project_research_reviewer_or_data_provider", "status": "unresolved"})
    result = {"referenceFingerprint": data.fingerprint, "registryFingerprint": research["registryFingerprint"], "researchLedger": research,
              "questions": questions, "primarySemantics": primary_semantics(), "acquisitionBatches": acquisition_batches(),
              "evaluationCodeFingerprint": code_fingerprint(), "signaturesGenerated": 0, "note": "资料/计算核验与真实科研签署分别验收；本包只准备待审问题，不产生科研批准。"}
    result["fingerprint"] = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return result


def dossier(data: reference.ReferenceDataset) -> bytes:
    record = workspace(data)
    registry, _, _ = ledger.registry(data)
    if not registry:
        raise ValueError("Cannot prepare dossier from invalid registry")
    template = {"schemaVersion": 1, "baseRegistrySha256": record["registryFingerprint"], "dossierFingerprint": record["fingerprint"],
                "referenceFingerprint": data.fingerprint, "reviews": [], "relationshipReviews": [],
                "instructions": "由真实复核者填写新增意见；不得把问题模板或 AI 内容当作已签署决定。先 dry-run 校验，再显式发布。"}
    scopes = {"projectReviewScopes": [{"projectId": row["projectId"], "purpose": purpose, "decision": "pending", "reviewer": None, "role": None, "reviewedOn": None,
                                      "scope": "current_project_comparison", "comparisonFingerprint": row["comparison"]["contentFingerprint"],
                                      "allRunSetSha256": row["comparison"]["allRunSetSha256"], "methodVersion": analysis.METHOD_VERSION,
                                      "evidenceOptions": [s["sourceId"] for s in row["sources"] if s["availability"] == "verified"],
                                      "instructions": "选择实际审查用途，填写唯一 reviewId、实际意见/来源/签署；pending 模板不作为审查决定。"} for row in record["researchLedger"]["records"] for purpose in ("identity", "scientific_review")],
              "relationshipReviewScopes": [{k: row[k] for k in ("relationshipId", "leftNode", "rightNode", "leftFingerprint", "rightFingerprint", "participantCoverage", "runIntersection", "biosampleIntersection")} for row in record["researchLedger"]["relationships"]["pairs"]]}
    file_map = {"dossier.json": record, "review-candidate.json": template, "scope-templates.json": scopes, "registry.json": registry.model_dump(mode="json")}
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, value in file_map.items():
            archive.writestr(name, json.dumps(value, ensure_ascii=False, indent=2))
        archive.writestr("README.txt", "科研待审包：从 questions 中选用途，按 registry 的 review/relationshipReview 契约填写意见。\n每条绑定比较或双边关系指纹，登记真实复核人/角色/日期、来源 sourceId 与意见。不填写也不默认通过。\n原文按 sources URL/path 获取；附件未全部随包分发，注意权限。主矩阵方法与参与者对应见 primarySemantics 的精确索取项。\n技术校验：python -m app.cli.import_gmrepo_reviews <review-candidate.json>。此命令默认不发布；发布需要项目确认实际人工作者身份。\n")
    return output.getvalue()
