"""Acquire bounded release evidence, not abundance imports or scientific approval."""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

from app.cli.inventory_gmrepo import BASE, capture, write_json
from app.core.config import BACKEND_ROOT

TERMS = r"alzheimer|mild cognitive impairment|preclinical|cognitive decline|dementia"
PAPERS = {"PRJNA554111": "29758946", "PRJNA770746": "35275538", "PRJNA633959": "PMC7889981",
          "PRJEB49329": "PMC8843078", "PRJEB50447": "PMC9707757", "PRJNA611839": "PMC8361629",
          "PRJNA734525": "PMC8823292", "PRJNA798058": "PMC10680783"}


def acquire(output: Path) -> dict:
    if output.exists():
        raise ValueError("Use a new batch directory; previous evidence is immutable.")
    output.mkdir(parents=True)
    registry = json.loads((BACKEND_ROOT / "metadata/gmrepo_research_registry.json").read_bytes())
    projects = sorted({p["projectId"] for p in registry["projects"]} | {"PRJNA798058"})
    jobs = [(p, f"https://www.ebi.ac.uk/ena/browser/api/xml/{p}", f"{p}.xml", None, "project") for p in projects]
    jobs.append(("gmrepo", BASE + "/api/getCuratedProjectsList", "curated-projects.json", {}, "gmrepo_projects"))
    query = '(Alzheimer* OR "mild cognitive impairment" OR "preclinical Alzheimer" OR "cognitive decline") AND (gut OR fecal OR faecal OR stool) AND (microbiom* OR metagenom*)'
    search_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urlencode({"query": query, "format": "json", "pageSize": 1000, "resultType": "core"})
    jobs.append(("literature", search_url, "literature-search.json", None, "literature"))
    for project, paper in PAPERS.items():
        query_paper = f"EXT_ID:{paper} AND SRC:MED" if paper.isdigit() else f"PMCID:{paper}"
        url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urlencode({"query": query_paper, "format": "json", "resultType": "core"})
        jobs.append((project, url, f"{project}-paper.json", None, "paper_candidate"))
    jobs.append(("PRJNA798058", "https://zenodo.org/api/records/14991167", "wgs-author-record.json", None, "author_record"))
    result: dict = {"schemaVersion": 1, "startedAt": datetime.now(UTC).isoformat(), "referenceFingerprint": registry["referenceFingerprint"],
                    "scope": {"projects": projects, "gmrepoKeywordPattern": TERMS, "literatureQuery": query,
                              "note": "Retrospective bounded screening; not a systematic review or a claim of whole-database completeness."}, "records": []}

    def one(job):
        project, url, name, body, kind = job
        row = {"projectId": project, "kind": kind}
        try:
            raw, receipt = capture(url, output / name, body)
            row["receipt"] = receipt
            if kind == "project":
                tree = ET.fromstring(raw)
                if not tree.findall(".//PROJECT") and not tree.findall(".//STUDY"):
                    raise ValueError("No project/study record in XML")
                row.update(title=tree.findtext(".//TITLE") or tree.findtext(".//STUDY_TITLE"), description=tree.findtext(".//DESCRIPTION") or tree.findtext(".//STUDY_ABSTRACT"))
            else:
                payload = json.loads(raw)
                if kind == "gmrepo_projects":
                    if not isinstance(payload, list):
                        raise ValueError("Project selector did not return a list; not an empty successful search")
                    row.update(total=len(payload), matches=[p for p in payload if re.search(TERMS, json.dumps(p), re.I)])
                elif kind in {"literature", "paper_candidate"}:
                    hits = payload.get("resultList", {}).get("result", [])
                    if "hitCount" not in payload:
                        raise ValueError("Missing search result count")
                    row.update(total=payload["hitCount"], retrieved=len(hits), paginationComplete=len(hits) == int(payload["hitCount"]))
                    if kind == "paper_candidate":
                        row["candidates"] = [{k: p.get(k) for k in ("id", "pmcid", "title", "authorString", "firstPublicationDate", "isOpenAccess")} for p in hits]
                elif kind == "author_record":
                    row["files"] = [{k: f.get(k) for k in ("key", "size", "checksum", "links")} for f in payload.get("files", [])]
            row["status"] = "source_record_unreviewed"
        except (OSError, ValueError, ET.ParseError) as exc:
            row.update(status="failed", url=url, error=str(exc))
        return row

    with ThreadPoolExecutor(max_workers=3) as pool:
        for future in as_completed([pool.submit(one, j) for j in jobs]):
            row = future.result()
            result["records"].append(row)
            write_json(output / "receipts.json", result)
            print(f"{row['projectId']} {row['kind']}: {row['status']}", flush=True)
    result["completedAt"] = datetime.now(UTC).isoformat()
    result["status"] = "partial" if any(r["status"] == "failed" or r.get("paginationComplete") is False for r in result["records"]) else "bounded_acquisition_complete_pending_screening"
    write_json(output / "receipts.json", result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--follow-up-from", type=Path)
    parser.add_argument("--targeted", action="store_true")
    parser.add_argument("--resolve", action="store_true")
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else BACKEND_ROOT.parent / args.output
    result = resolve_gaps(output) if args.resolve else targeted(output) if args.targeted else follow_up(output, args.follow_up_from) if args.follow_up_from else acquire(output)
    print(json.dumps({"status": result["status"], "records": len(result["records"])}, ensure_ascii=False))


def follow_up(output: Path, previous: Path) -> dict:
    if output.exists():
        raise ValueError("Use a new immutable batch")
    previous = previous if previous.is_absolute() else BACKEND_ROOT.parent / previous
    payload = json.loads((previous / "receipts.json").read_bytes())
    output.mkdir(parents=True)
    jobs = []
    for row in payload["records"]:
        for candidate in row.get("candidates", []):
            if candidate.get("pmcid"):
                pmc = candidate["pmcid"]
                jobs.append((row["projectId"], f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmc}/fullTextXML", f"{pmc}.xml", "paper"))
        for file in row.get("files", []):
            if file["size"] <= 5_000_000:
                jobs.append((row["projectId"], file["links"]["self"], file["key"], "author_file"))
    jobs.append(("gmrepo", BASE + "/Downloads/AllSummaryData/all_projects_metadata.tsv.gz", "all-projects.tsv.gz", "project_export"))
    result: dict = {"schemaVersion": 1, "previousBatch": str(previous), "records": []}
    def one(job):
        project, url, name, kind = job
        row = {"projectId": project, "kind": kind}
        try:
            raw, receipt = capture(url, output / name)
            row["receipt"] = receipt
            if kind == "paper":
                tree = ET.fromstring(raw)
                title = tree.find(".//article-title")
                if title is None:
                    raise ValueError("Missing article title")
                row["title"] = "".join(title.itertext())
                row["supplements"] = [ET.tostring(s, encoding="unicode") for s in tree.findall(".//supplementary-material")]
                row["accessionMentioned"] = project in raw.decode("utf-8")
            elif kind == "project_export":
                rows = list(csv.DictReader(io.StringIO(gzip.decompress(raw).decode("utf-8-sig")), delimiter="\t"))
                row.update(total=len(rows), matches=[r for r in rows if re.search(TERMS, json.dumps(r), re.I)])
                if not rows:
                    raise ValueError("No project records")
            row["status"] = "source_record_unreviewed"
        except (OSError, ValueError, ET.ParseError) as exc:
            row.update(status="failed", url=url, error=str(exc))
        return row
    with ThreadPoolExecutor(max_workers=3) as pool:
        for future in as_completed([pool.submit(one, job) for job in jobs]):
            row = future.result()
            result["records"].append(row)
            write_json(output / "receipts.json", result)
            print(f"{row['projectId']} {row['kind']}: {row['status']}", flush=True)
    result["status"] = "partial" if any(r["status"] == "failed" for r in result["records"]) else "bounded_acquisition_complete_pending_screening"
    write_json(output / "receipts.json", result)
    return result


def targeted(output: Path) -> dict:
    if output.exists():
        raise ValueError("New batch required")
    output.mkdir(parents=True)
    queries = {"wgs-literature": 'TITLE_ABS:(Alzheimer* OR "mild cognitive impairment" OR "preclinical Alzheimer") AND TITLE_ABS:(gut OR fecal OR faecal OR stool) AND TITLE_ABS:(shotgun OR metagenom*)',
               **{project: project for project in ("PRJNA1028813", "PRJNA489760", "PRJNA496408")}}
    jobs: list[tuple[str, str, str, dict | None]] = [(key, "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urlencode({"query": query, "format": "json", "pageSize": 1000, "resultType": "core"}), key + "-search.json", None) for key, query in queries.items()]
    jobs += [(project, "https://www.ebi.ac.uk/ena/portal/api/filereport?" + urlencode({"accession": project, "result": "read_run", "fields": "run_accession,sample_accession,secondary_sample_accession,experiment_accession,experiment_alias,sample_alias,library_strategy,library_source,instrument_model", "format": "tsv"}), project + "-runs.tsv", None) for project in ("PRJNA554111", "PRJNA633959", "PRJNA770746", "PRJNA798058")]
    jobs += [("PRJNA798058", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10680783/", "PMC10680783.html", None),
             ("gmrepo-wgs-project", BASE + "/api/getMicrobeAbundancesByPhenotypeMeshIDAndProjectID/", "gmrepo-wgs-project.json", {"project_id": "PRJNA798058", "mesh_id": ""})]
    result: dict = {"scope": queries, "records": []}
    def one(job):
        key, url, name, body = job
        row = {"key": key}
        try:
            raw, receipt = capture(url, output / name, body)
            row["receipt"] = receipt
            if name.endswith("-search.json"):
                payload = json.loads(raw)
                hits = payload["resultList"]["result"]
                row.update(total=payload["hitCount"], retrieved=len(hits), paginationComplete=len(hits) == payload["hitCount"])
                row["candidates"] = [{k: p.get(k) for k in ("id", "pmcid", "title")} for p in hits]
            elif name.endswith(".tsv"):
                rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter="\t"))
                if not rows or "run_accession" not in rows[0]:
                    raise ValueError("Invalid ENA run export")
                row.update(records=len(rows), strategies=sorted({r["library_strategy"] for r in rows}))
            elif key == "gmrepo-wgs-project":
                payload = json.loads(raw)
                if not payload.get("project_info") or not payload.get("abundance_and_meta_data"):
                    raise ValueError("No usable project/profile contract; cannot infer no coverage")
            row["status"] = "source_record_unreviewed"
        except (OSError, ValueError, KeyError) as exc:
            row.update(status="failed", error=str(exc), url=url)
        return row
    with ThreadPoolExecutor(max_workers=3) as pool:
        for future in as_completed([pool.submit(one, j) for j in jobs]):
            row = future.result()
            result["records"].append(row)
            write_json(output / "receipts.json", result)
            print(f"{row['key']}: {row['status']}", flush=True)
    result["status"] = "partial" if any(r["status"] == "failed" or r.get("paginationComplete") is False for r in result["records"]) else "bounded_acquisition_complete_pending_screening"
    write_json(output / "receipts.json", result)
    return result


def resolve_gaps(output: Path) -> dict:
    if output.exists():
        raise ValueError("New batch required")
    output.mkdir(parents=True)
    jobs: list[tuple[str, str, str, dict | None]] = [(pid, f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmc}/fullTextXML", pmc + ".xml", None) for pid, pmc in (("PRJNA1028813", "PMC11436273"), ("PRJNA496408", "PMC7829997"))]
    jobs += [(pid, "https://www.ebi.ac.uk/ena/portal/api/filereport?" + urlencode({"accession": pid, "result": "read_run", "fields": "run_accession,sample_accession,experiment_accession,library_strategy,library_source,instrument_model", "format": "tsv"}), pid + "-runs.tsv", None) for pid in ("PRJNA554111", "PRJNA633959", "PRJNA770746", "PRJNA798058")]
    jobs += [("gmrepo-project", BASE + "/api/getMicrobeAbundancesByPhenotypeMeshIDAndProjectID", "gmrepo-project.json", {"project_id": "PRJNA798058", "mesh_id": ""}),
             ("gmrepo-curated", BASE + "/api/getCuratedProjectsList/", "curated.json", {})]
    result: dict = {"records": []}
    def one(job):
        key, url, name, body = job
        row = {"projectId": key}
        try:
            raw, receipt = capture(url, output / name, body)
            row["receipt"] = receipt
            if name.endswith(".xml"):
                tree = ET.fromstring(raw)
                title = tree.find(".//article-title")
                if title is None:
                    raise ValueError("Missing article title")
                row.update(kind="paper", title="".join(title.itertext()), accessionMentioned=key in raw.decode("utf-8"))
            elif name.endswith(".tsv"):
                rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter="\t"))
                if not rows or "run_accession" not in rows[0]:
                    raise ValueError("Invalid ENA export")
                row.update(kind="run_export", count=len(rows), strategies=sorted({r["library_strategy"] for r in rows}))
            else:
                payload = json.loads(raw)
                if key == "gmrepo-curated":
                    if not isinstance(payload, list):
                        raise ValueError("Selector response is not a complete project list")
                    row.update(kind="project_selector", count=len(payload), matches=[r for r in payload if re.search(TERMS, json.dumps(r), re.I)])
                elif not payload.get("project_info") or not payload.get("abundance_and_meta_data"):
                    raise ValueError("No usable WGS project profile response; not proof of absence")
                else:
                    row.update(kind="gmrepo_profile", count=len(payload["abundance_and_meta_data"]))
            row["status"] = "source_record_unreviewed"
        except (OSError, ValueError, KeyError, ET.ParseError) as exc:
            row.update(status="failed", error=str(exc), url=url)
        return row
    with ThreadPoolExecutor(max_workers=3) as pool:
        for future in as_completed([pool.submit(one, j) for j in jobs]):
            row = future.result()
            result["records"].append(row)
            write_json(output / "receipts.json", result)
            print(f"{row['projectId']}: {row['status']}", flush=True)
    result["status"] = "partial" if any(r["status"] == "failed" for r in result["records"]) else "bounded_acquisition_complete_pending_screening"
    write_json(output / "receipts.json", result)
    return result


if __name__ == "__main__":
    main()
