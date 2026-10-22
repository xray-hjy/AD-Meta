"""Local-only evidence support delivery with source, primary derivative and integrity checks.

This is not a license to publicly redistribute original-study files and is not a
database backup. Deploy alongside the same application code and published revision.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path, PurePosixPath

from app.core.config import BACKEND_ROOT

REPO = BACKEND_ROOT.parent


def safe(value):
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "\\" in value or ":" in value or path.as_posix() != value:
        raise ValueError("Unsafe archive path")
    return value


def verify(archive: Path, destination: Path | None = None):
    with zipfile.ZipFile(archive) as z:
        manifest = json.loads(z.read("evidence-support-manifest.json"))
        expected = manifest["files"]
        names = z.namelist()
        if len(names) != len(set(v.casefold() for v in names)) or set(names) != set(expected) | {"evidence-support-manifest.json"}:
            raise ValueError("Archive file list mismatch")
        for name in names:
            safe(name)
            if name in expected:
                raw = z.read(name)
                if len(raw) != expected[name]["bytes"] or hashlib.sha256(raw).hexdigest() != expected[name]["sha256"]:
                    raise ValueError("Evidence support integrity mismatch: " + name)
        registry = json.loads(z.read("backend/metadata/gmrepo_research_registry.json"))
        if len(registry["sources"]) != manifest["sourceChecks"]:
            raise ValueError("Source count mismatch")
        for source in registry["sources"]:
            target = "ADMetaData/reference/gmrepo/processed/2026-10-09-v1/" + source["path"] if source["origin"] == "sealed_package" else source["path"]
            safe(target)
            if expected.get(target) != {"sha256": source["sha256"], "bytes": source["bytes"]}:
                raise ValueError("Delivery omits or mismatches a registered source: " + source["sourceId"])
        if destination:
            destination = destination.resolve()
            if destination.exists():
                raise ValueError("Extract only into a new directory; existing files are never overwritten")
            destination.mkdir(parents=True)
            for name in names:
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(name))
    return {"status": "verified", "files": len(expected), "sourceChecks": manifest["sourceChecks"], "primary": manifest["primary"], "databaseIncluded": False}


def package(output: Path):
    from app.cli.install_gmrepo import read_descriptor, verify_directory
    from app.services import external_wgs_service as wgs
    from app.services import gmrepo_ledger_service as ledger
    from app.services import gmrepo_primary_genus as primary
    from app.services import gmrepo_service as reference
    from app.services import gmrepo_snapshot_service as snapshots

    if output.exists():
        raise ValueError("Do not overwrite an existing delivery")
    data = reference.load_reference_dataset()
    record, status, _ = ledger.registry(data)
    if record is None or status != "bound":
        raise ValueError("Source registry is not fully verified")
    checks = ledger.source_checks(data, record)
    if any(c["availability"] != "verified" for c in checks):
        raise ValueError("Source registry is not fully verified")
    core = read_descriptor()
    verify_directory(data.root, core)
    derived = primary.snapshot()
    files = {}

    def add(path, name=None):
        path = path.resolve()
        if not path.is_relative_to(REPO.resolve()) or not path.is_file():
            raise ValueError("Delivery source outside repository or unavailable")
        key = safe(name or path.relative_to(REPO).as_posix())
        if key in files and files[key] != path:
            raise ValueError("Conflicting delivery destinations")
        files[key] = path

    for f in core["files"]:
        add(data.root / f["path"], "ADMetaData/reference/gmrepo/processed/2026-10-09-v1/" + f["path"])
    for s in record.sources:
        if s.origin != "sealed_package":
            add(REPO / s.path)
    for path in (BACKEND_ROOT / "metadata").glob("gmrepo*.json"):
        add(path)
    add(BACKEND_ROOT / "metadata/verified_cohorts.json")
    add(BACKEND_ROOT / "storage/provenance/CRA014435/2026-10-01/samples_current185.tsv")
    context = json.loads((BACKEND_ROOT / "metadata/gmrepo_primary_context.json").read_bytes())
    for s in context["sources"]:
        add(REPO / s["path"])
    discovery = json.loads(ledger.DISCOVERY_PATH.read_bytes())
    for q in discovery["queries"]:
        if q.get("status") == "retrieved":
            add(REPO / discovery["archivePath"] / q["file"])
    inventory_source = next(s for s in record.sources if s.sourceId == "complete-all-run-inventory")
    inventory = json.loads((REPO / inventory_source.path).read_bytes())
    for page in inventory["records"]:
        add((BACKEND_ROOT / page["archivePath"] / page["file"]).resolve())
    wgs_data, _ = wgs.load()
    add(wgs.ROOT / "manifest.json")
    for path in wgs.ROOT.rglob("*"):
        if path.is_file():
            add(path)
    add(wgs.AUTHOR_RECORD)
    for receipt in wgs_data["sourceReceipts"]:
        add(wgs.AUTHOR_FILES / receipt["file"])
    for path in derived["root"].iterdir():
        add(path)
    for name in ("taxonomy.tsv", "samples.tsv"):
        add(BACKEND_ROOT / "storage/raw/ad-nc-species/PRJCA022804" / name)
    manifest = {"schemaVersion": 1, "scope": "local_research_evidence_support", "redistribution": "not_publication_or_commercial_permission",
                "referenceFingerprint": data.fingerprint, "registryVersion": record.version, "codeFingerprint": snapshots.code_fingerprint(),
                "sourceChecks": len(checks), "primary": {"fingerprint": derived["fingerprint"], "provenance": derived["provenance"], "familySize": derived["statistics"]["familySize"]},
                "databaseIncluded": False,
                "deployment": "Requires the same application code and a database containing the declared published species revision. New imports are new revisions; do not claim archived IDs as newly reproduced. For database-free numerical verification use the standalone per-evaluation replay ZIP.",
                "files": {key: {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for key, path in sorted(files.items())}}
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as z:
        for key, path in sorted(files.items()):
            z.write(path, key)
        z.writestr("evidence-support-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False))
    output.with_suffix(".manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({**verify(output), "archive": str(output), "bytes": output.stat().st_size}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path)
    p.add_argument("--check", type=Path)
    p.add_argument("--extract-to", type=Path)
    a = p.parse_args()
    if bool(a.output) == bool(a.check) or (a.extract_to and not a.check):
        p.error("Choose --output, or --check [--extract-to NEW_DIRECTORY]")
    if a.output:
        package(a.output.resolve())
    else:
        print(json.dumps(verify(a.check, a.extract_to), ensure_ascii=False, indent=2))
