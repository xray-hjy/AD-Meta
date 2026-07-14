from __future__ import annotations

import argparse
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from app.core.config import DB_PATH
from app.core.database import connect, init_db, is_mysql


@dataclass(frozen=True)
class TableSpec:
    name: str
    columns: tuple[str, ...]


# Parent tables must be copied before tables that reference them.
TABLES = (
    TableSpec(
        "datasets",
        (
            "id", "slug", "name", "description", "original_filename", "file_type",
            "file_size", "status", "sample_count", "species_count", "feature_count",
            "feature_kind", "feature_label", "group_counts_json", "import_warnings_json",
            "created_at", "updated_at", "published_at",
        ),
    ),
    TableSpec(
        "taxon_anno",
        (
            "taxon_id", "kingdom", "phylum", "class", "tax_order", "family", "genus",
            "species", "full_taxonomy", "taxon_rank", "canonical_name", "taxonomy_source",
            "taxonomy_version", "taxonomy_hash",
        ),
    ),
    TableSpec("ko_anno", ("ko_id", "ko_name", "pathway", "module")),
    TableSpec("ref_study", ("study_id", "data_source", "citation", "source_database")),
    TableSpec(
        "sample_info",
        ("sample_id", "dataset_id", "sample_code", "phenotype", "seq_platform", "batch_id", "data_source"),
    ),
    TableSpec(
        "chart_artifacts",
        (
            "id", "dataset_id", "chart_type", "cache_path", "params_hash",
            "compute_version", "created_at", "updated_at",
        ),
    ),
    TableSpec(
        "import_jobs",
        ("id", "dataset_id", "status", "stage", "message", "error", "started_at", "finished_at"),
    ),
    TableSpec(
        "species_abundance",
        ("abundance_id", "dataset_id", "sample_id", "taxon_id", "abundance"),
    ),
    TableSpec(
        "ko_abundance",
        ("ko_abundance_id", "dataset_id", "sample_id", "ko_id", "abundance"),
    ),
    TableSpec(
        "ref_sample_info",
        ("ref_sample_id", "study_id", "data_source", "phenotype", "citation"),
    ),
    TableSpec(
        "ad_disease_marker",
        (
            "marker_id", "taxon_id", "study_id", "disease", "direction", "effect_metric",
            "effect_size", "sample_size", "p_value", "q_value", "consistency",
            "evidence_level", "source_database", "study_source",
        ),
    ),
)


def _source_tables(conn: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    }


def _batches(cursor: sqlite3.Cursor, batch_size: int) -> Iterable[list[tuple]]:
    while rows := cursor.fetchmany(batch_size):
        yield [tuple(row) for row in rows]


def migrate_sqlite_to_mysql(source: Path = DB_PATH, *, batch_size: int = 5_000) -> dict[str, int]:
    if not is_mysql():
        raise RuntimeError("Set AD_META_DB_ENGINE=mysql before running the migration.")
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1.")

    source = source.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"SQLite database not found: {source}")

    init_db()
    source_conn = sqlite3.connect(source)
    source_conn.row_factory = sqlite3.Row
    try:
        missing = [spec.name for spec in TABLES if spec.name not in _source_tables(source_conn)]
        if missing:
            raise RuntimeError(f"SQLite database is missing required tables: {', '.join(missing)}")

        with connect() as target:
            populated = [
                spec.name
                for spec in TABLES
                if int(target.execute(f"SELECT COUNT(*) AS count FROM `{spec.name}`").fetchone()["count"]) > 0
            ]
            if populated:
                raise RuntimeError(
                    "MySQL target is not empty; refusing to overwrite tables: " + ", ".join(populated)
                )

            copied: dict[str, int] = {}
            for spec in TABLES:
                columns = ", ".join(f"`{column}`" for column in spec.columns)
                placeholders = ", ".join("?" for _ in spec.columns)
                insert_sql = f"INSERT INTO `{spec.name}` ({columns}) VALUES ({placeholders})"
                cursor = source_conn.execute(f"SELECT {columns} FROM `{spec.name}`")
                copied[spec.name] = 0
                for rows in _batches(cursor, batch_size):
                    target.executemany(insert_sql, rows)
                    copied[spec.name] += len(rows)
                print(f"- {spec.name}: {copied[spec.name]} row(s)", flush=True)
    finally:
        source_conn.close()

    return copied


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy an AD-Meta SQLite database into an empty MySQL database.")
    parser.add_argument("--source", type=Path, default=DB_PATH, help="Path to the existing SQLite database.")
    parser.add_argument("--batch-size", type=int, default=5_000, help="Rows copied per insert batch.")
    args = parser.parse_args()

    print(f"Migrating SQLite data from {args.source} to the configured MySQL database...")
    copied = migrate_sqlite_to_mysql(args.source, batch_size=args.batch_size)
    print(f"Migration complete: {sum(copied.values())} row(s) copied across {len(copied)} tables.")


if __name__ == "__main__":
    main()
