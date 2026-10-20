from __future__ import annotations

import json

from app.cli.bootstrap_storage import bootstrap_storage
from app.core.config import BACKEND_ROOT
from app.core.database import connect
from app.core.migrations import upgrade_database
from app.core.storage_paths import DEFAULT_MANIFEST
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
    else:
        sync_analysis_runs_from_manifest(DEFAULT_MANIFEST)
    prepare_cohort_results()
    return "bootstrapped_storage" if published_dataset_count == 0 else "synced_analysis_runs"


def prepare_cohort_results() -> None:
    # Offline raw delivery is optional for a species/KO-only installation.
    # A completed release is never re-imported merely because the server starts.
    manifest = json.loads(DEFAULT_MANIFEST.read_text(encoding='utf-8'))
    for cohort in manifest.get('cohorts', []):
        with connect() as conn:
            exists = conn.execute('SELECT current_release FROM cohorts WHERE cohort_key = ?', (cohort['key'],)).fetchone()
        if exists and exists['current_release']:
            continue
        required = [value for spec in cohort['modules'].values() if spec.get('required') for value in spec.get('files', {}).values()]
        if required and all((BACKEND_ROOT / path).is_file() for path in required):
            from app.services.cohort_import import import_cohort

            import_cohort(cohort['key'])


def main() -> None:
    print(prepare_runtime())


if __name__ == "__main__":
    main()
