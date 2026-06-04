from __future__ import annotations

import copy
import sqlite3
import unittest
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services import dataset_service


class HeatmapApiTests(unittest.TestCase):
    def test_heatmap_endpoint_ignores_clusters_query_and_returns_cache(self) -> None:
        cached_payload = {
            "stats": [{"fullName": f"feature-{index}"} for index in range(4)],
            "colOrder": [0, 1, 2, 3],
        }

        with patch("app.api.datasets.read_chart", return_value=(copy.deepcopy(cached_payload), None)):
            response = TestClient(app).get("/api/datasets/demo/charts/heatmap?clusters=3")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload, cached_payload)

    def test_detection_endpoint_reads_detection_cache_for_supported_chart(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            backend_root = temp_root / "backend"
            cache_dir = backend_root / "storage" / "cache" / "ad-nc-ko-abundance"
            cache_dir.mkdir(parents=True)
            cached_payload = {
                "featureLabel": "KO",
                "detectionRule": "abundance > 0",
                "rowLabels": ["AD", "NC"],
                "colLabels": ["K00001"],
                "matrix": [[1.0], [0.5]],
                "items": [],
            }
            (cache_dir / "detection.json").write_text(
                __import__("json").dumps(cached_payload),
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
                VALUES (1, 'detection', 'storage/cache/ad-nc-ko-abundance/detection.json');
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
                dataset_service, "connect", temp_connect
            ), patch.object(dataset_service, "init_db", lambda: None), patch(
                "app.api.datasets.read_chart",
                side_effect=dataset_service.read_chart,
            ):
                response = TestClient(app).get("/api/datasets/ad-nc-ko-abundance/charts/detection")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), cached_payload)

    def test_lda_endpoint_reads_lda_cache_for_supported_chart(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            backend_root = temp_root / "backend"
            cache_dir = backend_root / "storage" / "cache" / "ad-nc-ko-abundance"
            cache_dir.mkdir(parents=True)
            cached_payload = {
                "featureLabel": "KO",
                "method": "Mann-Whitney U + univariate LDA on log10(abundance + 1)",
                "filter": {"pValueMax": 0.05, "topN": 30},
                "items": [{"koId": "K00001", "ldaScore": 4.2}],
            }
            (cache_dir / "lda.json").write_text(
                __import__("json").dumps(cached_payload),
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
                VALUES (1, 'lda', 'storage/cache/ad-nc-ko-abundance/lda.json');
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
                dataset_service, "connect", temp_connect
            ), patch.object(dataset_service, "init_db", lambda: None), patch(
                "app.api.datasets.read_chart",
                side_effect=dataset_service.read_chart,
            ):
                response = TestClient(app).get("/api/datasets/ad-nc-ko-abundance/charts/lda")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), cached_payload)


if __name__ == "__main__":
    unittest.main()
