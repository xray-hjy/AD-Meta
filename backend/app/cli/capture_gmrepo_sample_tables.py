"""Cross-channel sample tables and project profiles; no inferred clinical relabeling."""
import argparse
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

from app.core.config import BACKEND_ROOT


def acquire(root, registry_path):
    if root.exists() or not root.resolve().is_relative_to(BACKEND_ROOT.parent):
        raise ValueError("Use a new workspace directory")
    root.mkdir(parents=True)
    projects = json.loads(registry_path.read_bytes())["projects"]
    jobs = []
    for p in projects:
        pid = p["projectId"]
        if p.get("screeningStatus") != "outside_scope":
            jobs.append((pid, pid + "-samples.tsv", "https://www.ebi.ac.uk/ena/portal/api/search?" + urlencode({"result": "sample", "query": f"study_accession={pid}", "fields": "all", "format": "tsv"}), None))
    for pid in ("PRJEB55056", "PRJNA665245"):
        jobs.append((pid, pid + "-all-phenotypes.json", "https://gmrepo.humangut.info/api/getMicrobeAbundancesByPhenotypeMeshIDAndProjectID/", {"project_id": pid, "mesh_id": ""}))
    jobs += [(pid, sid + "-biosamples.json", "https://www.ebi.ac.uk/biosamples/samples/" + sid, None) for pid, sid in (("PRJEB55056", "SAMEA110670870"), ("PRJNA665245", "SAMN16247262"))]

    def one(job):
        pid, file, url, body = job
        row = {"projectId": pid, "file": file, "url": url, "body": body, "retrievedAt": datetime.now(UTC).isoformat()}
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read()
            (root / file).write_bytes(raw)
            if file.endswith(".tsv") and not raw.startswith(b"sample_accession\t"):
                raise ValueError("Not the expected full sample table")
            if file.endswith(".json"):
                json.loads(raw)
            return {**row, "status": "retrieved", "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
        except (OSError, ValueError) as exc:
            return {**row, "status": "unavailable", "error": str(exc)}

    rows = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        for row in pool.map(one, jobs):
            rows.append(row)
            print(row["file"], row["status"], flush=True)
            (root / "receipts.json").write_text(json.dumps({"complete": len(rows) == len(jobs), "records": rows}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--registry", type=Path, default=BACKEND_ROOT / "metadata/gmrepo_research_registry.json")
    args = p.parse_args()
    acquire(args.output, args.registry)
