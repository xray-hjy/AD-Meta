from __future__ import annotations

import argparse
from pathlib import Path

from app.cli.bootstrap_storage import DEFAULT_MANIFEST
from app.core.migrations import upgrade_database
from app.services.analysis_run_service import sync_analysis_runs_from_manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Register immutable analysis runs from a manifest.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()

    upgrade_database()
    results = sync_analysis_runs_from_manifest(args.manifest)
    for result in results:
        print(f"{result['key']}: {result['action']} (id={result['id']})")


if __name__ == "__main__":
    main()
