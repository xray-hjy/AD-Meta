from __future__ import annotations

import argparse
import json

from app.core.config import SETTINGS
from app.core.migrations import upgrade_database
from app.services.mag_data_service import load_mag_dataset
from app.services.mag_database_service import import_mag_dataset


def import_versions(versions: list[str]) -> list[dict]:
    upgrade_database()
    results = []
    for version in versions:
        data = load_mag_dataset(
            package_root=SETTINGS.mag_data_root,
            version=version,
            storage_backend="package",
        )
        results.append(import_mag_dataset(data))
    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate immutable MAG packages and import them into the active database."
    )
    parser.add_argument(
        "--version",
        action="append",
        dest="versions",
        help="MAG package version to import; repeat for multiple versions. Defaults to the configured version.",
    )
    args = parser.parse_args()
    versions = args.versions or [SETTINGS.mag_data_version]
    for result in import_versions(versions):
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
