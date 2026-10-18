"""Whole-family candidate catalog and frozen multi-candidate comparisons."""
from __future__ import annotations

from datetime import UTC, datetime

from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_primary_genus as primary
from app.services import gmrepo_service as reference


def normalized(value):
    return " ".join(value.replace("_", " ").split()).casefold()


def catalog(data: reference.ReferenceDataset, revision="", dataset_slug="ad-nc-species") -> dict:
    derived = primary.snapshot(revision, dataset_slug)
    external = {r["projectId"]: analysis.cohort_statistics(data, r["projectId"]) for r in analysis.audit_catalog(data)["items"]}
    names = {}
    for genus in data.genera.values():
        for name in {genus["name"], *genus["sourceNames"]}:
            names.setdefault((genus["domain"], normalized(name)), set()).add(genus["featureId"])
    matches = {}
    for row in derived["statistics"]["items"]:
        for fid in names.get((row["genus"]["domain"], normalized(row["genus"]["sourceGenus"])), set()):
            matches.setdefault(fid, []).append(row["genus"]["featureId"])
    external_rows = {pid: {r["genus"]["featureId"]: r for r in value["items"]} for pid, value in external.items()}

    def comparison_row(candidate_id, title, main, genus, status):
        cohorts = [{"projectId": pid, "status": value["audit"]["unadjustedStatus"],
                    "statistic": external_rows[pid].get(genus["featureId"]) if genus else None,
                    "note": "同属队列内结果，参与者跨队列关系未确认。" if genus else "无唯一分类对应，未代入其他参考属。"} for pid, value in external.items()]
        signs = [r["statistic"]["direction"] for r in cohorts if r["statistic"]]
        note = "暂无主外可比较结果。"
        if main and genus and status == "mapped":
            if main["direction"] == "equal":
                note = "主队列秩效应为零；不等同于证明没有关联。"
            elif any(s not in {main["direction"], "equal"} for s in signs):
                note = "主外结果存在方向不一致；需结合区间、分组与处理差异解释。"
            elif signs:
                note = "当前可计算结果的方向可并列核对；同向、FDR 支持和独立验证分别判断。"
        return {"candidateId": candidate_id, "name": title, "primaryStatistic": main, "referenceGenus": genus, "mappingStatus": status,
                "cohorts": cohorts, "interpretation": note}

    items, used = [], set()
    for row in derived["statistics"]["items"]:
        f = row["genus"]
        ids = names.get((f["domain"], normalized(f["sourceGenus"])), set())
        genus = data.genera[next(iter(ids))] if len(ids) == 1 else None
        status = "mapped" if genus and len(matches[genus["featureId"]]) == 1 else "ambiguous" if ids else "unmapped"
        if status == "mapped":
            used.add(genus["featureId"])
        items.append(comparison_row(f["featureId"], f["name"], row, genus if status == "mapped" else None, status))
    for genus in data.genera.values():
        if genus["featureId"] not in used:
            items.append(comparison_row(genus["featureId"], genus["name"], None, genus, "reference_only"))
    items.sort(key=lambda r: (r["name"].casefold(), r["candidateId"]))
    return {"provenance": reference.provenance(data), "primaryDerivative": {"fingerprint": derived["fingerprint"], "provenance": derived["provenance"]},
            "primaryFamilySize": derived["statistics"]["familySize"], "externalFamilySize": len(data.genera),
            "cohorts": [{"projectId": pid, "audit": value["audit"]} for pid, value in external.items()], "items": items,
            "mappingCounts": {state: sum(r["mappingStatus"] == state for r in items) for state in ("mapped", "unmapped", "ambiguous", "reference_only")},
            "note": "完整检验族在候选筛选前计算；未知分类与参考独有属均可检索。主/外样本不合并，不计独立支持票数。"}


def evaluate(data: reference.ReferenceDataset, candidate_ids: list[str], revision="", dataset_slug="ad-nc-species") -> dict:
    if not candidate_ids or len(candidate_ids) != len(set(candidate_ids)) or len(candidate_ids) > 2000:
        raise ValueError("Select distinct candidates from the current full catalog (1–2000).")
    result = catalog(data, revision, dataset_slug)
    index = {r["candidateId"]: r for r in result["items"]}
    if any(fid not in index for fid in candidate_ids):
        raise ValueError("Some candidates are not in the bound catalog; no default substitution.")
    from app.services.gmrepo_primary_evidence import cohort_context

    record = {**result, "kind": "candidate_comparison", "items": [index[fid] for fid in candidate_ids], "selection": candidate_ids,
              "generatedAt": datetime.now(UTC).isoformat(), "protocol": ledger.runtime_protocol(data),
              "researchLedger": ledger.research_ledger(data, {r["projectId"]: r["audit"] for r in result["cohorts"]}),
              "primary": {"cohortEvidence": cohort_context()}}
    from app.services import gmrepo_snapshot_service as snapshots

    fixed = snapshots.freeze(record)
    return {**fixed, "currentStatus": snapshots.current_status(fixed, data)}


def report(package: dict) -> str:
    record = package["payload"]["evaluation"]
    if record.get("kind") != "candidate_comparison":
        raise ValueError("This is not a candidate comparison evaluation.")
    lines = ["# 多候选外部证据对照", f"评估 ID：{package['evaluationId']}", f"参考版本：{record['provenance']['fingerprint']}",
             f"主属级版本：{record['primaryDerivative']['fingerprint']}",
             f"完整检验族：主队列 {record['primaryFamilySize']} 属；各外部队列 {record['externalFamilySize']} 属。", record["note"],
             "|候选|队列|方向|秩效应|p|q|年龄/性别调整|", "|---|---|---|---|---|---|---|"]
    for candidate in record["items"]:
        rows = [("主队列", candidate["primaryStatistic"]), *[(r["projectId"], r["statistic"]) for r in candidate["cohorts"]]]
        for name, row in rows:
            if row:
                a = row["adjusted"]
                adjusted = f"{a['effect']} [{a['ciLow']}, {a['ciHigh']}]; q={a['qValue']}" if a else "未估计"
                lines.append(f"|{candidate['name']}|{name}|{row['direction']}|{row['rankBiserial']}|{row['pValue']}|{row['qValue']}|{adjusted}|")
            else:
                lines.append(f"|{candidate['name']}|{name}|无可比较结果|—|—|—|—|")
        lines += [f"\n{candidate['name']}：分类状态 {candidate['mappingStatus']}；{candidate['interpretation']}"]
    lines += ["", record["primaryDerivative"]["provenance"]["identityBasis"],
              "同向不等于通过 FDR；未显著不代表没有关联；当前未认证跨队列参与者独立，不形成临床、致病/保护或因果结论。"]
    return "\n\n".join(lines)
