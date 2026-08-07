from __future__ import annotations

import errno
import os
import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from app.cli import import_dataset as import_module
from app.compute.table import InputValidationError
from app.core import database


class ImportDatasetIntegrationTests(unittest.TestCase):
    def test_publish_staged_directory_falls_back_across_filesystems(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            stage_dir = root / "staging" / "revision-1"
            final_dir = root / "cache" / "dataset" / "revision-1"
            stage_dir.mkdir(parents=True)
            (stage_dir / "summary.json").write_text('{"status":"ok"}', encoding="utf-8")
            real_replace = os.replace
            calls = 0

            def replace_with_cross_device_failure(source, target):
                nonlocal calls
                calls += 1
                if calls == 1:
                    raise OSError(errno.EXDEV, "cross-device link")
                return real_replace(source, target)

            with patch.object(import_module.os, "replace", side_effect=replace_with_cross_device_failure):
                import_module._publish_staged_directory(stage_dir, final_dir)

            self.assertFalse(stage_dir.exists())
            self.assertEqual((final_dir / "summary.json").read_text(encoding="utf-8"), '{"status":"ok"}')

    def test_artifact_path_supports_external_storage_mounts(self) -> None:
        with TemporaryDirectory() as tmpdir:
            external_artifact = Path(tmpdir) / "cache" / "summary.json"
            stored = import_module._relative_to_backend(external_artifact)

        self.assertEqual(stored, str(external_artifact.resolve()))

    def test_mysql_artifact_upsert_uses_dialect_specific_clause(self) -> None:
        connection = Mock()
        with patch.object(import_module, "is_mysql", return_value=True), patch.object(
            import_module, "_relative_to_backend", return_value="storage/cache/chart.json"
        ):
            import_module._upsert_chart_artifact(
                connection,
                1,
                "summary",
                Path("chart.json"),
                "2026-07-15T00:00:00+00:00",
            )
        sql = connection.execute.call_args.args[0]
        self.assertIn("ON DUPLICATE KEY UPDATE", sql)

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
                import_module, "CACHE_ROOT", temp_root / "cache"
            ), patch.object(
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
                """
                SELECT status, sample_count, feature_count, feature_kind,
                       current_revision_id, analysis_status
                FROM datasets WHERE id = ?
                """,
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
            revision = raw.execute(
                """
                SELECT status, abundance_scale, source_sha256, source_file_size, params_hash
                FROM dataset_revisions WHERE id = ?
                """,
                (dataset["current_revision_id"],),
            ).fetchone()
            revision_sample_count = raw.execute(
                "SELECT COUNT(*) AS count FROM revision_sample_info WHERE revision_id = ?",
                (dataset["current_revision_id"],),
            ).fetchone()["count"]
            raw.close()

        self.assertEqual(dataset["status"], "published")
        self.assertEqual(dataset["sample_count"], 4)
        self.assertEqual(dataset["feature_count"], 3)
        self.assertEqual(dataset["feature_kind"], "taxonomy")
        self.assertEqual(dataset["analysis_status"], "insufficient_sample")
        self.assertEqual(revision["status"], "published")
        self.assertEqual(revision["abundance_scale"], "unknown")
        self.assertEqual(len(revision["source_sha256"]), 64)
        self.assertGreater(revision["source_file_size"], 0)
        self.assertEqual(len(revision["params_hash"]), 64)
        self.assertEqual(revision_sample_count, 4)
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
                import_module, "CACHE_ROOT", cache_root
            ), patch.object(
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

    def test_failed_reimport_keeps_previous_revision_published(self) -> None:
        with TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            db_path = temp_root / "ad_meta.sqlite3"
            cache_root = temp_root / "cache"
            csv_path = temp_root / "species.csv"
            csv_path.write_text(
                "\n".join(
                    [
                        "sample_id,Group,k__Bacteria|p__Firmicutes|g__Roseburia|s__Roseburia_intestinalis",
                        "AD001,AD,10",
                        "AD002,AD,9",
                        "NC001,NC,1",
                        "NC002,NC,2",
                    ]
                ),
                encoding="utf-8",
            )

            patches = (
                patch.object(database, "DB_PATH", db_path),
                patch.object(database, "DB_ENGINE", "sqlite"),
                patch.object(import_module, "CACHE_ROOT", cache_root),
                patch.object(import_module, "_relative_to_backend", lambda path: str(path)),
            )
            for active in patches:
                active.start()
            try:
                dataset_id = import_module.import_dataset(csv_path, "atomic", "Atomic")
                raw = sqlite3.connect(db_path)
                raw.row_factory = sqlite3.Row
                before = raw.execute(
                    "SELECT status, current_revision_id FROM datasets WHERE id = ?",
                    (dataset_id,),
                ).fetchone()
                old_artifact = raw.execute(
                    "SELECT cache_path FROM revision_chart_artifacts WHERE revision_id = ? LIMIT 1",
                    (before["current_revision_id"],),
                ).fetchone()["cache_path"]
                raw.close()

                with patch.object(
                    import_module,
                    "precompute_prepared",
                    side_effect=RuntimeError("injected compute failure"),
                ):
                    with self.assertRaisesRegex(RuntimeError, "injected compute failure"):
                        import_module.import_dataset(csv_path, "atomic", "Atomic revised")

                raw = sqlite3.connect(db_path)
                raw.row_factory = sqlite3.Row
                after = raw.execute(
                    "SELECT status, current_revision_id, name FROM datasets WHERE id = ?",
                    (dataset_id,),
                ).fetchone()
                revision_statuses = [
                    row["status"]
                    for row in raw.execute(
                        "SELECT status FROM dataset_revisions WHERE dataset_id = ? ORDER BY id",
                        (dataset_id,),
                    )
                ]
                raw.close()
                old_artifact_exists = Path(old_artifact).exists()
            finally:
                for active in reversed(patches):
                    active.stop()

        self.assertEqual(after["status"], "published")
        self.assertEqual(after["current_revision_id"], before["current_revision_id"])
        self.assertEqual(after["name"], "Atomic")
        self.assertEqual(revision_statuses, ["published", "failed"])
        self.assertTrue(old_artifact_exists)

    def test_import_parses_the_source_table_once(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "db.sqlite3"
            cache_root = root / "cache"
            csv_path = root / "species.csv"
            csv_path.write_text(
                "sample_id,Group,k__Bacteria|p__Firmicutes|s__Target\n"
                "AD1,AD,2\nAD2,AD,3\nNC1,NC,1\nNC2,NC,1\n",
                encoding="utf-8",
            )
            original_prepare = import_module.prepare_dataframe
            with patch.object(database, "DB_PATH", db_path), patch.object(
                database, "DB_ENGINE", "sqlite"
            ), patch.object(import_module, "CACHE_ROOT", cache_root), patch.object(
                import_module, "_relative_to_backend", lambda path: str(path)
            ), patch.object(
                import_module, "prepare_dataframe", wraps=original_prepare
            ) as prepare:
                import_module.import_dataset(csv_path, "single-parse", "Single Parse")

        prepare.assert_called_once_with(
            unittest.mock.ANY,
            abundance_scale="unknown",
            missing_value_policy="error",
            minimum_group_size=2,
            group_mapping={},
        )

    def test_formal_ko_import_publishes_worker_artifacts(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "db.sqlite3"
            cache_root = root / "cache"
            csv_path = root / "ko.csv"
            rows = ["sample_id,Group,Age,K00001"]
            rows.extend(f"AD{i},AD,{60 + i},{10 + i}" for i in range(5))
            rows.extend(f"NC{i},NC,{70 + i},{1 + i}" for i in range(5))
            csv_path.write_text("\n".join(rows), encoding="utf-8")
            formal = {
                "method": "ANCOM-BC2",
                "inferenceLevel": "formal_compositional_model",
                "modelFormula": "Group + Age",
                "items": [
                    {
                        "featureId": "K00001",
                        "pValue": 0.001,
                        "qValue": 0.01,
                        "effectSize": 1.5,
                        "effectMetric": "ancombc2_log_fold_change",
                    }
                ],
                "summary": {"testedCount": 1, "significantCount": 1},
            }
            with patch.object(database, "DB_PATH", db_path), patch.object(
                database, "DB_ENGINE", "sqlite"
            ), patch.object(import_module, "CACHE_ROOT", cache_root), patch.object(
                import_module, "_relative_to_backend", lambda path: str(path)
            ), patch.object(import_module, "run_formal_differential", return_value=formal) as worker:
                dataset_id = import_module.import_dataset(
                    csv_path,
                    "formal-ko",
                    "Formal KO",
                    abundance_scale="counts",
                    normalization="raw_counts",
                    covariates=["Age"],
                )

            raw = sqlite3.connect(db_path)
            raw.row_factory = sqlite3.Row
            dataset = raw.execute(
                "SELECT current_revision_id, analysis_status FROM datasets WHERE id = ?",
                (dataset_id,),
            ).fetchone()
            artifact_types = {
                row["chart_type"]
                for row in raw.execute(
                    "SELECT chart_type FROM revision_chart_artifacts WHERE revision_id = ?",
                    (dataset["current_revision_id"],),
                )
            }
            raw.close()

        self.assertEqual(dataset["analysis_status"], "formal_complete")
        self.assertIn("differential_abundance", artifact_types)
        self.assertIn("differential_ko", artifact_types)
        self.assertEqual(worker.call_args.kwargs["covariates"], ["Age"])

    def test_retention_keeps_three_successful_revisions(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "db.sqlite3"
            cache_root = root / "cache"
            csv_path = root / "species.csv"
            csv_path.write_text(
                "sample_id,Group,k__Bacteria|p__Firmicutes|s__Target\n"
                "AD1,AD,2\nAD2,AD,3\nNC1,NC,1\nNC2,NC,1\n",
                encoding="utf-8",
            )
            with patch.object(database, "DB_PATH", db_path), patch.object(
                database, "DB_ENGINE", "sqlite"
            ), patch.object(import_module, "CACHE_ROOT", cache_root), patch.object(
                import_module, "_relative_to_backend", lambda path: str(path)
            ):
                for index in range(4):
                    import_module.import_dataset(csv_path, "retained", f"Revision {index}")
            raw = sqlite3.connect(db_path)
            revision_count = raw.execute(
                "SELECT COUNT(*) FROM dataset_revisions WHERE status = 'published'"
            ).fetchone()[0]
            raw.close()
        self.assertEqual(revision_count, 3)

    def test_rejects_missing_and_unsupported_sources(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "db.sqlite3"
            unsupported = root / "input.json"
            unsupported.write_text("{}", encoding="utf-8")
            with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
                with self.assertRaises(FileNotFoundError):
                    import_module.import_dataset(root / "missing.csv", "missing", "Missing")
                with self.assertRaises(InputValidationError) as caught:
                    import_module.import_dataset(unsupported, "unsupported", "Unsupported")
        self.assertEqual(caught.exception.code, "unsupported_file_type")


if __name__ == "__main__":
    unittest.main()
