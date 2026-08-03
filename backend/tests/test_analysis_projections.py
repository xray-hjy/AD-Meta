from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pytest
import pandas as pd

from app.core import database
from app.core.migrations import upgrade_database
from app.domain.analysis_scope import (
    AbundanceProjectionRequest,
    AnalysisScope,
    ChartProjectionRequest,
    ProjectionAuditRequest,
)
from app.services.chart_projection_service import (
    RevisionMatrixSnapshot,
    _compute_composition,
    _compute_chart_projection,
    _read_revision_matrix_cache,
    _write_revision_matrix_cache,
    project_chart,
)
from app.compute.charts.detection import compute_detection_heatmap
from app.services.analysis_projection_service import (
    AnalysisScopeError,
    _compute_abundance_projection,
    list_analysis_samples,
    list_scoped_analysis_samples,
    project_abundance,
)
from app.services.analysis_run_service import sync_analysis_runs_from_manifest
from app.services.projection_audit_service import (
    ProjectionAuditMismatch,
    get_projection_audit,
)


def _seed_taxonomy_dataset(conn) -> None:
    now = "2026-07-29T00:00:00+00:00"
    dataset = conn.execute(
        """
        INSERT INTO datasets (
          slug, name, description, status, sample_count, species_count,
          feature_count, feature_kind, feature_label, group_counts_json,
          import_warnings_json, created_at, updated_at, published_at
        ) VALUES (
          'species', 'Species abundance', '', 'published', 3, 2,
          2, 'taxonomy', '物种', '{"AD":2,"NC":1}', '[]', ?, ?, ?
        )
        """,
        (now, now, now),
    )
    dataset_id = int(dataset.lastrowid)
    revision = conn.execute(
        """
        INSERT INTO dataset_revisions (
          dataset_id, revision_key, status, source_sha256, source_file_size,
          compute_version, params_hash, created_at, published_at
        ) VALUES (?, 'species-r1', 'published', ?, 1, 'test', ?, ?, ?)
        """,
        (dataset_id, "a" * 64, "b" * 64, now, now),
    )
    revision_id = int(revision.lastrowid)
    conn.execute(
        "UPDATE datasets SET current_revision_id = ? WHERE id = ?",
        (revision_id, dataset_id),
    )
    sample_ids: dict[str, int] = {}
    for code, phenotype in (("S1", "AD"), ("S2", "AD"), ("S3", "NC")):
        cursor = conn.execute(
            """
            INSERT INTO revision_sample_info (
              revision_id, dataset_id, sample_code, phenotype
            ) VALUES (?, ?, ?, ?)
            """,
            (revision_id, dataset_id, code, phenotype),
        )
        sample_ids[code] = int(cursor.lastrowid)

    taxon_ids: dict[str, int] = {}
    for index, feature in enumerate(("Species A", "Species B"), start=1):
        cursor = conn.execute(
            """
            INSERT INTO taxon_anno (
              species, full_taxonomy, canonical_name, taxonomy_hash
            ) VALUES (?, ?, ?, ?)
            """,
            (feature, f"k__Bacteria|s__{feature}", feature, f"{index:064d}"),
        )
        taxon_ids[feature] = int(cursor.lastrowid)

    # Missing sparse rows are real zeroes and must still contribute to group statistics.
    conn.executemany(
        """
        INSERT INTO revision_species_abundance (
          revision_id, dataset_id, sample_id, taxon_id, abundance
        ) VALUES (?, ?, ?, ?, ?)
        """,
        [
            (revision_id, dataset_id, sample_ids["S1"], taxon_ids["Species A"], 10.0),
            (revision_id, dataset_id, sample_ids["S2"], taxon_ids["Species B"], 8.0),
            (revision_id, dataset_id, sample_ids["S3"], taxon_ids["Species A"], 4.0),
        ],
    )


def _manifest(path: Path) -> Path:
    path.write_text(
        json.dumps(
            {
                "manifestVersion": "1.0",
                "analysisRuns": [
                    {
                        "key": "run-projection",
                        "name": "Projection test",
                        "pipeline": {"name": "test", "version": "1"},
                        "artifacts": [
                            {
                                "key": "species",
                                "type": "species_abundance",
                                "datasetSlug": "species",
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return path


def test_abundance_projection_preserves_scope_and_sparse_zero_semantics() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "projection.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_taxonomy_dataset(conn)
            sync_analysis_runs_from_manifest(manifest)

            cohort = project_abundance(
                "run-projection",
                "species",
                AbundanceProjectionRequest(topN=1),
            )
            ad_group = project_abundance(
                "run-projection",
                "species",
                AbundanceProjectionRequest(
                    scope=AnalysisScope(mode="group", groups=["AD"]),
                    topN=2,
                ),
            )
            sample = project_abundance(
                "run-projection",
                "species",
                AbundanceProjectionRequest(
                    scope=AnalysisScope(mode="sample", sampleCodes=["S2"]),
                    topN=2,
                ),
            )
            sample_page = list_analysis_samples(
                "run-projection", artifact_key="species", phenotype="AD"
            )
            database.dispose_engine()
            _compute_abundance_projection.cache_clear()

    assert cohort["items"][0]["feature"] == "Species A"
    assert cohort["projection"] == {
        "kind": "top_n_abundance",
        "ranking": "mean_abundance",
        "aggregation": "mean_by_group",
        "sampleCount": 3,
        "groupCounts": {"AD": 2, "NC": 1},
        "sourceFeatureCount": 2,
        "nonzeroFeatureCount": 2,
        "returnedFeatureCount": 1,
        "truncatedFeatureCount": 1,
        "mergedFeatureCount": 0,
        "filters": [],
        "topN": 1,
        "isComplete": False,
    }

    species_a = next(item for item in ad_group["items"] if item["feature"] == "Species A")
    assert species_a["values"]["AD"]["mean"] == pytest.approx(5.0)
    assert species_a["values"]["AD"]["std"] == pytest.approx(7.0710678119)
    assert [series["key"] for series in ad_group["series"]] == ["AD"]

    assert sample["series"][0]["key"] == "S2"
    assert sample["items"][0]["feature"] == "Species B"
    assert sample["items"][0]["values"]["S2"]["mean"] == pytest.approx(8.0)
    assert sample_page["total"] == 2
    assert {item["sampleCode"] for item in sample_page["items"]} == {"S1", "S2"}


def test_projection_rejects_samples_not_covered_by_artifact() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "projection.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_taxonomy_dataset(conn)
            sync_analysis_runs_from_manifest(manifest)

            with pytest.raises(AnalysisScopeError, match="not covered"):
                project_abundance(
                    "run-projection",
                    "species",
                    AbundanceProjectionRequest(
                        scope=AnalysisScope(mode="sample", sampleCodes=["S999"])
                    ),
                )
            database.dispose_engine()
            _compute_abundance_projection.cache_clear()


def test_projection_audit_is_bound_to_the_visible_projection_and_paginates() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "projection.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_taxonomy_dataset(conn)
            sync_analysis_runs_from_manifest(manifest)

            projection = project_abundance(
                "run-projection",
                "species",
                AbundanceProjectionRequest(topN=1),
            )
            audit = get_projection_audit(
                "run-projection",
                "species",
                "abundance",
                ProjectionAuditRequest(
                    projectionKey=projection["projectionKey"],
                    topN=1,
                    section="selection",
                    limit=1,
                ),
            )
            filtered_audit = get_projection_audit(
                "run-projection",
                "species",
                "abundance",
                ProjectionAuditRequest(
                    projectionKey=projection["projectionKey"],
                    topN=1,
                    section="selection",
                    filters={
                        "feature": "Species_B",
                        "sample": "S2",
                        "status": "excluded",
                        "reason": "outside_top_n",
                    },
                ),
            )
            sorted_audit = get_projection_audit(
                "run-projection",
                "species",
                "abundance",
                ProjectionAuditRequest(
                    projectionKey=projection["projectionKey"],
                    topN=1,
                    section="selection",
                    sortBy="rank",
                    sortDirection="desc",
                    limit=1,
                ),
            )
            with pytest.raises(ProjectionAuditMismatch):
                get_projection_audit(
                    "run-projection",
                    "species",
                    "abundance",
                    ProjectionAuditRequest(
                        projectionKey="0" * 64,
                        topN=1,
                        section="selection",
                    ),
                )
            with database.connect() as conn:
                artifact_count = conn.execute(
                    "SELECT COUNT(*) AS value FROM projection_audit_artifacts"
                ).fetchone()["value"]
                row_count = conn.execute(
                    "SELECT COUNT(*) AS value FROM projection_audit_rows"
                ).fetchone()["value"]
            database.dispose_engine()
            _compute_abundance_projection.cache_clear()

    assert audit["projectionKey"] == projection["projectionKey"]
    assert audit["section"] == "selection"
    assert audit["total"] == 2
    assert audit["limit"] == 1
    assert len(audit["items"]) == 1
    assert audit["items"][0]["status"] == "displayed"
    assert audit["filterOptions"] == {
        "feature": [
            {"value": "Species_A", "label": "Species_A"},
            {"value": "Species_B", "label": "Species_B"},
        ],
        "sample": [
            {"value": "S1", "label": "S1", "group": "AD"},
            {"value": "S2", "label": "S2", "group": "AD"},
            {"value": "S3", "label": "S3", "group": "NC"},
        ],
        "status": [
            {"value": "displayed", "label": "displayed"},
            {"value": "excluded", "label": "excluded"},
        ],
        "reason": [
            {"value": "outside_top_n", "label": "outside_top_n"},
            {"value": "within_top_n", "label": "within_top_n"},
        ],
    }
    assert filtered_audit["total"] == 1
    assert filtered_audit["items"][0]["feature"] == "Species_B"
    assert sorted_audit["items"][0]["rank"] == 2
    assert artifact_count == 1
    assert row_count == 2
    assert audit["sections"] == [
        {"key": "selection", "title": "展示与未展示特征", "total": 2},
    ]
    assert audit["sampleScope"] == {
        "mode": "cohort",
        "sampleCount": 3,
        "groupCounts": {"AD": 2, "NC": 1},
    }


def test_scoped_sample_page_matches_the_projection_scope() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "projection.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        scope = AnalysisScope(mode="subset", sampleCodes=["S1", "S3"])
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_taxonomy_dataset(conn)
            sync_analysis_runs_from_manifest(manifest)

            page = list_scoped_analysis_samples(
                "run-projection",
                "species",
                scope,
                limit=1,
                offset=1,
            )
            database.dispose_engine()

    assert page["total"] == 2
    assert page["groupCounts"] == {"AD": 1, "NC": 1}
    assert page["availableFields"] == ["sampleCode", "phenotype"]
    assert [item["sampleCode"] for item in page["items"]] == ["S3"]


def test_composition_audit_uses_the_visible_series_as_value_columns() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "projection.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        scope = AnalysisScope(mode="sample", sampleCodes=["S2"])
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_taxonomy_dataset(conn)
            sync_analysis_runs_from_manifest(manifest)

            projection = project_chart(
                "run-projection",
                "species",
                "composition",
                ChartProjectionRequest(scope=scope, topN=1),
            )
            audit = get_projection_audit(
                "run-projection",
                "species",
                "composition",
                ProjectionAuditRequest(
                    projectionKey=projection["projectionKey"],
                    scope=scope,
                    topN=1,
                    section="aggregation",
                ),
            )
            database.dispose_engine()
            _compute_chart_projection.cache_clear()

    assert [column["label"] for column in audit["columns"]] == [
        "排序",
        "类别",
        "S2",
        "处理结果",
        "合并至",
    ]
    assert audit["items"][0]["series_0"] == pytest.approx(1.0)


def test_chart_projection_uses_selected_sample_and_reports_scope() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "projection.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_taxonomy_dataset(conn)
            sync_analysis_runs_from_manifest(manifest)

            result = project_chart(
                "run-projection",
                "species",
                "composition",
                ChartProjectionRequest(
                    scope=AnalysisScope(mode="sample", sampleCodes=["S2"]),
                    topN=8,
                ),
            )
            database.dispose_engine()
            _compute_chart_projection.cache_clear()

    assert result["scope"] == {
        "mode": "sample",
        "groups": [],
        "sampleCodes": ["S2"],
    }
    assert result["projection"]["sampleCount"] == 1
    assert result["projection"]["groupCounts"] == {"AD": 1}
    assert result["projection"]["analysisFamily"] == "descriptive_composition"
    assert result["projection"]["topNRole"] == "aggregation_limit"
    assert result["dataSemantics"] == {
        "abundanceScale": "unknown",
        "normalization": "unknown",
    }
    assert result["payload"]["series"][0]["key"] == "S2"
    assert sum(item["values"]["S2"] for item in result["payload"]["items"]) == pytest.approx(1.0)


def test_taxonomy_projection_preserves_tree_array_payload() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "projection.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_taxonomy_dataset(conn)
            sync_analysis_runs_from_manifest(manifest)

            result = project_chart(
                "run-projection",
                "species",
                "taxonomy",
                ChartProjectionRequest(scope=AnalysisScope()),
            )
            database.dispose_engine()
            _compute_chart_projection.cache_clear()

    assert isinstance(result["payload"], list)
    assert result["projection"]["analysisFamily"] == "taxonomy_hierarchy"
    assert result["projection"]["topNRole"] == "not_applicable"
    assert result["projection"]["featureSelection"] is None


def test_chart_projection_rejects_scientifically_invalid_scope() -> None:
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "projection.sqlite3"
        manifest = _manifest(Path(tmpdir) / "manifest.json")
        with patch.object(database, "DB_PATH", db_path), patch.object(database, "DB_ENGINE", "sqlite"):
            database.dispose_engine()
            upgrade_database()
            with database.connect() as conn:
                _seed_taxonomy_dataset(conn)
            sync_analysis_runs_from_manifest(manifest)

            with pytest.raises(AnalysisScopeError, match="does not support sample"):
                project_chart(
                    "run-projection",
                    "species",
                    "boxplot",
                    ChartProjectionRequest(
                        scope=AnalysisScope(mode="sample", sampleCodes=["S1"]),
                    ),
                )
            with pytest.raises(AnalysisScopeError, match="at least 3 samples"):
                project_chart(
                    "run-projection",
                    "species",
                    "pca",
                    ChartProjectionRequest(
                        scope=AnalysisScope(mode="group", groups=["AD"]),
                    ),
                )
            database.dispose_engine()
            _compute_chart_projection.cache_clear()


def test_composition_honors_requested_top_n_before_explicit_other_bucket() -> None:
    features = [f"K{index:05d}" for index in range(15)]
    frame = pd.DataFrame([
        {"Sample": "S1", "Group": "AD", **{feature: 20 - index for index, feature in enumerate(features)}},
        {"Sample": "S2", "Group": "NC", **{feature: 19 - index for index, feature in enumerate(features)}},
    ])
    frame.attrs["feature_kind"] = "ko"
    payload = _compute_composition(
        frame,
        features,
        AnalysisScope(),
        top_n=14,
    )

    assert payload["sourceCategoryCount"] == 15
    assert payload["displayedCategoryCount"] == 15
    assert payload["mergedCategoryCount"] == 1
    assert payload["items"][-1]["feature"] == "Other"


def test_detection_threshold_is_part_of_the_scientific_filter() -> None:
    frame = pd.DataFrame({
        "Sample": ["A1", "A2", "N1", "N2"],
        "Group": ["AD", "AD", "NC", "NC"],
        "K00001": [0.2, 0.8, 0.4, 1.2],
    })
    frame.attrs["feature_label"] = "KO"

    payload = compute_detection_heatmap(
        frame,
        ["K00001"],
        abundance_threshold=0.5,
    )

    assert payload["detectionRule"] == "abundance > 0.5"
    assert payload["filter"]["abundanceThreshold"] == 0.5
    assert payload["items"][0]["adDetectedSamples"] == 1
    assert payload["items"][0]["ncDetectedSamples"] == 1


def test_revision_matrix_snapshot_round_trip_preserves_complete_matrix(tmp_path: Path) -> None:
    matrix = pd.DataFrame(
        [[1.25, 0.0], [2.5, 3.75]],
        index=[11, 12],
        columns=["Feature A", "Feature B"],
        dtype=float,
    )
    snapshot = RevisionMatrixSnapshot(
        matrix=matrix,
        sample_by_id={11: ("S11", "AD"), 12: ("S12", "NC")},
        features=("Feature A", "Feature B"),
    )
    cache_path = tmp_path / "revision-matrix.npz"

    _write_revision_matrix_cache(cache_path, snapshot)
    restored = _read_revision_matrix_cache(cache_path)

    assert restored is not None
    assert restored.features == snapshot.features
    assert restored.sample_by_id == snapshot.sample_by_id
    pd.testing.assert_frame_equal(restored.matrix, snapshot.matrix)
