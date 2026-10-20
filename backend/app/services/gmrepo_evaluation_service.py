"""Version-bound external evidence records; no cross-platform pooling."""
from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from datetime import UTC, datetime
from typing import Any

import pymysql
from sqlalchemy.exc import SQLAlchemyError

from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_claims as explanations
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_primary_evidence as primary
from app.services import gmrepo_service as reference


def protocol(data: reference.ReferenceDataset) -> dict[str, Any]:
    return ledger.runtime_protocol(data)


def resources(data: reference.ReferenceDataset) -> dict[str, Any]:
    rules = protocol(data)
    audits = {r["projectId"]: r for r in analysis.audit_catalog(data)["items"]}
    research = ledger.research_ledger(data, audits)
    records = {r["projectId"]: r for r in research["records"]}
    items = []
    for row in reference.cohort_rows(data, list(data.samples)):
        project = row["projectId"]
        samples = reference.select_samples(data, project)
        audit = audits.get(project)
        strategies = sorted({str(s.get("library_strategy") or "未提供") for s in samples})
        source_types = sorted({str(s.get("source_experiment_type") or "未提供") for s in samples})
        evidence = sorted({p for s in samples for p in s.get("group_evidence_paths", [])})
        items.append({**row, "researchRecord": records[project], "platform": "16S 属级参考", "libraryStrategies": strategies,
                      "sourceExperimentTypes": source_types,
                      "platformReview": "依据处理契约；保留来源策略差异供复核",
                      "researchGroups": sorted({s["research_group"] for s in samples}),
                      "unadjustedStatus": audit["unadjustedStatus"] if audit else "not_applicable",
                      "adjustedStatus": audit["adjustedStatus"] if audit else "not_applicable",
                      "reviewNote": audit["reviewNote"] if audit else "不属于当前可画图 AD/NC 子集。",
                      "independenceStatus": "not_reviewed_between_studies" if records[project]["capabilities"]["independence"]["status"] == "pending" else records[project]["capabilities"]["independence"]["status"],
                      "sourceReceiptStatus": rules["sourceReceiptStatus"],
                      "evidenceFiles": [{"path": p, "available": bool(data.root and (data.root / p).is_file())} for p in evidence]})
    discovery = ledger.discovery(data)
    return {"provenance": reference.provenance(data), "protocol": rules, "items": items,
            "discovery": discovery, "researchLedger": research, "primaryContext": primary.cohort_context(),
            "counts": {"installedProjects": len(items), "metadataRuns": len(data.samples),
                       "completeProfiles": data.checks["complete_profiles"], "plotCohorts": len(audits),
                       "testableCohorts": sum(a["unadjustedStatus"] == "eligible" for a in audits.values())}}


def _match(data: reference.ReferenceDataset, name: str, domain: str) -> list[dict]:
    normalized = primary._name(name)
    return [g for g in data.genera.values() if g["domain"] == domain and normalized in
            {primary._name(g["name"]), *(primary._name(n) for n in g["sourceNames"])}]


def _mapping(result: dict, data: reference.ReferenceDataset, name: str, domain: str) -> dict:
    if re.fullmatch(r"GGB\d+", str(name or "")):
        result.update(status="no_reference_match", genus=None,
                      reasons=["当前属为 MetaPhlAn GGB 占位标识，尚无可核对的命名菌属，不能据此匹配 GMrepo；不代表该特征不存在外部证据。"])
        return result
    matches = _match(data, name, domain)
    if len(matches) != 1:
        result.update({"status": "ambiguous" if matches else "no_reference_match", "genus": None,
                       "reasons": ["属名对应多项参考分类，需人工核查。" if matches else "当前参考快照没有该属的可靠对应；不代表外部研究没有关联。"]})
    else:
        result.update({"status": "mapped", "genus": matches[0], "mappingLevel": "genus_background",
                       "reasons": ["外部结果为属级背景；不构成所选物种或 MAG 的数值复现。"]})
    return result


def _species_record(subject_id: str, revision: str, dataset_slug: str) -> dict | None:
    with primary.connect() as conn:
        row = conn.execute(
            """SELECT DISTINCT t.taxon_id, t.kingdom, t.genus, t.species, t.full_taxonomy,
                       r.revision_key, r.source_sha256, r.abundance_scale, r.normalization
               FROM datasets d JOIN dataset_revisions r ON r.dataset_id = d.id
               JOIN revision_species_abundance a ON a.revision_id = r.id
               JOIN taxon_anno t ON t.taxon_id = a.taxon_id
               WHERE d.slug = ? AND d.status = 'published' AND r.status = 'published'
                 AND r.revision_key = ? AND t.taxon_id = ?""", (dataset_slug, revision, subject_id),
        ).fetchone()
    return dict(row) if row else None


def resolve_subject(data: reference.ReferenceDataset, subject_type: str, subject_id: str, revision: str,
                    dataset_slug: str = "ad-nc-species", run_key: str = "", artifact_key: str = "") -> dict:
    result: dict[str, Any] = {"subjectType": subject_type, "subjectId": subject_id, "subjectName": subject_id,
                            "sourceRevision": revision, "datasetSlug": dataset_slug, "runKey": run_key,
                            "artifactKey": artifact_key, "referenceRevision": data.fingerprint,
                            "status": "unresolved", "mappingLevel": "none", "genus": None, "reasons": [],
                            "mappingMethod": "", "representativeMag": None}
    if subject_type == "genus":
        if subject_id not in data.genera:
            result.update(status="no_reference_match", reasons=["参考属 ID 不在当前版本目录中。"])
            return result
        return {**result, "status": "mapped", "genus": data.genera[subject_id],
                "subjectName": data.genera[subject_id]["name"], "sourceRevision": data.fingerprint,
                "mappingLevel": "reference_genus", "mappingMethod": "固定参考版本的 NCBI 属 ID"}
    if not revision:
        return {**result, "status": "source_version_required", "reasons": ["需要固定主数据版本，不能仅凭名称或自动切换到当前版本。"]}
    try:
        if subject_type == "species":
            if not re.fullmatch(r"\d+", subject_id):
                return {**result, "reasons": ["主物种 ID 不是当前数据契约支持的稳定 ID。"]}
            if bool(run_key) != bool(artifact_key):
                return {**result, "status": "context_mismatch", "reasons": ["分析运行和产物必须同时提供。"]}
            if run_key:
                from app.services.full_result_service import FullResultError, query_complete_results

                try:
                    page = query_complete_results(run_key, artifact_key, feature_id=subject_id, limit=1)
                except (FullResultError, KeyError, ValueError):
                    return {**result, "status": "context_mismatch", "reasons": ["原分析运行或产物当前不可读取。"]}
                if page["datasetRevision"] != revision or page["featureKind"] not in {"species", "taxonomy"} or not page["items"]:
                    return {**result, "status": "context_mismatch", "reasons": ["对象、版本与原分析产物不一致。"]}
                dataset_slug = page["datasetSlug"]
                result["datasetSlug"] = dataset_slug
            row = _species_record(subject_id, revision, dataset_slug)
            if not row:
                return {**result, "status": "source_unavailable", "reasons": ["固定版本中没有该物种记录；不会切换其他版本或默认菌属。"]}
            result.update(subjectName=row["species"].replace("_", " "), sourceSha256=row["source_sha256"],
                          sourceGenus=row["genus"], abundanceScale=row["abundance_scale"], normalization=row["normalization"],
                          mappingMethod="固定主物种版本内读取分类；域一致的精确属名及核对旧名对应。内部 taxon_id 不是 NCBI TaxID。")
            return _mapping(result, data, row["genus"], row["kingdom"])
        if subject_type == "mag":
            from app.services import mag_analysis_service as mag

            try:
                source = mag.load_mag_dataset(revision=revision)
            except mag.MagDataError:
                return {**result, "status": "source_unavailable", "reasons": ["MAG 数据当前不可读取。"]}
            if source.fingerprint != revision:
                return {**result, "status": "source_version_mismatch", "reasons": ["MAG 数据版本已变化；需返回原工作区刷新后选择，不会混用版本。"]}
            member = next((r for r in source.lineage if r["memberMag"] == subject_id), None)
            representative = member["representativeMag"] if member else subject_id
            if representative not in source.mag_ids:
                return {**result, "status": "source_unavailable", "reasons": ["该 MAG 不属于固定版本。"]}
            result["representativeMag"] = representative
            crosswalk = next((r for r in source.crosswalk if r["magId"] == representative), None)
            if not crosswalk or crosswalk["mappingStatus"] not in {"matched_exact_ncbi_species_taxid", "ncbi_species_taxid_not_observed_in_reads"}:
                return {**result, "reasons": ["MAG 缺少经核查的 NCBI 分类对应；GTDB 名称不按相似度补成确定对应。"]}
            taxonomy = crosswalk.get("ncbiTaxonomy") or ""
            genus = re.search(r"(?:^|[;|])\s*g__([^;|]+)", taxonomy)
            domain = re.search(r"(?:^|[;|])\s*(?:k|d)__([^;|]+)", taxonomy)
            if not genus or not domain:
                return {**result, "reasons": ["已有 NCBI 物种 crosswalk，但缺少可核查的属级路径；不能从 GTDB 后缀或物种名称猜属。"]}
            result["mappingMethod"] = "固定 MAG crosswalk 中已核查的 NCBI 分类路径；保留成员到代表关系。"
            result["ncbiSpeciesTaxid"] = crosswalk.get("ncbiSpeciesTaxid")
            return _mapping(result, data, genus.group(1), domain.group(1))
        return {**result, "status": "unsupported", "reasons": ["当前仅支持物种、MAG 与参考菌属对象；KO/AMP 等待真实功能归属链。"]}
    except (SQLAlchemyError, pymysql.MySQLError, sqlite3.DatabaseError, OSError, ValueError, TypeError):
        return {**result, "status": "source_unavailable", "reasons": ["主对象数据暂不可读取；外部参考目录仍可使用。"]}


def evidence_summary(data: reference.ReferenceDataset, genus: str, source_revision: str = "",
                     dataset_slug: str = "ad-nc-species") -> dict[str, Any]:
    if genus not in data.genera:
        raise ValueError("参考菌属不存在于当前版本。")
    rows = []
    audits = analysis.audit_catalog(data)["items"]
    research = ledger.research_ledger(data, {a["projectId"]: a for a in audits})
    records = {r["projectId"]: r for r in research["records"]}
    for audit in audits:
        cohort = audit["projectId"]
        statistics = analysis.cohort_statistics(data, cohort)
        statistic = next((r for r in statistics["items"] if r["genus"]["featureId"] == genus), None)
        rows.append({"projectId": cohort, "audit": audit, "statistic": statistic, "researchRecord": records[cohort],
                     "rankBiserialCi": analysis.rank_effect_interval(data, cohort, genus) if statistic else None,
                     "sourceMarkers": analysis.source_markers(data, cohort, genus),
                     "independenceStatus": "not_reviewed_between_studies" if records[cohort]["capabilities"]["independence"]["status"] == "pending" else records[cohort]["capabilities"]["independence"]["status"], "platform": "16S 属级参考"})
    eligible = [r for r in rows if r["statistic"] is not None]
    directions = Counter(r["statistic"]["direction"] for r in eligible)
    supported = sum(r["statistic"]["qValue"] < .05 for r in eligible)
    rules = protocol(data)
    observations = [
        {"id": "scope", "text": f"{len(rows)} 个队列可展示分布，{len(eligible)} 个队列具有当前队列内检验结果。", "evidenceIds": [r["projectId"] for r in rows]},
        {"id": "results", "text": f"未调整结果：AD 偏高 {directions['AD']} 项、NC 偏高 {directions['NC']} 项、无明确方向 {directions['equal']} 项；其中 {supported} 项获 FDR 支持。未获支持不代表没有关联。", "evidenceIds": [r["projectId"] for r in eligible]},
        {"id": "independence", "text": "研究间及主外队列重叠尚未全部核查，不报告独立验证数量。来源 LDA 和调整前后模型不重复计票。", "evidenceIds": [r["projectId"] for r in rows]},
    ]
    main = primary.primary_evidence(data.genera[genus], source_revision, dataset_slug)
    from app.services.external_wgs_service import object_background

    return {"provenance": reference.provenance(data), "genus": data.genera[genus], "cohorts": rows,
            "methods": analysis.METHODS, "familySize": len(data.genera), "protocol": rules, "researchLedger": research,
            "summary": {"rulesVersion": rules["rulesVersion"], "plotCohorts": len(rows),
                        "testableCohorts": len(eligible), "fdrSupportedCohorts": supported,
                        "directions": dict(directions), "observations": observations,
                        "replicationStatus": "not_established"}, "primary": main,
            "claims": explanations.cohort_claims(rows, data.fingerprint, len(data.genera)),
            "wgsReference": object_background(data.genera[genus]["name"]), "generatedAt": datetime.now(UTC).isoformat()}


def markdown_report(record: dict[str, Any], subject: dict | None = None, context: dict | None = None) -> str:
    lines = [f"# 外部证据评估：{record['genus']['name']}", "", f"生成时间：{record['generatedAt']}",
             f"参考版本：{record['provenance']['version']} / {record['provenance']['fingerprint']}",
             f"方法版本：{record['methods']['version']}", f"规则版本：{record['summary']['rulesVersion']}", ""]
    if subject:
        lines += [f"主对象：{subject['subjectType']} / {subject['subjectId']}", f"主版本：{subject['sourceRevision']}",
                  f"关联层级：{subject['mappingLevel']}", ""]
    if context:
        lines += ["## 来源可视化上下文（不改变外部检验分母）", "```json\n" + json.dumps(context, ensure_ascii=False, indent=2) + "\n```", ""]
    lines += [o["text"] for o in record["summary"]["observations"]]
    wgs = record.get("wgsReference", {})
    if wgs.get("distribution"):
        lines += ["", "## WGS 相关阶段背景（原研究直接来源，不计 GMrepo 或独立 AD/NC 验证）", wgs["mappingMethod"],
                  f"项目 {wgs['catalog']['projectId']}；版本 {wgs['catalog']['fingerprint']}；来源 {wgs['catalog']['sourceUrl']}"]
        lines += [f"- {r['group']}：{r['count']} 人，中位相对丰度 {r['median']}%，检出 {r['detected']} 人；无 WGS p/q。" for r in wgs["distribution"]["groups"]]
    if record.get("claims"):
        lines += ["", "## 对象相关解释（逐项绑定结果与比较范围）"]
        lines += [f"- [{c['claimId']}] {c['text']} 依据：{', '.join(c['evidenceRefs'])}；规则 {c['rulesVersion']}" for c in record["claims"]]
    lines += ["", "|队列|AD/NC Run|检验资格|方向|未调整 q|原研究|", "|---|---|---|---|---|---|"]
    for row in record["cohorts"]:
        audit, stat = row["audit"], row["statistic"]
        lines.append(f"|{row['projectId']}|{audit['groupCounts'].get('AD', 0)}/{audit['groupCounts'].get('NC', 0)}|{audit['unadjustedStatus']}|{stat['direction'] if stat else '暂缓'}|{stat['qValue'] if stat else '未提供'}|{audit['sourceUrl'] or '未关联'}|")
        if stat:
            lines += [f"{row['projectId']}：未调整秩效应 {stat['rankBiserial']}；95% CI {row.get('rankBiserialCi')}；p={stat['pValue']}；q={stat['qValue']}。",
                      f"年龄/性别调整（完整病例 {audit['adjustedCount']}）：{json.dumps(stat['adjusted'], ensure_ascii=False)}。"]
    research = record.get("researchLedger")
    if research:
        lines += ["", "## 研究登记与待补证据", f"登记版本：{research['version']} / {research['registryFingerprint']}",
                  f"来源清单指纹：{research['discoveryFingerprint']}",
                  f"登记绑定：{research['registryStatus']}；来源清点：{research['discoveryStatus']}；科研复核：{research['scientificReviewStatus']}",
                  "登记是回顾性整理，不是预注册；项目 accession 不等于独立研究。"]
        coverage = research.get("scope", {}).get("completedDiscoveryCoverage", {})
        keyword_scope = coverage.get("keywordScope", {})
        if coverage:
            lines += [f"表型范围：{coverage['uniqueRuns']} 条去重 Run；综合来源目录 {coverage['uniqueProjects']} 项。", coverage["scope"]]
        if keyword_scope:
            lines += [f"项目描述检索：{keyword_scope['projectsScreened']} / 源端总计 {keyword_scope['sourceTotalProjects']} 项；关键词命中 {keyword_scope['matches']} 项；未返回 {keyword_scope['notReturnedProjects']} 项。",
                      keyword_scope["note"]]
        for row in record["cohorts"]:
            audit = row["audit"]
            lines += [f"### {row['projectId']}", f"未调整：{audit['unadjustedStatus']}；调整：{audit['adjustedStatus']}",
                      f"全部 Run 集合：{audit['allRunSetSha256']}", f"分布 Run 集合：{audit['plotRunSetSha256']}",
                      f"调整完整病例集合（{audit['adjustedCount']} Run）：{audit['adjustedRunSetSha256']}"]
            study = row["researchRecord"]
            lines += [f"筛查去向：{study['screening'].get('status')}；{study['screening'].get('note') or '待补'}",
                      f"比较内容指纹：{study['comparison']['contentFingerprint']}"]
            lines += [f"- 字段 {key}：{json.dumps(field['value'], ensure_ascii=False)}；状态 {field['status']}；定位 {field.get('locator') or '见来源引用'}；依据 {', '.join(field['evidenceRefs']) or '待补'}"
                      for key, field in study["fields"].items() if field["value"] is not None]
            lines += [f"- 核查依据 {r['reviewId']}：{r['decision']}；生效检查 {r.get('validationStatus', 'legacy_scope')}；适用说明 {r.get('note') or '见引用依据'}"
                      for r in study["reviews"]]
            lines += [f"- [{b['reasonCode']}] {b['message']} 影响：{', '.join(b['affects'])}。缺：{b['missingEvidence']} 下一步：{b['nextAction']} 依据：{', '.join(b['evidenceRefs']) or '待补'}"
                      for b in row["researchRecord"]["blockers"] if b["reasonCode"] != "SCIENTIFIC_REVIEW_PENDING"]
        lines += ["### 来源获取回执", *[f"- {r.get('method')} {r.get('url')}；请求范围 {json.dumps(r.get('body'), ensure_ascii=False)}；状态 {r.get('status')}；读回 {r.get('availability')}；获取 {r.get('retrievedAt')}；文件 {r.get('archivePath')}/{r.get('file')}；SHA256 {r.get('sha256')}"
                                      for r in research["acquisitions"]]]
        lines += ["### 研究字段与审查依据原件", *[f"- {r['sourceId']}：{r['url']}；{r['availability']}；{r['path']}；SHA256 {r['sha256']}"
                                             for r in research.get("sourceChecks", [])]]
    main = record["primary"]
    main_comparison = main.get("genusComparison", {})
    if main_comparison.get("statistic"):
        stat = main_comparison["statistic"]
        lines += ["", "## 主队列同属结果", f"属级派生版本：{main_comparison['fingerprint']}；完整检验族 {main_comparison['familySize']} 属。",
                  f"AD/NC：{stat['adCount']}/{stat['ncCount']}；秩效应 {stat['rankBiserial']}；95% CI {main_comparison['rankBiserialCi']}；p={stat['pValue']}；q={stat['qValue']}。",
                  f"调整结果：{json.dumps(stat['adjusted'], ensure_ascii=False)}；完整病例 {main_comparison['adjustedCount']}。",
                  main_comparison["provenance"]["identityBasis"], main_comparison["note"]]
    context = main.get("cohortEvidence", {})
    if context.get("status") == "source_bound":
        lines += ["", "## 主队列来源与纳入依据", context["selection"], context["participantNote"], context["crossCohortNote"],
                  f"公开受试者 ID 覆盖：{context['participantIdsAvailable']}/{context['sampleCount']}；未作逐人验证。",
                  f"来源说明指纹：{context['fingerprint']}", context["pipelineNote"],
                  *[f"- {s['sourceId']}：{s['url']}；SHA256 {s['sha256']}" for s in context["sources"]]]
    if main.get("status") == "available":
        lines += ["", f"主矩阵版本：{main['datasetRevision']}；单位：{main['abundanceScale']}；标准化：{main['normalization']}。"]
    lines += ["", "## 方法和解释范围", record["methods"]["unadjusted"], record["methods"]["adjusted"], record["methods"]["fdr"],
              *record["methods"]["limits"], "", "## 主数据比较的适用范围", *main["reasons"],
              "", f"属级外部背景不认证物种/MAG/功能复现。科研复核状态：{record.get('researchLedger', {}).get('scientificReviewStatus', 'pending')}，不构成临床或因果结论。", ""]
    return "\n\n".join(lines)
