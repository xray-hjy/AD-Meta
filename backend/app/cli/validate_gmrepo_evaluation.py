"""Independently read an exported snapshot; does not claim unavailable inputs can be recomputed."""
import argparse
import json
from pathlib import Path

from app.services.gmrepo_snapshot_service import validate_package


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    package = json.loads(args.path.read_bytes())
    validate_package(package)
    record = package["payload"]["evaluation"]
    cohorts = record["cohorts"]
    if len({r["projectId"] for r in cohorts}) != len(cohorts):
        raise ValueError("Duplicate cohort records.")
    print(json.dumps({"technicalReadback": "passed", "evaluationId": package["evaluationId"], "familySize": record.get("familySize", record.get("externalFamilySize")),
                      "cohorts": len(cohorts), "replay": package["payload"]["replay"],
                      "note": "哈希和结构读回不等于重新计算或科研复核；当前用途状态须在线核对。"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
