"""Bounded public-source acquisition for the complete GMrepo iteration."""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

from app.core.config import BACKEND_ROOT

BASE = "https://gmrepo.humangut.info"


def acquire(output: Path) -> dict:
    if output.exists():
        raise ValueError("Use a new acquisition directory.")
    output.mkdir(parents=True)
    registry = json.loads((BACKEND_ROOT / "metadata/gmrepo_research_registry.json").read_bytes())
    projects = sorted(p["projectId"] for p in registry["projects"])
    jobs = [(pid, "gmrepo-project", BASE + "/api/getProjectDetailsByID/", pid + "-gmrepo.json", {"ncbi_project_id": pid}) for pid in projects]
    fields = "run_accession,sample_accession,secondary_sample_accession,experiment_accession,sample_alias,experiment_alias,library_strategy,library_source,instrument_model"
    jobs += [(pid, "ena-runs", "https://www.ebi.ac.uk/ena/portal/api/filereport?" + urlencode({"accession": pid, "result": "read_run", "fields": fields, "format": "tsv"}), pid + "-runs.tsv", None)
             for pid in projects if pid not in {"PRJNA373876", "PRJNA807473"}]
    jobs += [(pid, "paper", f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmc}/fullTextXML", pmc + ".xml", None)
             for pid, pmc in (("PRJEB55056", "PMC10230724"), ("PRJEB55056", "PMC11936893"))]
    jobs += [("gmrepo", "project-catalog", BASE + "/api/getAllProjectsWithMetadataAndSomeStatistics/", "all-projects.json", {})]
    result: dict = {"startedAt": datetime.now(UTC).isoformat(), "projects": projects, "records": []}

    def one(job):
        pid, kind, url, filename, body = job
        row = {"projectId": pid, "kind": kind, "url": url, "file": filename, "body": body, "method": "POST" if body is not None else "GET", "retrievedAt": datetime.now(UTC).isoformat()}
        try:
            request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                             headers={"Content-Type": "application/json", "User-Agent": "AD-Meta research-resource/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                row["contentType"] = response.headers.get("Content-Type", "")
            (output / filename).write_bytes(raw)
            row.update(status="retrieved", bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
            if kind in {"gmrepo-project", "project-catalog"}:
                payload = json.loads(raw)
                expected = "project" if kind == "gmrepo-project" else "ALLPROJECTS"
                if not payload.get(expected):
                    raise ValueError("No expected structured project record in response")
                row["keys"] = list(payload)
            elif kind == "ena-runs" and not raw.startswith(b"run_accession\t"):
                raise ValueError("Not an ENA run table")
            elif kind == "paper" and b"<article" not in raw:
                raise ValueError("Not an article XML record")
            row["validation"] = "valid"
        except (OSError, ValueError, KeyError) as exc:
            row.update(validation="unavailable_or_invalid", error=str(exc))
        return row

    with ThreadPoolExecutor(max_workers=4) as pool:
        for future in as_completed([pool.submit(one, job) for job in jobs]):
            row = future.result()
            result["records"].append(row)
            (output / "receipts.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"{row['projectId']} {row['kind']}: {row['validation']}", flush=True)
    result["completedAt"] = datetime.now(UTC).isoformat()
    (output / "receipts.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    target = args.output.resolve()
    if not target.is_relative_to(BACKEND_ROOT.parent):
        raise ValueError("Acquisition must remain within the project workspace.")
    acquire(target)
