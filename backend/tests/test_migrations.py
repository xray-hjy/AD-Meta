from __future__ import annotations

import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.core import database
from app.core.migrations import HEAD_REVISION, upgrade_database


def test_empty_database_upgrades_to_head() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "empty.sqlite3"
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            upgrade_database()

        connection = sqlite3.connect(db_path)
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        revision_tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'revision_%'"
            )
        }
        analysis_tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'analysis_%'"
            )
        }
        projection_audit_tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'table' AND name LIKE 'projection_audit_%'"
            )
        }
        projection_audit_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(projection_audit_artifacts)"
            )
        }
        projection_audit_indexes = {
            row[1]
            for row in connection.execute(
                "PRAGMA index_list(projection_audit_artifacts)"
            )
        }
        connection.close()

    assert version == HEAD_REVISION
    assert "revision_chart_artifacts" in revision_tables
    assert "revision_sample_info" in revision_tables
    assert "analysis_runs" in analysis_tables
    assert "analysis_artifacts" in analysis_tables
    assert "analysis_artifact_samples" in analysis_tables
    assert "projection_audit_artifacts" in projection_audit_tables
    assert "projection_audit_rows" in projection_audit_tables
    assert {"retention_class", "last_accessed_at", "expires_at"} <= projection_audit_columns
    assert "idx_projection_audit_artifacts_expiry" in projection_audit_indexes


def test_unversioned_legacy_database_is_stamped_once() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "legacy.sqlite3"
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.init_db()
            upgrade_database()
            upgrade_database()

        connection = sqlite3.connect(db_path)
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        version_rows = connection.execute("SELECT COUNT(*) FROM alembic_version").fetchone()[0]
        connection.close()

    assert version == HEAD_REVISION
    assert version_rows == 1
