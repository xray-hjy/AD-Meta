from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.cli import import_dataset as import_module

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = BACKEND_ROOT / "storage_manifest.json"


def _required_text(dataset: dict[str, Any], key: str, index: int) -> str:
    value = dataset.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Dataset manifest entry {index} must include a non-empty '{key}'.")
    return value.strip()


def load_manifest(manifest_path: Path = DEFAULT_MANIFEST) -> list[dict[str, str]]:
    path = manifest_path.expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Storage manifest not found: {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    datasets = payload.get("datasets") if isinstance(payload, dict) else None
    if not isinstance(datasets, list) or not datasets:
        raise ValueError("Storage manifest must include a non-empty 'datasets' list.")

    normalized: list[dict[str, str]] = []
    seen_slugs: set[str] = set()
    for index, dataset in enumerate(datasets):
        if not isinstance(dataset, dict):
            raise ValueError(f"Dataset manifest entry {index} must be an object.")

        slug = _required_text(dataset, "slug", index)
        if slug in seen_slugs:
            raise ValueError(f"Duplicate dataset slug in storage manifest: {slug}")
        seen_slugs.add(slug)

        normalized.append(
            {
                "slug": slug,
                "name": _required_text(dataset, "name", index),
                "description": str(dataset.get("description") or "").strip(),
                "file": _required_text(dataset, "file", index),
            }
        )

    return normalized


def _resolve_raw_file(file_value: str, backend_root: Path) -> Path:
    raw_path = Path(file_value).expanduser()
    if raw_path.is_absolute():
        return raw_path.resolve()
    return (backend_root / raw_path).resolve()


def bootstrap_storage(
    manifest_path: Path = DEFAULT_MANIFEST,
    *,
    backend_root: Path = BACKEND_ROOT,
) -> list[dict[str, Any]]:
    datasets = load_manifest(manifest_path)
    root = backend_root.expanduser().resolve()
    results: list[dict[str, Any]] = []

    for dataset in datasets:
        source = _resolve_raw_file(dataset["file"], root)
        if not source.exists():
            raise FileNotFoundError(f"Raw file for {dataset['slug']} not found: {source}")

        dataset_id = import_module.import_dataset(
            source,
            dataset["slug"],
            dataset["name"],
            dataset["description"],
        )
        results.append(
            {
                "slug": dataset["slug"],
                "datasetId": dataset_id,
                "source": str(source),
            }
        )

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild local AD-Meta storage from tracked raw datasets.")
    parser.add_argument(
        "--manifest",
        default=DEFAULT_MANIFEST,
        type=Path,
        help="Path to backend/storage_manifest.json.",
    )
    args = parser.parse_args()

    results = bootstrap_storage(args.manifest)
    print(f"Bootstrapped {len(results)} dataset(s).")
    for result in results:
        print(f"- {result['slug']}: dataset {result['datasetId']}")


if __name__ == "__main__":
    main()
