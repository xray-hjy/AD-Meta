from __future__ import annotations

from app.cli.bootstrap_storage import DEFAULT_MANIFEST, bootstrap_storage
from app.core.database import connect
from app.core.migrations import upgrade_database
from app.services.analysis_run_service import sync_analysis_runs_from_manifest


def prepare_runtime() -> str:
    """Prepare a usable runtime without rebuilding already-published datasets."""

    upgrade_database()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS value
            FROM datasets
            WHERE status = 'published' AND current_revision_id IS NOT NULL
            """
        ).fetchone()
        published_dataset_count = int(row["value"])

    if published_dataset_count == 0:
        bootstrap_storage(DEFAULT_MANIFEST)
        return "bootstrapped_storage"

    sync_analysis_runs_from_manifest(DEFAULT_MANIFEST)
    return "synced_analysis_runs"


def main() -> None:
    print(prepare_runtime())


if __name__ == "__main__":
    main()
