"""Compare derived species sums to upstream genus rows without replacing either."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

from app.services import gmrepo_primary_genus as primary


def audit(path, output):
    if output.exists():
        raise ValueError("Use a new audit output")
    result = primary.snapshot()
    if hashlib.sha256(path.read_bytes()).hexdigest() != result["provenance"]["sourceSha256"]:
        raise ValueError("Source file is not the published matrix input")
    profiles = {s["runId"]: s["abundance"] for s in result["inputs"]["samples"]}
    features = {(f["domain"], f["sourceGenus"]): f["featureId"] for f in result["inputs"]["features"]}
    found, differences = set(), []
    with path.open(encoding="utf-8-sig") as stream:
        table = csv.reader(stream, delimiter="\t")
        header = next(table)
        columns = {i: s.removesuffix("_metaphlan") for i, s in enumerate(header) if s.removesuffix("_metaphlan") in profiles}
        if set(columns.values()) != set(profiles):
            raise ValueError("Raw header does not contain the exact published cohort")
        for row in table:
            if not row or not row[0].split("|")[-1].startswith("g__"):
                continue
            parts = row[0].split("|")
            key = (parts[0].removeprefix("k__"), parts[-1].removeprefix("g__"))
            fid = features.get(key)
            if not fid:
                continue
            if fid in found:
                raise ValueError("Ambiguous upstream genus rows")
            found.add(fid)
            differences.extend(abs(profiles[code].get(fid, 0.) - float(row[i])) for i, code in columns.items())
    report = {"primaryFingerprint": result["fingerprint"], "sourceSha256": result["provenance"]["sourceSha256"], "samples": len(profiles),
              "derivedGenera": len(features), "upstreamMatchedGenera": len(found), "comparedCells": len(differences),
              "maximumAbsolutePercentagePointDifference": max(differences, default=None),
              "cellsWithin0_01PercentagePoint": sum(v <= .01 for v in differences),
              "status": "consistent_with_rounding" if len(found) == len(features) and max(differences, default=float("inf")) <= .01 else "differences_require_interpretation",
              "note": "仅校验，不用上层属行替换种级求和，不把不一致静默重闭合。"}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    audit(a.source, a.output)
