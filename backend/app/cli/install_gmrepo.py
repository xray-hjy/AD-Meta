"""Install the pinned GMrepo runtime bundle without changing existing data."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import stat
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ROOT = REPO_ROOT / "ADMetaData/reference/gmrepo/processed/2026-10-09-v1"
DESCRIPTOR_PATH = REPO_ROOT / "data-packages/gmrepo-2026-10-09-v1.json"
REVIEW_PATH = REPO_ROOT / "backend/metadata/gmrepo_inference_review.json"
MAX_UNPACKED_BYTES = 64 * 1024 * 1024


class PackageError(ValueError):
    """The bundled snapshot or the installation does not match its contract."""


def _portable_path(value: str) -> str:
    path = PurePosixPath(value)
    if (
        not value or path.is_absolute() or path.as_posix() != value
        or "\\" in value or ":" in value or ".." in path.parts
        or any(part.endswith((".", " ")) for part in path.parts)
    ):
        raise PackageError(f"Unsafe package path: {value!r}")
    return value


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _read_archive(descriptor: dict[str, Any], descriptor_path: Path) -> bytes:
    raw = (descriptor_path.parent / descriptor["archive"]).read_bytes()
    if len(raw) != descriptor["archive_bytes"] or _digest(raw) != descriptor["archive_sha256"]:
        raise PackageError("GMrepo ZIP failed SHA-256 verification. Restore data-packages from GitHub.")
    return raw


def read_descriptor(path: Path = DESCRIPTOR_PATH) -> dict[str, Any]:
    descriptor = json.loads(path.read_bytes())
    if descriptor["schema_version"] != 1:
        raise PackageError("Unsupported GMrepo bundle descriptor.")
    names = [_portable_path(row["path"]) for row in descriptor["files"]]
    if len(set(name.casefold() for name in names)) != len(names) or "processing_manifest.json" not in names:
        raise PackageError("Duplicate paths or missing processing manifest.")
    size = sum(row["bytes"] for row in descriptor["files"])
    if any(row["bytes"] < 0 for row in descriptor["files"]) or not 0 < size <= MAX_UNPACKED_BYTES:
        raise PackageError("Invalid GMrepo bundle size.")
    _portable_path(descriptor["archive"])
    review = json.loads(REVIEW_PATH.read_bytes())
    if review["referenceFingerprint"] != descriptor["fingerprint"]:
        raise PackageError("GMrepo bundle does not match the checked-in identity review.")
    if not all(file in names for entry in review["cohorts"].values() for file in entry["evidence"]):
        raise PackageError("GMrepo bundle is missing identity review evidence.")
    return descriptor


def verify_directory(root: Path, descriptor: dict[str, Any]) -> None:
    """Verify every delivered file against both the bundle and the original seal."""
    manifest_raw = (root / "processing_manifest.json").read_bytes()
    if _digest(manifest_raw) != descriptor["fingerprint"]:
        raise PackageError("GMrepo processing fingerprint does not match the bundled version.")
    manifest = json.loads(manifest_raw)
    if manifest["version"] != descriptor["version"]:
        raise PackageError("GMrepo processing version mismatch.")
    sealed = {row["path"]: row for row in manifest["files"]}
    for row in descriptor["files"]:
        target = root / row["path"]
        if target.is_symlink() or root.resolve() not in target.resolve().parents:
            raise PackageError(f"GMrepo file escapes its data directory: {row['path']}")
        raw = target.read_bytes()
        if len(raw) != row["bytes"] or _digest(raw) != row["sha256"]:
            raise PackageError(f"GMrepo file failed verification: {row['path']}")
        if row["path"] != "processing_manifest.json" and sealed.get(row["path"]) != row:
            raise PackageError(f"GMrepo file does not match the original seal: {row['path']}")


def install_package(destination: Path, descriptor_path: Path = DESCRIPTOR_PATH) -> str:
    descriptor = read_descriptor(descriptor_path)
    if destination.is_symlink():
        raise PackageError("GMrepo installation destination must not be a symlink.")
    if destination.exists():
        try:
            verify_directory(destination, descriptor)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise PackageError(
                f"Existing GMrepo directory is incomplete, damaged, or a different version: {destination}. "
                "It was left unchanged. Back it up and choose a new empty destination before installing."
            ) from exc
        return "already_verified"

    archive_raw = _read_archive(descriptor, descriptor_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{destination.name}.install-", dir=destination.parent))
    try:
        with zipfile.ZipFile(io.BytesIO(archive_raw)) as archive:
            members = archive.infolist()
            expected = {row["path"]: row for row in descriptor["files"]}
            paths = [_portable_path(member.filename) for member in members]
            if len(paths) != len(set(paths)) or set(paths) != set(expected):
                raise PackageError("GMrepo ZIP file list does not match its descriptor.")
            for member in members:
                if (
                    member.is_dir() or stat.S_ISLNK(member.external_attr >> 16)
                    or member.file_size != expected[member.filename]["bytes"]
                ):
                    raise PackageError(f"Invalid GMrepo ZIP entry: {member.filename}")
                target = staging / member.filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(member))
        verify_directory(staging, descriptor)
        if destination.exists() or destination.is_symlink():
            raise PackageError("GMrepo destination appeared during installation; it was left unchanged.")
        staging.rename(destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return "installed"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, help="Explicit data directory (relative to the repository).")
    parser.add_argument("--check", action="store_true", help="Verify the installed bundle without writing files.")
    parser.add_argument("--auto", action="store_true", help="Keep a custom GMrepo data root under operator control.")
    args = parser.parse_args()
    if args.destination is not None:
        destination = args.destination
    else:
        # Normal application entry uses the same .env / environment settings as the API.
        # --destination also permits standalone installation with standard-library Python.
        from app.core.config import SETTINGS
        destination = SETTINGS.gmrepo_data_root
    if not destination.is_absolute():
        destination = REPO_ROOT / destination
    if args.auto and destination.resolve() != DEFAULT_ROOT.resolve():
        print(f"GMrepo: custom data root preserved: {destination}")
        return
    try:
        descriptor = read_descriptor()
        if args.check:
            _read_archive(descriptor, DESCRIPTOR_PATH)
            verify_directory(destination, descriptor)
            action = "verified"
        else:
            action = install_package(destination)
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        print(f"GMrepo installation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    print(f"GMrepo {descriptor['version']}: {action}; {len(descriptor['files'])} files; {destination}")
    print(f"Processing fingerprint: {descriptor['fingerprint']}")


if __name__ == "__main__":
    main()
