"""Publish an audited acquisition supplement, without changing sealed statistical inputs."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import BACKEND_ROOT
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_service as reference
from app.services.gmrepo_ledger_models import ResearchRegistry

ROOT = BACKEND_ROOT.parent
COMPLETE = ROOT / "ADMetaData/reference/gmrepo/complete"


def encoded(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")


def prepare(output: Path, publish=False):
    if output.exists():
        raise ValueError("Choose a new immutable release directory")
    output.mkdir(parents=True)
    data = reference.load_reference_dataset()
    previous = ledger.REGISTRY_PATH.read_bytes()
    payload = json.loads(previous)
    found_raw = ledger.DISCOVERY_PATH.read_bytes()
    found = json.loads(found_raw)
    if payload["referenceFingerprint"] != data.fingerprint or found["referenceFingerprint"] != data.fingerprint:
        raise ValueError("Reference version changed; no source supplement published")
    (output / "previous-registry.json").write_bytes(previous)
    (output / "previous-discovery.json").write_bytes(found_raw)
    sources = {s["sourceId"]: s for s in payload["sources"]}

    def register(sid, path, url, origin="new_acquisition"):
        raw = path.read_bytes()
        sources[sid] = {"sourceId": sid, "path": path.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
                        "url": url, "origin": origin, "retrievedAt": datetime.now(UTC).isoformat()}
        return sid

    acquired = {}
    for batch in ("2026-10-17-acquisition-v1", "2026-10-17-followup-v1", "2026-10-17-sample-tables-v1", "2026-10-17-sample-tables-v2", "2026-10-17-recovered-projects-v1"):
        folder = COMPLETE / batch
        receipt = json.loads((folder / "receipts.json").read_bytes())
        register("complete-receipts-" + batch, folder / "receipts.json", "https://gmrepo.humangut.info/")
        for row in receipt["records"]:
            if row.get("status") != "retrieved" or row.get("validation") == "unavailable_or_invalid" or not row.get("sha256"):
                continue
            path = folder / row["file"]
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != row["sha256"] or len(raw) != row["bytes"]:
                raise ValueError("Acquired source failed readback")
            sid = "complete-" + row["file"]
            register(sid, path, row["url"])
            acquired[row["file"]] = (sid, path)
    inventory_path = COMPLETE / "2026-10-17-inventory/reconciliation.json"
    inventory = json.loads(inventory_path.read_bytes())
    if not inventory["paginationComplete"] or not inventory["uniqueRunCountMatches"] or inventory["duplicateExactRows"]:
        raise ValueError("All-run pagination is not reconciled")
    for row in inventory["records"]:
        path = (BACKEND_ROOT / row["archivePath"] / row["file"]).resolve()
        raw = path.read_bytes()
        if not path.is_relative_to(ROOT) or hashlib.sha256(raw).hexdigest() != row["sha256"] or len(raw) != row["bytes"]:
            raise ValueError("Inventory page integrity mismatch")
    inventory_ref = register("complete-all-run-inventory", inventory_path, "https://gmrepo.humangut.info/api/getAllRunsAsync/")
    audits = []
    now = "2026-10-17"
    for project in payload["projects"]:
        pid = project["projectId"]
        facts = project.setdefault("facts", {})
        file = pid + "-samples.tsv"
        if file not in acquired:
            continue
        sid, path = acquired[file]
        with path.open(encoding="utf-8-sig") as stream:
            rows = list(csv.DictReader(stream, delimiter="\t"))
        keys = {key for r in rows for key in (r.get("accession"), r.get("sample_accession"), r.get("secondary_sample_accession")) if key}
        selected = [s for s in data.samples if s["project_id"] == pid]
        matched = sum(s.get("biosample_accession") in keys for s in selected)
        field_names = ("disease", "host_phenotype", "host_status", "age", "host_sex", "sex", "collection_date", "sample_alias", "host_body_site", "environment_material")
        audit = {"projectId": pid, "publicSampleRows": len(rows), "uniqueAccessions": len({r.get("accession") or r.get("sample_accession") for r in rows}),
                 "currentMetadataRuns": len(selected), "matchedBioSampleRuns": matched,
                 "nonemptyFields": {key: sum(bool(r.get(key)) for r in rows) for key in field_names},
                 "participantIdentity": "not_certified_by_sample_alias_or_unique_biosample", "sourceId": sid}
        audits.append(audit)
        facts["sampleSourceCheck"] = {"value": f"公开样本表 {len(rows)} 行；当前固定包 {len(selected)} Run，BioSample 精确对应 {matched} 条。样本别名和唯一 BioSample 不自动当作参与者 ID。",
                                      "evidenceRefs": [sid], "locator": "ENA sample portal all returned fields; exact accession join; full missing-field counts in complete-sample-audit", "recordedOn": now}
        details = acquired.get(pid + "-gmrepo.json")
        if details:
            d = json.loads(details[1].read_bytes())["project"]
            facts["currentGmrepoAvailability"] = {"value": f"官方项目详情：{d.get('Number_of_runs')} Run；QC valid {d.get('valid_runs')}，failed {d.get('failed_runs')}；此数不代表具有疾病或参与者映射。",
                                                  "evidenceRefs": [details[0]], "locator": "project.Number_of_runs/valid_runs/failed_runs; endpoint-specific values supersede old overview, original overview retained", "recordedOn": now}
    sample_path = output / "sample-audit.json"
    sample_path.write_bytes(encoded({"records": audits, "note": "全部相关项目使用同一字段与精确 accession 连接核查；未根据别名外观生成参与者或疾病。"}))
    audit_ref = register("complete-sample-audit", sample_path, "https://www.ebi.ac.uk/ena/portal/api/search", "local_project_record")
    projects = {p["projectId"]: p for p in payload["projects"]}
    p = projects["PRJEB55056"]
    p.update(screeningStatus="insufficient_information", screeningNote="原研究为 CI-AD、CI-NAD、CU 阶段比较；公开 72 样本、GMrepo QC 合格 42/失败 30。D065626 在源端词典为非酒精性脂肪肝，与原研究冲突，不据此划分 AD/NC。取得 72 条原库样本信息，但缺临床分组映射；批量丰度接口返回错误。未纳入二分类分母。",
             screeningEvidenceRefs=["complete-PRJEB55056-gmrepo.json", "complete-PRJEB55056-samples.tsv", "complete-PMC10230724.xml", "complete-receipts-2026-10-17-followup-v1"])
    p["facts"]["stageDefinition"] = {"value": ["CI-AD：淀粉样蛋白阳性认知损害", "CI-NAD：淀粉样蛋白阴性认知损害", "CU：认知未损害、淀粉样蛋白阴性"],
                                    "evidenceRefs": ["complete-PMC10230724.xml"], "locator": "Methods / Subjects; original 85 participants differs from sequenced/QC denominators", "recordedOn": now}
    p["facts"]["sourceReuse"] = {"value": "2023 与 2025 论文引用同一 PRJEB55056；不作为两个独立队列计数。", "evidenceRefs": ["complete-PMC10230724.xml", "complete-PMC11936893.xml"], "locator": "Data availability / accession PRJEB55056 in both full texts", "recordedOn": now}
    p = projects["PRJNA665245"]
    p.update(screeningStatus="insufficient_information", screeningNote="纵向 WGS 项目，原描述含基线/6月/12月。最新项目详情为 81 Run 且 QC valid=81，修正总览旧值 0；ENA 取得 81 条样本记录，但缺疾病、逐人及访视对应。subject_* 为样本别名，不据此任选首条当基线。丰度接口返回错误，当前不开放独立两组检验或分布。",
             screeningEvidenceRefs=["complete-PRJNA665245-gmrepo.json", "complete-PRJNA665245-samples.tsv", "complete-SAMN16247262-biosamples.json", "complete-receipts-2026-10-17-sample-tables-v2"])
    for pid, note in {
        "PRJNA554111": "本轮取得 86 条原库样本信息，别名和年龄不能恢复逐人重复关系；保留现有分布，未放行独立两组检验。",
        "PRJNA633959": "本轮原库样本表仅 1 条公共 BioSample，对应多实验的逐人关系仍缺失；不可将共享 BioSample 合并成一人或认定为 171 名独立参与者。",
        "PRJNA770746": "本轮取得 198 条原库样本信息；粪便与口腔保留原材料边界，样本别名不能认证口腔—粪便—参与者对应；继续保留仅分布用途。",
    }.items():
        projects[pid]["screeningNote"] = note
        projects[pid]["screeningEvidenceRefs"] = ["sealed-rules", "complete-" + pid + "-samples.tsv", audit_ref]
    payload.update(version="gmrepo-research-ledger-2026-10-17-v6", sources=sorted(sources.values(), key=lambda r: r["sourceId"]))
    ResearchRegistry.model_validate(payload)
    checks = ledger.source_checks(data, ResearchRegistry.model_validate(payload))
    if any(c["availability"] != "verified" for c in checks):
        raise ValueError("Some registered originals are not verified")
    coverage = found.setdefault("coverage", {})
    coverage["allRunInventory"] = {k: inventory[k] for k in ("retrievedRows", "uniqueRuns", "multiLabelRuns", "retrievedProjects", "sourceProjects", "descriptionProjects", "unionProjects", "paginationComplete", "uniqueRunCountMatches", "projectsMissingFromDescriptionCatalog")}
    coverage["allRunInventory"].update(sourceRef=inventory_ref, unrecoveredProjectIdentities=inventory["sourceProjects"] - inventory["unionProjects"],
                                     recoveredDescriptionStatus="五项已补取项目详情；四项为自闭症研究，一项重新测序描述不含本次关键词，均未形成新增 AD 候选。", note=inventory["note"])
    recovered = []
    import re

    pattern = r"alzheimer|mild cognitive|preclinical|dementia|cognitive decline|subjective cognitive|cognitive dysfunction"
    for pid in inventory["projectsMissingFromDescriptionCatalog"]:
        sid, path = acquired[pid + "-project.json"]
        description = json.loads(path.read_bytes())["project"].get("Original_Project_description") or ""
        hit = bool(re.search(pattern, description, re.I))
        if hit:
            raise ValueError("Recovered project has a new candidate context; adjudicate before publication")
        recovered.append({"projectId": pid, "sourceId": sid, "description": description, "keywordMatch": False,
                          "disposition": "outside_scope_autism" if re.search(r"autism|\bASD\b", description, re.I) else "no_ad_keyword_in_resequencing_description",
                          "note": "仅判定所列来源描述的检索去向；无命中不等于证明研究与 AD 毫无关系。"})
    coverage["recoveredProjectScreening"] = recovered
    keyword = coverage["keywordScope"]
    keyword.update(originalDescriptionResponse=1238, recoveredDescriptions=len(recovered), projectsScreened=1238 + len(recovered), notReturnedProjects=106)
    coverage["sourceCorrections"] = ["Run × 表型分页到末页 188061 行，去重 184045 Run。", "PRJNA665245 项目详情 QC valid=81；旧总览 0 保留为源端字段冲突。", "PRJEB55056 D065626 标签与原研究冲突；不改标为 AD/NC。"]
    found["retrievedAt"] = datetime.now(UTC).isoformat()
    registry_candidate, discovery_candidate = output / "registry.json", output / "discovery.json"
    registry_candidate.write_bytes(encoded(payload))
    discovery_candidate.write_bytes(encoded(found))
    summary = {"registryVersion": payload["version"], "sources": len(checks), "projects": len(projects), "sampleTables": len(audits),
               "referenceFingerprint": data.fingerprint, "inventory": coverage["allRunInventory"], "newStatisticallyEligibleCohorts": 0,
               "note": "新增来源没有补齐分组/逐人/丰度条件；不为扩充规模篡改统计资格或覆盖旧处理包。"}
    (output / "summary.json").write_bytes(encoded(summary))
    if publish:
        ledger.REGISTRY_PATH.write_bytes(registry_candidate.read_bytes())
        ledger.DISCOVERY_PATH.write_bytes(discovery_candidate.read_bytes())
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--publish", action="store_true")
    args = p.parse_args()
    prepare(args.output.resolve(), args.publish)
