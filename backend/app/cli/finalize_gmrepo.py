"""Freeze current provenance and bounded discovery for a GMrepo release.

Produces a new candidate with original bytes, change history and no new review
decisions. Publication is explicit and validates sources before moving indexes.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

from app.cli.inventory_gmrepo import publish_candidate, write_json
from app.core.config import BACKEND_ROOT
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_service as reference
from app.services.gmrepo_ledger_models import ResearchRegistry

ROOT = BACKEND_ROOT.parent
CONTEXT_PATH = BACKEND_ROOT / "metadata/gmrepo_primary_context.json"


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def prepare(output: Path, discovery_batch: Path) -> dict:
    if output.exists():
        raise ValueError("Choose a new batch directory; existing records are preserved.")
    data = reference.load_reference_dataset()
    base = ledger.REGISTRY_PATH.read_bytes()
    payload = json.loads(base)
    discovery = json.loads((discovery_batch / "registry.json").read_bytes())
    if discovery["referenceFingerprint"] != data.fingerprint:
        raise ValueError("Discovery is bound to another reference version.")
    output.mkdir(parents=True)
    (output / "previous-registry.json").write_bytes(base)
    sources = {s["sourceId"]: s for s in payload["sources"]}
    history = []

    def register(sid: str, path: Path, raw: bytes, url: str, origin="local_project_record"):
        sources[sid] = {"sourceId": sid, "url": url, "origin": origin,
                        "path": path.relative_to(ROOT).as_posix(), "sha256": sha(raw), "bytes": len(raw),
                        "retrievedAt": datetime.now(UTC).isoformat()}

    # Mutable project documents must not invalidate a sealed evidence source.
    for sid in ("primary-sample-map", "primary-import-manifest", "primary-transfer-audit", "primary-script-audit"):
        old = sources[sid]
        raw = (ROOT / old["path"]).read_bytes()
        target = output / (sid + Path(old["path"]).suffix)
        target.write_bytes(raw)
        history.append({"sourceId": sid, "previous": old, "currentSha256": sha(raw),
                        "changedSincePreviousRegistration": sha(raw) != old["sha256"]})
        register(sid, target, raw, old["url"])

    jobs = [
        ("primary-paper-record", "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:40164697%20AND%20SRC:MED&format=json&resultType=core", "primary-paper.json"),
        ("primary-author-description", "https://raw.githubusercontent.com/JiaLonghao1997/metaAD_analysis/main/README.md", "primary-author-readme.md"),
        ("primary-ngdc-project", "https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA022804", "primary-project.html"),
        ("gmrepo-project-selector", "https://gmrepo.humangut.info/api/getCuratedProjectsList/", "curated-projects.json"),
        ("gmrepo-project-export", "https://gmrepo.humangut.info/Downloads/AllSummaryData/all_projects_metadata.tsv.gz", "all-projects.tsv.gz"),
        ("gmrepo-all-projects", "https://gmrepo.humangut.info/api/getAllProjectsWithMetadataAndSomeStatistics/", "all-projects.json"),
    ]

    def acquire(job):
        sid, url, name = job
        row = {"sourceId": sid, "url": url, "file": name, "retrievedAt": datetime.now(UTC).isoformat()}
        try:
            request = urllib.request.Request(url, data=b"{}" if sid == "gmrepo-all-projects" else None,
                                             headers={"User-Agent": "AD-Meta/1.0 provenance-check", "Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=25) as response:
                raw = response.read()
                row["contentType"] = response.headers.get("Content-Type", "")
            (output / name).write_bytes(raw)
            row.update(sha256=sha(raw), bytes=len(raw), status="retrieved")
            if sid == "primary-paper-record":
                hits = json.loads(raw).get("resultList", {}).get("result", [])
                if len(hits) != 1 or hits[0].get("id") != "40164697" or not re.search(r"476\s+participants", hits[0].get("abstractText", "")):
                    raise ValueError("Paper record does not establish the reported 476-participant cohort.")
            elif sid == "primary-author-description":
                text = raw.decode("utf-8")
                if not all(token in text for token in ("476 individuals", "63 NC", "122 AD")):
                    raise ValueError("Author description does not match the cohort/group counts.")
            elif sid == "primary-ngdc-project":
                if "PRJCA022804" not in raw.decode("utf-8") or not re.search(rb"476\s+individuals", raw):
                    raise ValueError("Response is not the expected project record.")
            elif sid == "gmrepo-project-selector":
                if not isinstance(json.loads(raw), list):
                    raise ValueError("Selector did not return a project list.")
            elif sid == "gmrepo-all-projects":
                projects = json.loads(raw)["ALLPROJECTS"]
                if (not isinstance(projects, list) or not projects or
                        any(not re.fullmatch(r"(?:PRJ[A-Z]+|[SED]RP)\d+", p.get("project_id") or "") for p in projects)
                        or len({p["project_id"] for p in projects}) != len(projects)):
                    raise ValueError("Full project response is empty, duplicated or invalid.")
                row["projectCount"] = len(projects)
            elif not raw.startswith(b"\x1f\x8b"):
                raise ValueError("Project export did not return gzip data; HTML is not an empty directory.")
            row["validation"] = "valid"
        except (OSError, ValueError, KeyError, TypeError) as exc:
            row.update(validation="unavailable_or_invalid", error=str(exc))
        return row

    with ThreadPoolExecutor(max_workers=3) as pool:
        acquisitions = list(pool.map(acquire, jobs))
    for row in acquisitions:
        if row.get("validation") == "valid" and row["sourceId"].startswith("primary-"):
            register(row["sourceId"], output / row["file"], (output / row["file"]).read_bytes(), row["url"], "new_acquisition")
        elif row.get("validation") == "valid" and row["sourceId"] == "gmrepo-all-projects":
            register(row["sourceId"], output / row["file"], (output / row["file"]).read_bytes(), row["url"], "new_acquisition")
    if not all(sid in sources for sid in ("primary-paper-record", "primary-author-description")):
        write_json(output / "acquisitions.json", acquisitions)
        raise ValueError("Required primary study evidence was not acquired; nothing published.")

    # Record supplied scripts as scripts, never as proof of an installed version/run.
    for sid, relative in (
        ("primary-metaphlan-script", "01b_taxon_classification/metaphlan4.snakefile"),
        ("primary-metaphlan-config", "01b_taxon_classification/config_metaphlan4.yaml"),
        ("primary-diting-script", "02_diting/diting.snakefile"),
        ("primary-diting-config", "02_diting/config_diting.yaml"),
    ):
        raw = (ROOT.parent / "scripts" / relative).read_bytes()
        target = output / (sid + Path(relative).suffix)
        target.write_bytes(raw)
        register(sid, target, raw, "https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA022804")
    for sid, name in (("primary-study-method-supplement", "41380_2025_2973_MOESM1_ESM.docx"),
                      ("primary-study-sample-supplement", "41380_2025_2973_MOESM2_ESM.xlsx")):
        path = BACKEND_ROOT / "storage/raw/source-supplements/PRJCA022804" / name
        register(sid, path, path.read_bytes(), "https://www.nature.com/articles/s41380-025-02973-7")
    write_json(output / "acquisitions.json", acquisitions)
    register("closeout-acquisition-receipts", output / "acquisitions.json", (output / "acquisitions.json").read_bytes(), "https://gmrepo.humangut.info/")
    unique_runs = {}
    for receipt in discovery["queries"]:
        if re.fullmatch(r"D\d+-runs-\d+\.json", receipt["file"]):
            raw = (discovery_batch / receipt["file"]).read_bytes()
            if sha(raw) != receipt["sha256"]:
                raise ValueError("Discovery page changed after acquisition.")
            unique_runs.update({r["run_id"]: r for r in json.loads(raw)})
    discovery["coverage"] = {
        "status": "complete_for_listed_phenotypes", "wholeDatabaseComplete": False,
        "scope": "已列明官方表型的分页完整；全库关键词检索仍受项目目录接口限制。",
        "uniqueRuns": len(unique_runs), "summedPhenotypeRuns": sum(s["retrievedRuns"] for s in discovery["scopes"]),
        "uniqueProjects": len(discovery["projects"]),
        "platformTypes": dict(Counter(str(r.get("experiment_type") or "unknown") for r in unique_runs.values())),
        "globalSearchChecks": [{k: r[k] for k in ("url", "validation", "retrievedAt", "error") if k in r}
                               for r in acquisitions if r["sourceId"].startswith("gmrepo-")],
        "evidenceSourceId": "closeout-acquisition-receipts",
    }
    full_catalog = next((r for r in acquisitions if r["sourceId"] == "gmrepo-all-projects" and r.get("validation") == "valid"), None)
    if full_catalog:
        catalog_payload = json.loads((output / full_catalog["file"]).read_bytes())
        catalog = catalog_payload["ALLPROJECTS"]
        stats = catalog_payload.get("stats", {})
        pattern = r"alzheimer|mild cognitive|preclinical|dementia|cognitive decline|subjective cognitive|cognitive dysfunction"
        matches = [p for p in catalog if re.search(pattern, str(p.get("Original_Project_description") or ""), re.I)]
        discovery["coverage"]["scope"] = "官方表型分页已核对，并已检索本次项目接口返回的全部描述；源端总项目数与返回数分别记录，未返回或描述未命中者不算已排除。"
        discovery["coverage"]["keywordScope"] = {"status": "complete_for_returned_project_descriptions", "projectsScreened": len(catalog),
                                               "sourceTotalProjects": stats.get("total_projects"),
                                               "notReturnedProjects": max(0, int(stats.get("total_projects", len(catalog))) - len(catalog)),
                                               "matches": len(matches), "pattern": pattern, "sourceId": "gmrepo-all-projects",
                                               "note": "只筛项目描述，不证明所有生物样本疾病阶段或 WGS/独立性符合纳入条件。"}
        by_id = {p["projectId"]: p for p in discovery["projects"]}
        links = {p["projectId"]: p for p in payload["projects"]}
        for item in matches:
            pid = item["project_id"]
            if pid in by_id:
                continue
            by_id[pid] = {"projectId": pid, "phenotype": "官方全项目描述关键词", "phenotypes": [], "platformTypes": {},
                          "platform": "来源策略待逐 Run 核对", "installed": False,
                          "originalDescription": item.get("Original_Project_description"), "publications": item.get("Related_Publications"),
                          "reviewStatus": "metadata_keyword_candidate", "controlsStatus": "not_established"}
            links[pid] = {"projectId": pid, "evidenceRefs": ["gmrepo-all-projects"], "screeningStatus": "insufficient_information",
                          "screeningNote": "官方项目描述命中 AD/认知相关词；尚未取得可核对的样本阶段、粪便材料及同研究对照，不授予分布或检验资格。",
                          "screeningEvidenceRefs": ["gmrepo-all-projects"],
                          "facts": {"projectDescription": {"value": item["Original_Project_description"], "evidenceRefs": ["gmrepo-all-projects"],
                                                           "locator": f"ALLPROJECTS[project_id={pid}].Original_Project_description", "recordedOn": "2026-10-17"}}}
            disposition = {
                "PRJNA807473": ("outside_scope", "原项目研究老年精神分裂症；命中词 preclinical 为背景叙述，未建立 AD/NC 或 AD 相关阶段比较，不纳入本次 AD 证据范围。"),
                "PRJNA373876": ("outside_scope", "原项目研究肠易激综合征及脑影像；命中词 preclinical 为背景叙述，不是临床前 AD，不纳入本次 AD 证据范围。"),
                "PRJNA665245": ("awaiting_acquisition", "原项目为健康老年遗传风险人群与少量 AD 的纵向 WGS，含基线/6 月/12 月重复采样；源端 valid_runs=0，本项目未取得可核验丰度和逐人时间点映射，当前不开放分布或独立两组检验。"),
                "PRJEB55056": ("awaiting_acquisition", "项目描述明确研究散发性 AD 与淀粉样蛋白；官方表型标为 D065626，本次关键词补充发现。源端记录 72 Run、42 valid_runs；尚未取得并核对丰度、逐样本 AD/NC 和参与者关系，不进入固定包分母。"),
            }.get(pid)
            if disposition:
                links[pid]["screeningStatus"], links[pid]["screeningNote"] = disposition
        discovery["projects"] = sorted(by_id.values(), key=lambda p: p["projectId"])
        discovery["discoveredNotInstalled"] = sorted(pid for pid, p in by_id.items() if not p["installed"])
        discovery["coverage"]["uniqueProjects"] = len(by_id)
        discovery["coverage"]["keywordScope"]["additionalProjects"] = sorted(pid for pid in by_id if not any(p["projectId"] == pid for p in json.loads((discovery_batch / "registry.json").read_bytes())["projects"]))
        payload["projects"] = sorted(links.values(), key=lambda p: p["projectId"])
    cohort = json.loads((BACKEND_ROOT / "metadata/verified_cohorts.json").read_bytes())["cohorts"][0]
    context = {"schemaVersion": 1, "recordedOn": "2026-10-17", "cohortId": cohort["cohortId"],
               "sampleCount": cohort["sampleCount"], "sampleSetSha256": cohort["sampleSetSha256"], "groupCounts": cohort["groupCounts"],
               "projectUrl": cohort["projectUrl"], "publicationUrl": cohort["publication"]["url"],
               "selection": "以 AD 与 NC 二分类为研究范围，纳入 PRJCA022804 两组全部样本：AD 122、NC 63，共 185 个；其他阶段不进入本次主分析。",
               "participantStatus": "study_reported_person_counts_no_rowwise_subject_verification",
               "participantNote": "项目与作者报告全队列 476 名受试者，登记 476 个样本；AD/NC 合计 185。人数与样本数一致，支持一人一份样本的解释；公开 host_subject_id 未提供，未完成逐受试者 ID 的重复采样核验。",
               "crossCohortNote": "本队列的人数依据不证明它与 GMrepo 或其他论文的参与者互不重叠。",
               "pipelineNote": "本项目使用 MetaPhlAn 4 / DiTing 结果及已取得脚本；来源论文方法仅用于了解原研究。脚本用于记录处理步骤，不据此推定已安装软件小版本或当前结果对应的实际执行记录。",
               "sources": [s for sid, s in sources.items() if sid.startswith("primary-")]}
    payload.update(version="gmrepo-research-ledger-2026-10-17-v4", recordedOn="2026-10-17", sources=list(sources.values()))
    ResearchRegistry.model_validate(payload)
    write_json(output / "registry-candidate.json", payload)
    write_json(output / "discovery-candidate.json", discovery)
    write_json(output / "primary-context.json", context)
    write_json(output / "preparation.json", {"baseRegistrySha256": sha(base), "history": history, "reviewsSigned": 0,
                                           "inferenceChanges": 0, "discoveryBatch": discovery_batch.relative_to(ROOT).as_posix()})
    return {"sources": len(sources), "acquisitions": acquisitions, "changedLocalSources": [s["sourceId"] for s in history if s["changedSincePreviousRegistration"]]}


def publish(output: Path, discovery_batch: Path):
    data = reference.load_reference_dataset()
    preparation = json.loads((output / "preparation.json").read_bytes())
    if sha(ledger.REGISTRY_PATH.read_bytes()) != preparation["baseRegistrySha256"]:
        raise ValueError("Registry changed after preparation; nothing published.")
    proposed = ResearchRegistry.model_validate_json((output / "registry-candidate.json").read_bytes())
    if proposed.referenceFingerprint != data.fingerprint or any(s["availability"] != "verified" for s in ledger.source_checks(data, proposed)):
        raise ValueError("Candidate sources are not all verifiable; nothing published.")
    found = json.loads((output / "discovery-candidate.json").read_bytes())
    publish_candidate(found, discovery_batch, ledger.DISCOVERY_PATH)
    # Small local indexes; historical inputs were archived above, no sealed data changed.
    ledger.REGISTRY_PATH.write_bytes((output / "registry-candidate.json").read_bytes())
    CONTEXT_PATH.write_bytes((output / "primary-context.json").read_bytes())
    write_json(output / "publish-receipt.json", {"publishedAt": datetime.now(UTC).isoformat(), "registrySha256": sha(ledger.REGISTRY_PATH.read_bytes()),
                                              "contextSha256": sha(CONTEXT_PATH.read_bytes())})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--discovery-batch", required=True, type=Path)
    parser.add_argument("--publish-existing", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    batch = args.discovery_batch.resolve()
    if not output.is_relative_to(ROOT) or not batch.is_relative_to(ROOT):
        raise ValueError("Release batches must be within this repository.")
    if args.publish_existing:
        publish(output, batch)
        print("Published frozen sources and primary scope; inference gates unchanged.")
    else:
        print(json.dumps(prepare(output, batch), ensure_ascii=False, indent=2))
