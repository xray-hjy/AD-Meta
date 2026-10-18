"""Acquire original sample metadata and new phenotype profiles, preserving receipts."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import BACKEND_ROOT


def acquire(root: Path, previous: Path):
    if root.exists() or not root.resolve().is_relative_to(BACKEND_ROOT.parent):
        raise ValueError("Use a new workspace acquisition directory")
    root.mkdir(parents=True)
    jobs = []
    for pid in ("PRJEB55056", "PRJNA665245"):
        with (previous / f"{pid}-runs.tsv").open(encoding="utf-8-sig") as stream:
            runs = list(csv.DictReader(stream, delimiter="\t"))
        for sid in sorted({r["sample_accession"] for r in runs}):
            jobs.append((pid, sid + ".xml", "https://www.ebi.ac.uk/ena/browser/api/xml/" + sid, None))
    jobs.append(("PRJEB55056", "PRJEB55056-profiles.json", "https://gmrepo.humangut.info/api/getMicrobeAbundancesByPhenotypeMeshIDAndProjectID/", {"project_id": "PRJEB55056", "mesh_id": "D065626"}))

    def one(job):
        pid, name, url, body = job
        receipt = {"projectId": pid, "file": name, "url": url, "body": body, "retrievedAt": datetime.now(UTC).isoformat()}
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=30) as response:
                    raw = response.read()
                (root / name).write_bytes(raw)
                if name.endswith(".xml") and b"<SAMPLE" not in raw:
                    raise ValueError("Not an ENA sample XML")
                if name.endswith(".json") and not isinstance(json.loads(raw), dict):
                    raise ValueError("Not structured phenotype data")
                return {**receipt, "status": "retrieved", "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "attempts": attempt + 1}
            except (OSError, ValueError) as exc:
                receipt["error"] = str(exc)
        return {**receipt, "status": "unavailable"}

    receipts = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for row in pool.map(one, jobs):
            receipts.append(row)
            (root / "receipts.json").write_text(json.dumps({"records": receipts, "complete": len(receipts) == len(jobs)}, ensure_ascii=False, indent=2), encoding="utf-8")
            if len(receipts) % 20 == 0 or row["file"].endswith(".json"):
                print(f"Followup {len(receipts)}/{len(jobs)} {row['file']} {row['status']}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--previous", type=Path, required=True)
    args = parser.parse_args()
    acquire(args.output, args.previous)
