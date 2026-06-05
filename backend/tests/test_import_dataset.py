from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.cli import import_dataset as import_module
from app.core import database


class ImportDatasetIntegrationTests(unittest.TestCase):
    def test_import_writes_chart_cache_and_normalized_species_tables(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            db_path = temp_root / "ad_meta.sqlite3"
            csv_path = temp_root / "species.csv"
            csv_path.write_text(
                "\n".join(
                    [
                        "sample_id,Group,k__Bacteria|p__Firmicutes|g__Roseburia|s__Roseburia_intestinalis,k__Bacteria|p__Bacteroidetes|g__Bacteroides|s__Bacteroides_fragilis,k__Bacteria|p__Actinobacteria|g__Bifidobacterium|s__Bifidobacterium_longum",
                        "AD001,AD,10,2,0",
                        "AD002,AD,9,3,1",
                        "NC001,NC,1,8,4",
                        "NC002,NC,2,7,5",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"), patch.object(
                import_module, "RAW_ROOT", temp_root / "raw"
            ), patch.object(import_module, "CACHE_ROOT", temp_root / "cache"), patch.object(
                import_module, "_relative_to_backend", lambda path: str(path)
            ):
                dataset_id = import_module.import_dataset(
                    csv_path,
                    "species-integration",
                    "Species Integration",
                    "Integration test dataset",
                )

            raw = sqlite3.connect(db_path)
            raw.row_factory = sqlite3.Row
            dataset = raw.execute(
                "SELECT status, sample_count, feature_count, feature_kind FROM datasets WHERE id = ?",
                (dataset_id,),
            ).fetchone()
            chart_count = raw.execute(
                "SELECT COUNT(*) AS count FROM chart_artifacts WHERE dataset_id = ?",
                (dataset_id,),
            ).fetchone()["count"]
            sample_count = raw.execute("SELECT COUNT(*) AS count FROM sample_info").fetchone()["count"]
            taxon_count = raw.execute("SELECT COUNT(*) AS count FROM taxon_anno").fetchone()["count"]
            abundance_count = raw.execute("SELECT COUNT(*) AS count FROM species_abundance").fetchone()["count"]
            zero_count = raw.execute("SELECT COUNT(*) AS count FROM species_abundance WHERE abundance = 0").fetchone()["count"]
            raw.close()

        self.assertEqual(dict(dataset), {"status": "published", "sample_count": 4, "feature_count": 3, "feature_kind": "taxonomy"})
        self.assertGreaterEqual(chart_count, 7)
        self.assertEqual(sample_count, 4)
        self.assertEqual(taxon_count, 3)
        self.assertEqual(abundance_count, 11)
        self.assertEqual(zero_count, 0)

    def test_import_can_recompute_when_source_is_existing_raw_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            db_path = temp_root / "ad_meta.sqlite3"
            raw_root = temp_root / "raw"
            cache_root = temp_root / "cache"
            raw_dir = raw_root / "same-raw"
            raw_dir.mkdir(parents=True)
            csv_path = raw_dir / "raw.csv"
            csv_path.write_text(
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

            with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"), patch.object(
                import_module, "RAW_ROOT", raw_root
            ), patch.object(import_module, "CACHE_ROOT", cache_root), patch.object(
                import_module, "_relative_to_backend", lambda path: str(path)
            ):
                dataset_id = import_module.import_dataset(
                    csv_path,
                    "same-raw",
                    "Same Raw",
                    "Recompute from existing raw file",
                )

            raw = sqlite3.connect(db_path)
            raw.row_factory = sqlite3.Row
            dataset = raw.execute(
                "SELECT status, sample_count, feature_count FROM datasets WHERE id = ?",
                (dataset_id,),
            ).fetchone()
            raw.close()

        self.assertEqual(dict(dataset), {"status": "published", "sample_count": 4, "feature_count": 2})


if __name__ == "__main__":
    unittest.main()
