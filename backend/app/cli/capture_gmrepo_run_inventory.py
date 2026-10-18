"""Reconcile the official all-run inventory with the project-description catalog."""
import argparse
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path


def acquire(root: Path, catalog_path: Path, previous: Path | None = None) -> dict:
    if root.exists():
        raise ValueError("New immutable batch required")
    root.mkdir(parents=True)
    catalog = json.loads(catalog_path.read_bytes())
    expected = int(catalog["stats"]["all_runs_count"])
    size = 5000
    prior = json.loads((previous / "receipts.json").read_bytes()) if previous else {}
    reused = {r["body"]["skip"]: r for r in prior.get("records", []) if r["status"] == "retrieved"}

    def page(skip):
        body = {"limit": size, "skip": skip}
        url = "https://gmrepo.humangut.info/api/getAllRunsAsync/"
        row = {"url": url, "body": body, "retrievedAt": datetime.now(UTC).isoformat(), "file": f"runs-{skip}.json"}
        try:
            old = reused.get(skip)
            if old:
                raw = (previous / old["file"]).read_bytes()
                if hashlib.sha256(raw).hexdigest() != old["sha256"] or len(raw) != old["bytes"]:
                    raise ValueError("Prior acquisition integrity error")
                (root / row["file"]).write_bytes(raw)
                return {**old, "reusedFrom": str(previous)}, json.loads(raw)["runs"]
            request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read()
            (root / row["file"]).write_bytes(raw)
            runs = json.loads(raw)["runs"]
            if not isinstance(runs, list) or len({r["run_id"] for r in runs}) != len(runs):
                raise ValueError("Invalid or duplicated page")
            row.update(status="retrieved", bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), records=len(runs))
            return row, runs
        except (OSError, ValueError, KeyError, TypeError) as exc:
            return {**row, "status": "failed", "error": str(exc)}, []

    receipts, runs = [], {}
    first, rows = page(0)
    receipts.append(first)
    if first["status"] != "retrieved" or len(rows) != min(size, expected):
        (root / "receipts.json").write_text(json.dumps({"expectedRuns": expected, "records": receipts, "status": "incomplete"}, indent=2), encoding="utf-8")
        return {"status": "incomplete", "firstPage": first}
    runs.update({r["run_id"]: r for r in rows})
    duplicate = False
    with ThreadPoolExecutor(max_workers=3) as pool:
        for receipt, rows in pool.map(page, range(size, expected, size)):
            receipts.append(receipt)
            ids = {r["run_id"] for r in rows}
            duplicate = duplicate or bool(ids & runs.keys())
            runs.update({r["run_id"]: r for r in rows})
            (root / "receipts.json").write_text(json.dumps({"expectedRuns": expected, "records": receipts, "status": "running"}), encoding="utf-8")
            print(f"Inventory {len(runs)}/{expected}", flush=True)
    ids = {r["project_id"] for r in runs.values() if r.get("project_id")}
    catalog_ids = {r["project_id"] for r in catalog["ALLPROJECTS"]}
    complete = len(runs) == expected and not duplicate and all(r["status"] == "retrieved" for r in receipts)
    result = {"status": "complete" if complete else "incomplete", "expectedRuns": expected, "retrievedRuns": len(runs),
              "expectedProjects": catalog["stats"]["total_projects"], "retrievedProjects": len(ids),
              "projectIds": sorted(ids), "projectsMissingFromDescriptionCatalog": sorted(ids - catalog_ids),
              "descriptionProjectsNotInRuns": sorted(catalog_ids - ids), "duplicateRunsAcrossPages": duplicate,
              "catalogSha256": hashlib.sha256(catalog_path.read_bytes()).hexdigest(), "records": receipts,
              "note": "Run metadata complete only when count and uniqueness match; project identity recovery is not clinical eligibility."}
    (root / "receipts.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {k: v for k, v in result.items() if k != "records" and k != "projectIds"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    print(json.dumps(acquire(args.output, args.catalog, args.previous), ensure_ascii=False, indent=2))
