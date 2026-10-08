"""Copy a supplied script archive byte-for-byte and catalogue its evidence.

This reads text/JSON as evidence only; it never executes archived commands.
"""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--versions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    output = args.output.resolve()
    if output.exists() or source == output or source in output.parents:
        raise ValueError("Output must be a new directory outside the source archive")
    recorded = json.loads((source / "归档溯源.json").read_text(encoding="utf-8-sig"))
    metadata = {record["path"]: record for record in recorded if "path" in record}
    raw = output / "archive"
    shutil.copytree(source, raw)
    shutil.copy2(args.versions, output / "software_versions_reported.json")
    groups = collections.defaultdict(list)
    inventory, mismatches = [], []
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(source).as_posix()
        digest = sha256(path)
        entry = metadata.get(relative, {})
        expected = entry.get("sha256", "")
        if sha256(raw / relative) != digest:
            raise ValueError(f"Snapshot differs: {relative}")
        status = "matches" if expected and digest.lower() == expected.lower() else "not_listed"
        if expected and status != "matches":
            status = "mismatch"
            mismatches.append(relative)
        category = ("independent_attachment" if relative.startswith("01_original_attachments/")
                    else "historical_terminal_log" if relative.startswith("02_historical_terminal_logs/")
                    else "reference_upload" if relative.startswith("03_reference_uploads/")
                    else "archive_documentation")
        inventory.append({"relative_path": relative, "category": category,
                          "bytes": path.stat().st_size, "sha256": digest,
                          "archive_declared_sha256": expected, "archive_hash_status": status,
                          "archive_claimed_step": entry.get("step", ""),
                          "archive_claimed_server_path": entry.get("server", ""),
                          "archive_note": entry.get("note", ""),
                          "execution_status": "not_established_by_archive_copy"})
        if path.suffix == ".sh":
            groups[digest].append(relative)
    missing_declared = sorted(set(metadata) - {r["relative_path"] for r in inventory})
    with (output / "script_inventory.tsv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(inventory[0]), delimiter="\t")
        writer.writeheader()
        writer.writerows(inventory)
    summary = {
        "catalogued_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_directory": str(source), "file_count": len(inventory),
        "shell_file_count": sum(len(v) for v in groups.values()),
        "unique_shell_content_count": len(groups),
        "category_counts": dict(collections.Counter(r["category"] for r in inventory)),
        "shell_content_groups": dict(groups), "hash_mismatches": mismatches,
        "missing_declared_files": missing_declared, "all_snapshot_bytes_verified": True,
        "software_report_sha256": sha256(args.versions),
        "commands_executed_from_archive": False,
        "evidence_limit": "Archive metadata contains historical status claims; copied files do not establish current server execution or success"
    }
    (output / "archive_catalog.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "shell_content_groups"}, ensure_ascii=False, indent=2))
    if mismatches or missing_declared:
        raise SystemExit("Archive integrity needs review")


if __name__ == "__main__":
    main()
