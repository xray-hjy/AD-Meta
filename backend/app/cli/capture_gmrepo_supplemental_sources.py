"""Capture recovered project identities and official project-level run records."""
import argparse
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path


def acquire(root, inventory):
    if root.exists():
        raise ValueError("Use a new source directory")
    root.mkdir(parents=True)
    ids = json.loads(inventory.read_bytes())["projectsMissingFromDescriptionCatalog"]
    jobs = [(pid, pid + "-project.json", "getProjectDetailsByID", {"ncbi_project_id": pid}) for pid in ids]
    jobs += [(pid, pid + "-runs.json", "getAllRunsByProjectIDAsync", {"project_id": pid, "skip": 0, "limit": 1000}) for pid in ("PRJEB55056", "PRJNA665245")]

    def one(job):
        pid, file, method, body = job
        url = f"https://gmrepo.humangut.info/api/{method}/"
        row = {"projectId": pid, "file": file, "url": url, "body": body, "retrievedAt": datetime.now(UTC).isoformat()}
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read()
            (root / file).write_bytes(raw)
            value = json.loads(raw)
            if method == "getProjectDetailsByID" and value.get("project", {}).get("project_id") != pid:
                raise ValueError("Missing expected project identity")
            if method == "getAllRunsByProjectIDAsync" and (not isinstance(value, list) or any(r["project_id"] != pid for r in value)):
                raise ValueError("Not a project run list")
            return {**row, "status": "retrieved", "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
        except (OSError, ValueError, KeyError) as exc:
            return {**row, "status": "unavailable", "error": str(exc)}
    rows = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        for row in pool.map(one, jobs):
            rows.append(row)
            print(row["file"], row["status"], flush=True)
    (root / "receipts.json").write_text(json.dumps({"records": rows}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--inventory", type=Path, required=True)
    args = p.parse_args()
    acquire(args.output, args.inventory)
