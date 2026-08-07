from __future__ import annotations

import sqlite3
import unittest
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.cli import migrate_sqlite_to_mysql as migration
from app.core.analysis_schema import SQLITE_ANALYSIS_SCHEMA
from app.core.database import SQLITE_SCHEMA, _ensure_sqlite_columns
from app.core.projection_audit_schema import SQLITE_PROJECTION_AUDIT_SCHEMA


def create_current_schema(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        f"{SQLITE_SCHEMA}\n{SQLITE_ANALYSIS_SCHEMA}\n{SQLITE_PROJECTION_AUDIT_SCHEMA}"
    )
    _ensure_sqlite_columns(connection)
    return connection


class SqliteToMysqlMigrationTests(unittest.TestCase):
    def test_current_schema_has_a_complete_migration_mapping(self) -> None:
        with TemporaryDirectory() as tmpdir:
            connection = create_current_schema(Path(tmpdir) / "schema.sqlite3")
            try:
                source_tables = migration._source_tables(connection) - migration.IGNORED_SOURCE_TABLES
                specs = {spec.name: spec for spec in migration.TABLES}
                self.assertEqual(source_tables, set(specs))
                for table in source_tables:
                    self.assertLessEqual(
                        migration._source_columns(connection, table),
                        set(specs[table].columns),
                        table,
                    )
            finally:
                connection.close()

    def test_copies_revision_analysis_and_projection_audit_records(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            source_path = root / "source.sqlite3"
            source = create_current_schema(source_path)
            source.execute(
                """
                INSERT INTO datasets (
                  id, slug, name, created_at, updated_at, current_revision_id,
                  analysis_status, provenance_json
                ) VALUES (1, 'dataset-1', 'Dataset 1', '2026-08-03', '2026-08-03', 10,
                          'formal_complete', '{"source":"test"}')
                """
            )
            source.execute(
                """
                INSERT INTO dataset_revisions (
                  id, dataset_id, revision_key, source_sha256, source_file_size,
                  compute_version, params_hash, created_at
                ) VALUES (10, 1, 'revision-1', 'abc', 123, 'v1', 'params', '2026-08-03')
                """
            )
            source.execute(
                """
                INSERT INTO analysis_runs (
                  id, run_key, name, manifest_version, manifest_sha256, created_at
                ) VALUES (20, 'run-1', 'Run 1', '1', 'manifest', '2026-08-03')
                """
            )
            source.execute(
                """
                INSERT INTO analysis_artifacts (
                  id, analysis_run_id, artifact_key, artifact_type, dataset_id,
                  dataset_revision_id, created_at
                ) VALUES (30, 20, 'artifact-1', 'composition', 1, 10, '2026-08-03')
                """
            )
            source.execute(
                """
                INSERT INTO projection_audit_artifacts (
                  id, analysis_run_id, source_artifact_id, projection_key,
                  projection_kind, section_key, source_revision_key, compute_version,
                  schema_version, created_at, updated_at
                ) VALUES (40, 20, 30, 'projection', 'composition', 'default',
                          'revision-1', 'v1', '1', '2026-08-03', '2026-08-03')
                """
            )
            source.execute(
                """
                INSERT INTO projection_audit_rows (
                  id, audit_artifact_id, row_index, feature, row_json
                ) VALUES (50, 40, 0, 'K00001', '{"feature":"K00001"}')
                """
            )
            source.commit()
            source.close()

            target = create_current_schema(root / "target.sqlite3")

            @contextmanager
            def target_connection():
                try:
                    yield target
                    target.commit()
                except Exception:
                    target.rollback()
                    raise

            with (
                patch.object(migration, "is_mysql", return_value=True),
                patch.object(migration, "upgrade_database"),
                patch.object(migration, "connect", target_connection),
            ):
                copied = migration.migrate_sqlite_to_mysql(source_path, batch_size=2)

            self.assertEqual(copied["dataset_revisions"], 1)
            self.assertEqual(copied["analysis_runs"], 1)
            self.assertEqual(copied["projection_audit_rows"], 1)
            dataset = target.execute(
                "SELECT current_revision_id, analysis_status, provenance_json FROM datasets"
            ).fetchone()
            self.assertEqual(dataset["current_revision_id"], 10)
            self.assertEqual(dataset["analysis_status"], "formal_complete")
            self.assertEqual(dataset["provenance_json"], '{"source":"test"}')
            target.close()


if __name__ == "__main__":
    unittest.main()
