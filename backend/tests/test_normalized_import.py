from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.compute.precompute import prepare_dataframe
from app.core import database
from app.services.normalized_import import replace_normalized_dataset


class NormalizedImportTests(unittest.TestCase):
    def test_species_table_populates_samples_taxa_and_nonzero_abundance(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            db_path = temp_root / "ad_meta.sqlite3"
            csv_path = temp_root / "species.csv"
            csv_path.write_text(
                "\n".join(
                    [
                        "sample_id,Group,k__Bacteria|p__Firmicutes|c__Bacilli|o__Lactobacillales|f__Lactobacillaceae|g__Lactobacillus|s__Lactobacillus_acidophilus,k__Bacteria|p__Bacteroidetes|g__Bacteroides|s__Bacteroides_fragilis",
                        "S001,AD,10,0",
                        "S002,NC,3,8",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
                database.init_db()
                df, feature_cols, _ = prepare_dataframe(csv_path)
                with database.connect() as conn:
                    dataset_id = conn.execute(
                        """
                        INSERT INTO datasets (
                          slug, name, feature_kind, feature_label, created_at, updated_at
                        )
                        VALUES (?, ?, 'taxonomy', '物种', ?, ?)
                        """,
                        ("species-test", "Species Test", "2026-06-02T00:00:00+00:00", "2026-06-02T00:00:00+00:00"),
                    ).lastrowid
                    replace_normalized_dataset(conn, int(dataset_id), df, feature_cols)

                raw = sqlite3.connect(db_path)
                raw.row_factory = sqlite3.Row
                samples = [dict(row) for row in raw.execute("SELECT sample_code, phenotype FROM sample_info ORDER BY sample_code")]
                taxa = [dict(row) for row in raw.execute("SELECT genus, species, canonical_name FROM taxon_anno ORDER BY canonical_name")]
                abundance_count = raw.execute("SELECT COUNT(*) AS count FROM species_abundance").fetchone()["count"]
                zero_count = raw.execute("SELECT COUNT(*) AS count FROM species_abundance WHERE abundance = 0").fetchone()["count"]
                raw.close()

        self.assertEqual(samples, [{"sample_code": "S001", "phenotype": "AD"}, {"sample_code": "S002", "phenotype": "NC"}])
        self.assertEqual(len(taxa), 2)
        self.assertEqual(taxa[0]["canonical_name"], "Bacteroides_fragilis")
        self.assertEqual(taxa[1]["genus"], "Lactobacillus")
        self.assertEqual(abundance_count, 3)
        self.assertEqual(zero_count, 0)

    def test_ko_table_populates_ko_annotations_and_all_abundance_values(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            db_path = temp_root / "ad_meta.sqlite3"
            csv_path = temp_root / "ko.csv"
            csv_path.write_text(
                "\n".join(
                    [
                        "sample_id,label,K00001,K00003",
                        "S001,1,10,0",
                        "S002,0,2,8",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
                database.init_db()
                df, feature_cols, _ = prepare_dataframe(csv_path)
                with database.connect() as conn:
                    dataset_id = conn.execute(
                        """
                        INSERT INTO datasets (
                          slug, name, feature_kind, feature_label, created_at, updated_at
                        )
                        VALUES (?, ?, 'ko', 'KO', ?, ?)
                        """,
                        ("ko-test", "KO Test", "2026-06-02T00:00:00+00:00", "2026-06-02T00:00:00+00:00"),
                    ).lastrowid
                    replace_normalized_dataset(conn, int(dataset_id), df, feature_cols)

                raw = sqlite3.connect(db_path)
                raw.row_factory = sqlite3.Row
                ko_ids = [row["ko_id"] for row in raw.execute("SELECT ko_id FROM ko_anno ORDER BY ko_id")]
                abundance = [dict(row) for row in raw.execute("SELECT ko_id, abundance FROM ko_abundance ORDER BY sample_id, ko_id")]
                raw.close()

        self.assertEqual(ko_ids, ["K00001", "K00003"])
        self.assertEqual(len(abundance), 4)
        self.assertIn({"ko_id": "K00003", "abundance": 0.0}, abundance)


if __name__ == "__main__":
    unittest.main()
