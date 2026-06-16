from __future__ import annotations

import json
import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.cli import bootstrap_storage as bootstrap_module
from app.cli import import_dataset as import_module
from app.core import database


class BootstrapStorageTests(unittest.TestCase):
    def test_bootstrap_imports_manifest_datasets_and_writes_cache(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            db_path = temp_root / "ad_meta.sqlite3"
            raw_root = temp_root / "storage" / "raw"
            cache_root = temp_root / "storage" / "cache"
            species_path = raw_root / "ad-nc-species" / "raw.csv"
            ko_path = raw_root / "ad-nc-ko-abundance" / "raw.csv"
            species_path.parent.mkdir(parents=True)
            ko_path.parent.mkdir(parents=True)
            species_path.write_text(
                "\n".join(
                    [
                        "sample_id,Group,k__Bacteria|p__Firmicutes|g__Roseburia|s__Roseburia_intestinalis,k__Bacteria|p__Bacteroidetes|g__Bacteroides|s__Bacteroides_fragilis",
                        "AD001,AD,10,2",
                        "AD002,AD,9,3",
                        "NC001,NC,1,8",
                        "NC002,NC,2,7",
                    ]
                ),
                encoding="utf-8",
            )
            ko_path.write_text(
                "\n".join(
                    [
                        "sample_id,Group,K00001,K00002",
                        "AD001,AD,10,0",
                        "AD002,AD,9,0",
                        "NC001,NC,1,8",
                        "NC002,NC,2,7",
                    ]
                ),
                encoding="utf-8",
            )
            manifest_path = temp_root / "storage_manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "datasets": [
                            {
                                "slug": "ad-nc-species",
                                "name": "AD vs NC Species Abundance",
                                "description": "Species abundance comparison between AD and NC groups.",
                                "file": "storage/raw/ad-nc-species/raw.csv",
                            },
                            {
                                "slug": "ad-nc-ko-abundance",
                                "name": "AD vs NC KO Abundance",
                                "description": "KO abundance comparison between AD and NC groups.",
                                "file": "storage/raw/ad-nc-ko-abundance/raw.csv",
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )

            with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"), patch.object(
                import_module, "RAW_ROOT", raw_root
            ), patch.object(import_module, "CACHE_ROOT", cache_root), patch.object(
                import_module, "_relative_to_backend", lambda path: str(path)
            ):
                results = bootstrap_module.bootstrap_storage(manifest_path, backend_root=temp_root)

            raw = sqlite3.connect(db_path)
            raw.row_factory = sqlite3.Row
            datasets = raw.execute(
                """
                SELECT slug, status, sample_count, feature_count, feature_kind
                FROM datasets
                ORDER BY slug
                """
            ).fetchall()
            chart_count = raw.execute("SELECT COUNT(*) AS count FROM chart_artifacts").fetchone()["count"]
            sample_count = raw.execute("SELECT COUNT(*) AS count FROM sample_info").fetchone()["count"]
            raw.close()
            species_boxplot_exists = (cache_root / "ad-nc-species" / "boxplot.json").exists()
            ko_detection_exists = (cache_root / "ad-nc-ko-abundance" / "detection.json").exists()
            ko_lda_exists = (cache_root / "ad-nc-ko-abundance" / "lda.json").exists()

        self.assertEqual([result["slug"] for result in results], ["ad-nc-species", "ad-nc-ko-abundance"])
        self.assertEqual(
            [dict(row) for row in datasets],
            [
                {
                    "slug": "ad-nc-ko-abundance",
                    "status": "published",
                    "sample_count": 4,
                    "feature_count": 2,
                    "feature_kind": "ko",
                },
                {
                    "slug": "ad-nc-species",
                    "status": "published",
                    "sample_count": 4,
                    "feature_count": 2,
                    "feature_kind": "taxonomy",
                },
            ],
        )
        self.assertGreaterEqual(chart_count, 12)
        self.assertEqual(sample_count, 8)
        self.assertTrue(species_boxplot_exists)
        self.assertTrue(ko_detection_exists)
        self.assertTrue(ko_lda_exists)

    def test_bootstrap_reports_missing_raw_file_with_dataset_slug(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            manifest_path = temp_root / "storage_manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "datasets": [
                            {
                                "slug": "missing-dataset",
                                "name": "Missing Dataset",
                                "description": "This raw file is intentionally absent.",
                                "file": "storage/raw/missing-dataset/raw.csv",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(FileNotFoundError, "missing-dataset.*raw.csv"):
                bootstrap_module.bootstrap_storage(manifest_path, backend_root=temp_root)


if __name__ == "__main__":
    unittest.main()
