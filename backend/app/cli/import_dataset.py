from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from app.compute.precompute import precompute_all, write_json
from app.core.config import CACHE_ROOT, COMPUTE_VERSION, RAW_ROOT
from app.core.database import connect, init_db, utcnow


def _relative_to_backend(path: Path) -> str:
    backend_root = Path(__file__).resolve().parents[2]
    return str(path.resolve().relative_to(backend_root.resolve()))


def import_dataset(file_path: Path, slug: str, name: str, description: str = "") -> int:
    init_db()
    source = file_path.expanduser().resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    now = utcnow()
    file_type = source.suffix.lower().lstrip(".")
    raw_dir = RAW_ROOT / slug
    cache_dir = CACHE_ROOT / slug
    raw_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / f"raw.{file_type}"
    shutil.copy2(source, raw_path)

    with connect() as conn:
        existing = conn.execute("SELECT id FROM datasets WHERE slug = ?", (slug,)).fetchone()
        if existing:
            dataset_id = existing["id"]
            conn.execute(
                """
                UPDATE datasets
                SET name = ?, description = ?, original_filename = ?, file_type = ?,
                    file_size = ?, status = 'importing', updated_at = ?, published_at = NULL
                WHERE id = ?
                """,
                (name, description, source.name, file_type, source.stat().st_size, now, dataset_id),
            )
            conn.execute("DELETE FROM chart_artifacts WHERE dataset_id = ?", (dataset_id,))
        else:
            cursor = conn.execute(
                """
                INSERT INTO datasets (
                  slug, name, description, original_filename, file_type, file_size,
                  status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'importing', ?, ?)
                """,
                (slug, name, description, source.name, file_type, source.stat().st_size, now, now),
            )
            dataset_id = int(cursor.lastrowid)

        job_cursor = conn.execute(
            """
            INSERT INTO import_jobs (dataset_id, status, stage, message, started_at)
            VALUES (?, 'running', 'precompute', 'Computing chart artifacts', ?)
            """,
            (dataset_id, now),
        )
        job_id = int(job_cursor.lastrowid)

    try:
        published_at = utcnow()
        summary, artifacts, warnings = precompute_all(raw_path, slug, name, published_at)

        with connect() as conn:
            for chart_type, payload in artifacts.items():
                cache_path = cache_dir / f"{chart_type}.json"
                write_json(cache_path, payload)
                conn.execute(
                    """
                    INSERT INTO chart_artifacts (
                      dataset_id, chart_type, cache_path, params_hash,
                      compute_version, created_at, updated_at
                    )
                    VALUES (?, ?, ?, '', ?, ?, ?)
                    ON CONFLICT(dataset_id, chart_type) DO UPDATE SET
                      cache_path = excluded.cache_path,
                      compute_version = excluded.compute_version,
                      updated_at = excluded.updated_at
                    """,
                    (
                        dataset_id,
                        chart_type,
                        _relative_to_backend(cache_path),
                        COMPUTE_VERSION,
                        published_at,
                        published_at,
                    ),
                )

            conn.execute(
                """
                UPDATE datasets
                SET status = 'published',
                    sample_count = ?,
                    species_count = ?,
                    group_counts_json = ?,
                    import_warnings_json = ?,
                    updated_at = ?,
                    published_at = ?
                WHERE id = ?
                """,
                (
                    summary["totalSamples"],
                    summary["totalSpecies"],
                    json.dumps(summary["groupCounts"], ensure_ascii=False),
                    json.dumps(warnings, ensure_ascii=False),
                    published_at,
                    published_at,
                    dataset_id,
                ),
            )
            conn.execute(
                """
                UPDATE import_jobs
                SET status = 'success', stage = 'complete', message = 'Dataset published',
                    finished_at = ?
                WHERE id = ?
                """,
                (published_at, job_id),
            )
    except Exception as exc:
        failed_at = utcnow()
        with connect() as conn:
            conn.execute(
                "UPDATE datasets SET status = 'failed', updated_at = ? WHERE id = ?",
                (failed_at, dataset_id),
            )
            conn.execute(
                """
                UPDATE import_jobs
                SET status = 'failed', stage = 'failed', error = ?, finished_at = ?
                WHERE id = ?
                """,
                (str(exc), failed_at, job_id),
            )
        raise

    return dataset_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Import and precompute an AD-Meta public dataset.")
    parser.add_argument("--file", required=True, type=Path, help="Path to .xlsx, .csv, or .tsv input file.")
    parser.add_argument("--slug", required=True, help="Public dataset slug, for example ad-nc-species.")
    parser.add_argument("--name", required=True, help="Public dataset display name.")
    parser.add_argument("--description", default="", help="Optional public dataset description.")
    args = parser.parse_args()

    dataset_id = import_dataset(args.file, args.slug, args.name, args.description)
    print(f"Imported dataset {dataset_id} ({args.slug})")


if __name__ == "__main__":
    main()
