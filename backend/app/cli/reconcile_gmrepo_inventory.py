"""Reconcile captured all-run pages at their actual Run × phenotype grain."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path


def reconcile(root: Path, catalog_path: Path, output: Path, tail: Path | None = None):
    if output.exists():
        raise ValueError("Never overwrite a reconciliation")
    catalog = json.loads(catalog_path.read_bytes())
    previous = json.loads((root / "receipts.json").read_bytes())
    records, rows, signatures = [], [], set()
    repeated_exact = 0
    fragments = [(root, r) for r in previous["records"]]
    end = json.loads((tail / "receipts.json").read_bytes()) if tail else {}
    fragments += [(tail, r) for r in end.get("records", [])]
    for index, (archive, receipt) in enumerate(sorted(fragments, key=lambda v: v[1]["body"]["skip"])):
        if receipt["body"]["skip"] != index * 5000:
            raise ValueError("Missing or overlapping page")
        raw = (archive / receipt["file"]).read_bytes()
        values = json.loads(raw)["runs"]
        if not isinstance(values, list) or any(not r.get("run_id") or not r.get("project_id") for r in values):
            raise ValueError("Invalid run/phenotype records")
        if len(values) > receipt["body"]["limit"] or (index < len(fragments) - 1 and len(values) != receipt["body"]["limit"]):
            raise ValueError("Incomplete page")
        for r in values:
            key = json.dumps(r, sort_keys=True)
            repeated_exact += key in signatures
            signatures.add(key)
        rows += values
        records.append({**receipt, "archivePath": str(archive).replace("\\", "/"), "status": "retrieved", "records": len(values), "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "validation": "run_phenotype_grain"})
    ids = {r["project_id"] for r in rows}
    counts = Counter(r["run_id"] for r in rows)
    catalog_ids = {r["project_id"] for r in catalog["ALLPROJECTS"]}
    result = {"expectedRows": previous["expectedRuns"], "retrievedRows": len(rows), "uniqueRuns": len(counts),
              "multiLabelRuns": sum(c > 1 for c in counts.values()), "duplicateExactRows": repeated_exact,
              "projectIds": sorted(ids), "retrievedProjects": len(ids), "sourceProjects": catalog["stats"]["total_projects"],
              "descriptionProjects": len(catalog_ids), "projectsMissingFromDescriptionCatalog": sorted(ids - catalog_ids),
              "descriptionProjectsNotInRuns": sorted(catalog_ids - ids), "unionProjects": len(ids | catalog_ids),
              "paginationComplete": bool(end.get("ended")), "uniqueRunCountMatches": len(counts) == previous["expectedRuns"],
              "status": "reconciled" if end.get("ended") and len(counts) == previous["expectedRuns"] else "incomplete",
              "records": records, "archivePath": str(root).replace("\\", "/"),
              "note": "接口是 Run × disease 行；去重 Run 数不应等于源端行总数。项目身份联合覆盖不等于所有项目均有描述或临床分组。"}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in {"records", "projectIds", "descriptionProjectsNotInRuns"}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--catalog", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--tail", type=Path)
    a = p.parse_args()
    reconcile(a.input, a.catalog, a.output, a.tail)
