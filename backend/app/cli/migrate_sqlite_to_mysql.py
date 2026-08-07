from __future__ import annotations

import argparse
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from app.core.config import DB_PATH
from app.core.database import connect, is_mysql
from app.core.migrations import upgrade_database


@dataclass(frozen=True)
class TableSpec:
    name: str
    columns: tuple[str, ...]
    required: bool = True


# Parent tables must be copied before tables that reference them. Tables added
# after the legacy SQLite release are optional so the original migration path
# remains usable, but every table/column present in a modern source is copied.
TABLES = (
    TableSpec(
        "datasets",
        (
            "id", "slug", "name", "description", "original_filename", "file_type",
            "file_size", "status", "sample_count", "species_count", "feature_count",
            "feature_kind", "feature_label", "group_counts_json", "import_warnings_json",
            "created_at", "updated_at", "published_at", "current_revision_id",
            "analysis_status", "provenance_json",
        ),
    ),
    TableSpec(
        "dataset_revisions",
        (
            "id", "dataset_id", "revision_key", "status", "abundance_scale",
            "normalization", "missing_value_policy", "covariates_json", "source_json",
            "source_sha256", "source_file_size", "compute_version", "params_hash",
            "validation_json", "warnings_json", "created_at", "published_at", "error",
        ),
        required=False,
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
        "revision_sample_info",
        (
            "sample_id", "revision_id", "dataset_id", "sample_code", "phenotype",
            "seq_platform", "batch_id", "data_source",
        ),
        required=False,
    ),
    TableSpec(
        "chart_artifacts",
        (
            "id", "dataset_id", "chart_type", "cache_path", "params_hash",
            "compute_version", "created_at", "updated_at",
        ),
    ),
    TableSpec(
        "revision_chart_artifacts",
        ("id", "revision_id", "chart_type", "cache_path", "sha256", "size_bytes", "created_at"),
        required=False,
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
        "revision_species_abundance",
        ("abundance_id", "revision_id", "dataset_id", "sample_id", "taxon_id", "abundance"),
        required=False,
    ),
    TableSpec(
        "ko_abundance",
        ("ko_abundance_id", "dataset_id", "sample_id", "ko_id", "abundance"),
    ),
    TableSpec(
        "revision_ko_abundance",
        ("ko_abundance_id", "revision_id", "dataset_id", "sample_id", "ko_id", "abundance"),
        required=False,
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
    TableSpec(
        "analysis_runs",
        (
            "id", "run_key", "name", "description", "status", "manifest_version",
            "manifest_sha256", "pipeline_json", "parameters_json", "reference_databases_json",
            "provenance_json", "created_at", "completed_at", "published_at",
        ),
        required=False,
    ),
    TableSpec(
        "analysis_run_samples",
        (
            "id", "analysis_run_id", "sample_code", "phenotype", "cohort_key",
            "source_study", "metadata_json",
        ),
        required=False,
    ),
    TableSpec(
        "analysis_artifacts",
        (
            "id", "analysis_run_id", "artifact_key", "artifact_type", "dataset_id",
            "dataset_revision_id", "uri", "sha256", "size_bytes", "schema_version",
            "metadata_json", "created_at",
        ),
        required=False,
    ),
    TableSpec(
        "analysis_artifact_samples",
        ("artifact_id", "run_sample_id"),
        required=False,
    ),
    TableSpec(
        "projection_audit_artifacts",
        (
            "id", "analysis_run_id", "source_artifact_id", "projection_key",
            "projection_kind", "section_key", "source_revision_key", "compute_version",
            "schema_version", "status", "storage_uri", "sha256", "row_count",
            "metadata_json", "error_message", "created_at", "updated_at", "completed_at",
        ),
        required=False,
    ),
    TableSpec(
        "projection_audit_rows",
        (
            "id", "audit_artifact_id", "row_index", "feature", "status_code",
            "reason_code", "row_json",
        ),
        required=False,
    ),
)

IGNORED_SOURCE_TABLES = {"sqlite_sequence", "alembic_version"}


def _source_tables(conn: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    }


def _source_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in conn.execute(f"PRAGMA table_info(`{table}`)").fetchall()}


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

    upgrade_database()
    source_conn = sqlite3.connect(source)
    source_conn.row_factory = sqlite3.Row
    try:
        source_tables = _source_tables(source_conn)
        missing = [spec.name for spec in TABLES if spec.required and spec.name not in source_tables]
        if missing:
            raise RuntimeError(f"SQLite database is missing required tables: {', '.join(missing)}")
        known_tables = {spec.name for spec in TABLES}
        unknown_tables = sorted(
            table
            for table in source_tables - known_tables - IGNORED_SOURCE_TABLES
            if not table.startswith("sqlite_")
        )
        if unknown_tables:
            raise RuntimeError(
                "SQLite database contains tables with no migration mapping: " + ", ".join(unknown_tables)
            )

        present_specs = [spec for spec in TABLES if spec.name in source_tables]
        copy_columns: dict[str, tuple[str, ...]] = {}
        for spec in present_specs:
            source_columns = _source_columns(source_conn, spec.name)
            unknown_columns = sorted(source_columns - set(spec.columns))
            if unknown_columns:
                raise RuntimeError(
                    f"SQLite table {spec.name} contains columns with no migration mapping: "
                    + ", ".join(unknown_columns)
                )
            copy_columns[spec.name] = tuple(column for column in spec.columns if column in source_columns)

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
            for spec in present_specs:
                selected_columns = copy_columns[spec.name]
                columns = ", ".join(f"`{column}`" for column in selected_columns)
                placeholders = ", ".join("?" for _ in selected_columns)
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
