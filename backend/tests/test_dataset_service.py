from __future__ import annotations

import json
import sqlite3
import unittest
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.core import database
from app.services import dataset_service


class ReadChartPathCompatibilityTests(unittest.TestCase):
    def test_matching_etag_returns_metadata_without_reading_the_artifact(self) -> None:
        with TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "datasets.sqlite3"
            expected_sha256 = "a" * 64
            with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
                database.dispose_engine()
                database.init_db()
                with database.connect() as conn:
                    dataset = conn.execute(
                        """
                        INSERT INTO datasets (slug, name, status, created_at, updated_at)
                        VALUES ('demo', 'Demo', 'published', '2026-08-03', '2026-08-03')
                        """
                    )
                    revision = conn.execute(
                        """
                        INSERT INTO dataset_revisions (
                          dataset_id, revision_key, status, source_sha256, source_file_size,
                          compute_version, params_hash, created_at
                        ) VALUES (?, 'revision-1', 'published', ?, 1, 'v1', ?, '2026-08-03')
                        """,
                        (dataset.lastrowid, "b" * 64, "c" * 64),
                    )
                    conn.execute(
                        "UPDATE datasets SET current_revision_id = ? WHERE id = ?",
                        (revision.lastrowid, dataset.lastrowid),
                    )
                    conn.execute(
                        """
                        INSERT INTO revision_chart_artifacts (
                          revision_id, chart_type, cache_path, sha256, size_bytes, created_at
                        ) VALUES (?, 'summary', 'storage/cache/missing.json', ?, 123, '2026-08-03')
                        """,
                        (revision.lastrowid, expected_sha256),
                    )

                with patch.object(Path, "read_bytes", side_effect=AssertionError("artifact was read")):
                    payload, error, metadata = dataset_service.read_chart_with_metadata(
                        "demo", "summary", if_none_match=f'"{expected_sha256}"'
                    )
                database.dispose_engine()

        self.assertIsNone(payload)
        self.assertIsNone(error)
        self.assertTrue(metadata["notModified"])
        self.assertEqual(metadata["etag"], expected_sha256)

    def test_dataset_list_reports_only_actual_public_artifacts(self) -> None:
        with TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "datasets.sqlite3"
            with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
                database.init_db()
                with database.connect() as conn:
                    cursor = conn.execute(
                        """
                        INSERT INTO datasets (
                          slug, name, status, current_revision_id, created_at, updated_at, published_at
                        ) VALUES ('demo', 'Demo', 'published', NULL, 'now', 'now', 'now')
                        """
                    )
                    dataset_id = int(cursor.lastrowid)
                    revision = conn.execute(
                        """
                        INSERT INTO dataset_revisions (
                          dataset_id, revision_key, status, source_sha256, source_file_size,
                          compute_version, params_hash, created_at
                        ) VALUES (?, 'revision-1', 'published', ?, 1, 'v1', ?, 'now')
                        """,
                        (dataset_id, "a" * 64, "b" * 64),
                    )
                    revision_id = int(revision.lastrowid)
                    conn.execute(
                        "UPDATE datasets SET current_revision_id = ? WHERE id = ?",
                        (revision_id, dataset_id),
                    )
                    for chart_type in ("species", "lda", "summary"):
                        conn.execute(
                            """
                            INSERT INTO revision_chart_artifacts (
                              revision_id, chart_type, cache_path, sha256, size_bytes, created_at
                            ) VALUES (?, ?, 'storage/cache/demo.json', ?, 1, 'now')
                            """,
                            (revision_id, chart_type, "c" * 64),
                        )

                payload = dataset_service.list_datasets()

        self.assertEqual(payload[0]["availableArtifacts"], ["differential_ko", "species"])
        self.assertEqual(payload[0]["availableCharts"], ["differential_ko", "species"])

    def test_cache_path_must_stay_inside_cache_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            backend_root = root / "backend"
            cache_root = backend_root / "storage" / "cache"
            cache_root.mkdir(parents=True)
            with patch.object(dataset_service, "BACKEND_ROOT", backend_root), patch.object(
                dataset_service, "CACHE_ROOT", cache_root
            ):
                with self.assertRaisesRegex(ValueError, "escapes"):
                    dataset_service._resolve_cache_path("../../secrets.json")

    def test_read_chart_rebases_legacy_absolute_cache_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            backend_root = temp_root / "backend"
            cache_dir = backend_root / "storage" / "cache" / "ad-nc-species"
            cache_dir.mkdir(parents=True)
            expected_payload = {"datasetSlug": "ad-nc-species", "ok": True}
            (cache_dir / "summary.json").write_text(
                json.dumps(expected_payload),
                encoding="utf-8",
            )

            db_path = temp_root / "ad_meta.sqlite3"
            conn = sqlite3.connect(db_path)
            conn.executescript(
                """
                CREATE TABLE datasets (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  slug TEXT NOT NULL UNIQUE,
                  status TEXT NOT NULL
                );
                CREATE TABLE chart_artifacts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  dataset_id INTEGER NOT NULL,
                  chart_type TEXT NOT NULL,
                  cache_path TEXT NOT NULL
                );
                INSERT INTO datasets (id, slug, status)
                VALUES (1, 'ad-nc-species', 'published');
                INSERT INTO chart_artifacts (dataset_id, chart_type, cache_path)
                VALUES (
                  1,
                  'summary',
                  '/Users/old/workspace/backend/storage/cache/ad-nc-species/summary.json'
                );
                """
            )
            conn.commit()
            conn.close()

            @contextmanager
            def temp_connect():
                temp_conn = sqlite3.connect(db_path)
                temp_conn.row_factory = sqlite3.Row
                try:
                    yield temp_conn
                finally:
                    temp_conn.close()

            with patch.object(dataset_service, "BACKEND_ROOT", backend_root), patch.object(
                dataset_service, "CACHE_ROOT", backend_root / "storage" / "cache"
            ), patch.object(dataset_service, "connect", temp_connect):
                payload, error = dataset_service.read_chart("ad-nc-species", "summary")

        self.assertIsNone(error)
        self.assertEqual(payload, expected_payload)

    def test_read_chart_supports_detection_cache(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            backend_root = temp_root / "backend"
            cache_dir = backend_root / "storage" / "cache" / "ad-nc-ko-abundance"
            cache_dir.mkdir(parents=True)
            expected_payload = {
                "featureLabel": "KO",
                "detectionRule": "abundance > 0",
                "rowLabels": ["AD", "NC"],
                "colLabels": ["K00001"],
                "matrix": [[1.0], [0.5]],
                "items": [],
            }
            (cache_dir / "detection.json").write_text(
                json.dumps(expected_payload),
                encoding="utf-8",
            )

            db_path = temp_root / "ad_meta.sqlite3"
            conn = sqlite3.connect(db_path)
            conn.executescript(
                """
                CREATE TABLE datasets (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  slug TEXT NOT NULL UNIQUE,
                  status TEXT NOT NULL
                );
                CREATE TABLE chart_artifacts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  dataset_id INTEGER NOT NULL,
                  chart_type TEXT NOT NULL,
                  cache_path TEXT NOT NULL
                );
                INSERT INTO datasets (id, slug, status)
                VALUES (1, 'ad-nc-ko-abundance', 'published');
                INSERT INTO chart_artifacts (dataset_id, chart_type, cache_path)
                VALUES (
                  1,
                  'detection',
                  'storage/cache/ad-nc-ko-abundance/detection.json'
                );
                """
            )
            conn.commit()
            conn.close()

            @contextmanager
            def temp_connect():
                temp_conn = sqlite3.connect(db_path)
                temp_conn.row_factory = sqlite3.Row
                try:
                    yield temp_conn
                finally:
                    temp_conn.close()

            with patch.object(dataset_service, "BACKEND_ROOT", backend_root), patch.object(
                dataset_service, "CACHE_ROOT", backend_root / "storage" / "cache"
            ), patch.object(dataset_service, "connect", temp_connect):
                payload, error = dataset_service.read_chart("ad-nc-ko-abundance", "detection")

        self.assertIsNone(error)
        self.assertEqual(payload, expected_payload)

    def test_read_chart_supports_lda_cache(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            backend_root = temp_root / "backend"
            cache_dir = backend_root / "storage" / "cache" / "ad-nc-ko-abundance"
            cache_dir.mkdir(parents=True)
            expected_payload = {
                "featureLabel": "KO",
                "method": "Mann-Whitney U + univariate LDA on log10(abundance + 1)",
                "filter": {"pValueMax": 0.05, "topN": 30},
                "items": [{"koId": "K00001", "ldaScore": 4.2}],
            }
            (cache_dir / "lda.json").write_text(
                json.dumps(expected_payload),
                encoding="utf-8",
            )

            db_path = temp_root / "ad_meta.sqlite3"
            conn = sqlite3.connect(db_path)
            conn.executescript(
                """
                CREATE TABLE datasets (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  slug TEXT NOT NULL UNIQUE,
                  status TEXT NOT NULL
                );
                CREATE TABLE chart_artifacts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  dataset_id INTEGER NOT NULL,
                  chart_type TEXT NOT NULL,
                  cache_path TEXT NOT NULL
                );
                INSERT INTO datasets (id, slug, status)
                VALUES (1, 'ad-nc-ko-abundance', 'published');
                INSERT INTO chart_artifacts (dataset_id, chart_type, cache_path)
                VALUES (
                  1,
                  'lda',
                  'storage/cache/ad-nc-ko-abundance/lda.json'
                );
                """
            )
            conn.commit()
            conn.close()

            @contextmanager
            def temp_connect():
                temp_conn = sqlite3.connect(db_path)
                temp_conn.row_factory = sqlite3.Row
                try:
                    yield temp_conn
                finally:
                    temp_conn.close()

            with patch.object(dataset_service, "BACKEND_ROOT", backend_root), patch.object(
                dataset_service, "CACHE_ROOT", backend_root / "storage" / "cache"
            ), patch.object(dataset_service, "connect", temp_connect):
                payload, error = dataset_service.read_chart("ad-nc-ko-abundance", "lda")

        self.assertIsNone(error)
        self.assertEqual(payload, expected_payload)


if __name__ == "__main__":
    unittest.main()
