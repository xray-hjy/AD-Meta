"""Mechanically enrich a candidate ledger from archived, hash-verified source records.

Never signs reviews or changes inference/group rules. Produces a candidate only.
"""
import argparse
import hashlib
import json
import xml.etree.ElementTree as ET
from copy import deepcopy
from pathlib import Path

from app.cli.inventory_gmrepo import write_json
from app.core.config import BACKEND_ROOT
from app.services.gmrepo_ledger_models import ResearchRegistry


def candidate(output: Path) -> dict:
    if output.exists():
        raise ValueError("Candidate output must be new")
    root = BACKEND_ROOT.parent
    payload = json.loads((BACKEND_ROOT / "metadata/gmrepo_research_registry.json").read_bytes())
    payload = deepcopy(payload)
    payload["version"] = "gmrepo-research-ledger-2026-10-16-v3"
    payload["recordedOn"] = "2026-10-16"
    batches = [root / f"ADMetaData/reference/gmrepo/release-sources/2026-10-15-v{i}" for i in (1, 2, 4)]
    sources = {s["sourceId"]: s for s in payload["sources"]}
    projects = {p["projectId"]: p for p in payload["projects"]}
    assessments = []
    for batch in batches:
        for item in json.loads((batch / "receipts.json").read_bytes())["records"]:
            pid = item.get("projectId")
            if pid not in projects or item["status"] != "source_record_unreviewed" or item.get("kind") not in {"project", "paper_candidate", "paper", "run_export"}:
                continue
            receipt = item["receipt"]
            raw = (batch / receipt["file"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != receipt["sha256"] or len(raw) != receipt["bytes"]:
                raise ValueError("Cannot consume changed acquisition evidence")
            sid = f"release-{item['kind']}-{pid}"
            sources[sid] = {"sourceId": sid, "url": receipt["url"], "path": (batch / receipt["file"]).relative_to(root).as_posix(),
                            "sha256": receipt["sha256"], "bytes": receipt["bytes"], "origin": "new_acquisition", "retrievedAt": receipt["retrievedAt"]}
            link = projects[pid]
            facts = link.setdefault("facts", {})
            def fact(key, value, locator, target=facts, source_id=sid):
                target[key] = {"value": value, "evidenceRefs": [source_id], "locator": locator, "recordedOn": "2026-10-16"}
            if item["kind"] == "project":
                fact("projectTitle", item["title"], "ENA PROJECT/TITLE or STUDY/STUDY_TITLE; project record, not automatically the paper title")
                fact("projectDescription", item["description"] or "项目记录未提供描述", "ENA PROJECT/DESCRIPTION or STUDY/STUDY_ABSTRACT")
            elif item["kind"] == "paper_candidate":
                hit = item["candidates"][0] if len(item.get("candidates", [])) == 1 else None
                if hit:
                    fact("bibliography", f"{hit['title']} ({hit['firstPublicationDate']}); PMID {hit['id']}; PMCID {hit.get('pmcid') or '本次未提供'}", "Europe PMC resultList/result; bibliographic candidate association inherited from sealed rules, not new scientific approval")
                    if not hit.get("pmcid"):
                        fact("fullTextAcquisition", "本轮取得题录及摘要；Europe PMC 未提供 PMCID，尚未取得原全文/补充表。不能据此认定没有公开资料。", "Europe PMC resultList/result/pmcid, isOpenAccess and fullTextUrlList")
            elif item["kind"] == "paper":
                tree = ET.fromstring(raw)
                if item.get("accessionMentioned"):
                    fact("studyTitle", item["title"], "article/front/article-meta/title-group/article-title; project accession explicitly present in archived article")
                    link["studyId"] = f"study:paper:{Path(receipt['file']).stem}"
                    link["originalStudyUrl"] = f"https://pmc.ncbi.nlm.nih.gov/articles/{Path(receipt['file']).stem}/"
                    link["evidenceRefs"] = sorted(set(link.get("evidenceRefs", [])) | {sid})
                captions = [" ".join("".join(s.itertext()).split()) for s in tree.findall(".//supplementary-material")]
                if captions:
                    fact("supplementCatalog", list(dict.fromkeys(captions)), "article//supplementary-material/caption; catalogue inspected, attachments not all acquired/parsed")
                if pid == "PRJEB50447":
                    fact("clinicalAccessRestriction", "原论文明确：临床个体资料不自由公开，需合理申请并获 Seoul National University Hospital IRB 批准；本轮未外发申请。", "Data Availability Statement: clinical information not freely accessible owing to ethics/privacy restrictions")
                if pid == "PRJNA633959":
                    fact("participantEvidence", "原论文附录目录为菌群组成/热图/炎症因子图；本轮尚无可逐条连接 171 个实验别名的参与者身份表，共享 BioSample 不按 171 名独立人放行。", "Supplementary Material captions; fixed cohort_rules identity_rule; no participant map supplied in inspected catalogue")
            elif item["kind"] == "run_export":
                fact("registeredLibraryStrategy", item["strategies"], "ENA read_run export/library_strategy; OTHER is not inferred to be WGS")
                fact("publicRunCount", f"本批 ENA 项目导出 {item['count']} Run；不是当前图表分母或独立参与者数。", "ENA read_run export; includes all materials/experiments in project")
            assessments.append({"projectId": pid, "kind": item["kind"], "sourceId": sid, "status": "sourced_pending_scientific_review"})
    payload["sources"] = list(sources.values())
    for key, relative, url in (
        ("primary-sample-map", "backend/storage/provenance/CRA014435/2026-10-01/samples_current185.tsv", "https://ngdc.cncb.ac.cn/gsa/browse/CRA014435"),
        ("primary-import-manifest", "backend/storage_manifest.json", "https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA022804"),
        ("primary-transfer-audit", "docs/guides/server-transfer-audit.md", "https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA022804"),
        ("primary-script-audit", "docs/guides/bioinformatics-script-provenance.md", "https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA022804")):
        raw = (root / relative).read_bytes()
        sources[key] = {"sourceId": key, "url": url, "path": relative, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "origin": "local_project_record"}
    payload["sources"] = list(sources.values())
    annotations = json.loads((BACKEND_ROOT / "metadata/gmrepo_release_annotations.json").read_bytes())
    for pid, facts in annotations["projects"].items():
        for key, item in facts.items():
            projects[pid].setdefault("facts", {})[key] = {"value": item["value"], "evidenceRefs": [item["source"]], "locator": item["locator"], "recordedOn": annotations["recordedOn"]}
    ResearchRegistry.model_validate(payload)
    output.mkdir(parents=True)
    write_json(output / "registry-candidate.json", payload)
    write_json(output / "preparation.json", {"status": "candidate_only", "baseSha256": hashlib.sha256((BACKEND_ROOT / "metadata/gmrepo_research_registry.json").read_bytes()).hexdigest(),
                                           "records": assessments, "reviewsSigned": 0, "inferenceChanges": 0,
                                           "note": "Paper attachment catalogue checks do not certify participant identity; no human review was fabricated."})
    return {"projects": len(projects), "sources": len(sources), "projectTitles": sum("projectTitle" in p.get("facts", {}) for p in projects.values())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print(json.dumps(candidate(parser.parse_args().output), ensure_ascii=False))
