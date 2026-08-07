from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pytest

from app.core import database
from app.core.migrations import upgrade_database
from app.services import analysis_run_service
from app.services.analysis_run_service import (
    AnalysisManifestConflict,
    get_analysis_run,
    list_analysis_runs,
    sync_analysis_runs_from_manifest,
)


def _seed_dataset(conn, slug: str, revision_key: str, samples: list[tuple[str, str]]) -> None:
    now = "2026-07-28T00:00:00+00:00"
    dataset_cursor = conn.execute(
        """
        INSERT INTO datasets (
          slug, name, description, status, sample_count, species_count,
          feature_count, feature_kind, feature_label, group_counts_json,
          import_warnings_json, created_at, updated_at, published_at
        ) VALUES (?, ?, '', 'published', ?, 0, 1, ?, ?, '{}', '[]', ?, ?, ?)
        """,
        (
            slug,
            slug,
            len(samples),
            "ko" if "ko" in slug else "taxonomy",
            "KO" if "ko" in slug else "species",
            now,
            now,
            now,
        ),
    )
    dataset_id = int(dataset_cursor.lastrowid)
    revision_cursor = conn.execute(
        """
        INSERT INTO dataset_revisions (
          dataset_id, revision_key, status, source_sha256, source_file_size,
          compute_version, params_hash, created_at, published_at
        ) VALUES (?, ?, 'published', ?, 1, 'test', ?, ?, ?)
        """,
        (dataset_id, revision_key, "a" * 64, "b" * 64, now, now),
    )
    revision_id = int(revision_cursor.lastrowid)
    conn.execute(
        "UPDATE datasets SET current_revision_id = ? WHERE id = ?",
        (revision_id, dataset_id),
    )
    conn.executemany(
        """
        INSERT INTO revision_sample_info (
          revision_id, dataset_id, sample_code, phenotype
        ) VALUES (?, ?, ?, ?)
        """,
        [(revision_id, dataset_id, code, phenotype) for code, phenotype in samples],
    )


def _manifest(path: Path, run_key: str = "run-1") -> Path:
    payload = {
        "manifestVersion": "1.0",
        "analysisRuns": [
            {
                "key": run_key,
                "name": "AD/NC baseline",
                "pipeline": {"name": "test", "version": "1"},
                "artifacts": [
                    {
                        "key": "species",
                        "type": "species_abundance",
                        "datasetSlug": "species",
                    },
                    {
                        "key": "ko",
                        "type": "ko_abundance",
                        "datasetSlug": "ko",
                    },
                ],
            }
        ],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_storage_manifest_without_analysis_runs_is_a_valid_noop() -> None:
    with TemporaryDirectory() as tmpdir:
        manifest = Path(tmpdir) / "manifest.json"
        manifest.write_text(json.dumps({"datasets": []}), encoding="utf-8")

        assert sync_analysis_runs_from_manifest(manifest) == []


def test_manifest_registers_union_and_exact_artifact_coverage() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "analysis.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_dataset(conn, "species", "species-r1", [("S1", "AD"), ("S2", "NC")])
                _seed_dataset(conn, "ko", "ko-r1", [("S1", "AD")])
            result = sync_analysis_runs_from_manifest(manifest)
            runs = list_analysis_runs()
            database.dispose_engine()

    assert result[0]["action"] == "created"
    assert runs[0]["sampleCount"] == 2
    assert runs[0]["groupCounts"] == {"AD": 1, "NC": 1}
    coverage = {artifact["key"]: artifact for artifact in runs[0]["artifacts"]}
    assert coverage["species"]["sampleCount"] == 2
    assert coverage["species"]["coverageFraction"] == 1.0
    assert coverage["ko"]["sampleCount"] == 1
    assert coverage["ko"]["coverageFraction"] == 0.5


def test_list_and_get_batch_related_rows_without_n_plus_one_queries() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "analysis.sqlite3"
        first_manifest = _manifest(Path(tmpdir) / "manifest-1.json", "run-1")
        second_manifest = _manifest(Path(tmpdir) / "manifest-2.json", "run-2")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_dataset(conn, "species", "species-r1", [("S1", "AD"), ("S2", "NC")])
                _seed_dataset(conn, "ko", "ko-r1", [("S1", "AD")])
            sync_analysis_runs_from_manifest(first_manifest)
            sync_analysis_runs_from_manifest(second_manifest)

            statements = []
            real_connect = database.connect

            @contextmanager
            def counting_connect():
                with real_connect() as connection:
                    class CountingConnection:
                        def execute(self, statement, parameters=()):
                            statements.append(" ".join(statement.split()))
                            return connection.execute(statement, parameters)

                    yield CountingConnection()

            with patch.object(analysis_run_service, "connect", counting_connect):
                runs = list_analysis_runs()
                list_query_count = len(statements)
                statements.clear()
                selected = get_analysis_run("run-2")
                get_statements = list(statements)
            database.dispose_engine()

    assert len(runs) == 2
    assert list_query_count == 4
    assert selected["key"] == "run-2"
    assert len(get_statements) == 4
    assert "WHERE analysis_runs.run_key = ?" in get_statements[0]


def test_manifest_rejects_cross_artifact_phenotype_conflict() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "analysis.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_dataset(conn, "species", "species-r1", [("S1", "AD")])
                _seed_dataset(conn, "ko", "ko-r1", [("S1", "NC")])
            with pytest.raises(ValueError, match="phenotype conflict"):
                sync_analysis_runs_from_manifest(manifest)
            database.dispose_engine()


def test_registered_run_is_immutable_across_revision_changes() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "analysis.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_dataset(conn, "species", "species-r1", [("S1", "AD")])
                _seed_dataset(conn, "ko", "ko-r1", [("S1", "AD")])
            sync_analysis_runs_from_manifest(manifest)
            with database.connect() as conn:
                conn.execute(
                    "UPDATE dataset_revisions SET revision_key = 'species-r2' WHERE revision_key = 'species-r1'"
                )
            with pytest.raises(AnalysisManifestConflict, match="immutable"):
                sync_analysis_runs_from_manifest(manifest)
            database.dispose_engine()


def test_registered_run_allows_display_metadata_updates() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "analysis.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_dataset(conn, "species", "species-r1", [("S1", "AD")])
                _seed_dataset(conn, "ko", "ko-r1", [("S1", "AD")])
            sync_analysis_runs_from_manifest(manifest)

            payload = json.loads(manifest.read_text(encoding="utf-8"))
            payload["analysisRuns"][0]["name"] = "Current AD/NC analysis result"
            payload["analysisRuns"][0]["description"] = "Updated display copy"
            manifest.write_text(json.dumps(payload), encoding="utf-8")

            result = sync_analysis_runs_from_manifest(manifest)
            runs = list_analysis_runs()
            database.dispose_engine()

    assert result[0]["action"] == "updated_metadata"
    assert runs[0]["name"] == "Current AD/NC analysis result"
    assert runs[0]["description"] == "Updated display copy"
