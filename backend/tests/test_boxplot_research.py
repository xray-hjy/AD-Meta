import json

import numpy as np
import pandas as pd
import pytest

from app.compute.charts.boxplot import describe_boxplot_group
from app.domain.analysis_scope import AnalysisScope
from app.services.chart_projection_service import _compute_boxplot


def test_scoped_counts_include_zeros_and_exclude_only_nonfinite_values():
    values = np.array([0, 1, 4, np.nan, np.inf])
    samples = np.array(["zero", "one", "four", "missing", "infinite"])
    counts, summaries = describe_boxplot_group(values, samples)
    assert counts == {"sampleCount": 5, "validCount": 3, "missingCount": 2,
                      "detectedCount": 2, "zeroCount": 1, "detectionRate": 2 / 3}
    assert summaries["raw"]["box"] == [0, 0.5, 1, 2.5, 4]
    assert summaries["sqrt"]["box"] == [0, 0.5, 1, 1.5, 2]
    assert summaries["log"]["box"][1] == pytest.approx(np.log10(2) / 2)
    assert np.isnan(values[3])  # input preserved


def test_no_finite_observations_are_unavailable_rather_than_a_zero_box():
    counts, summaries = describe_boxplot_group(np.array([np.nan, np.inf]), np.array(["A", "B"]))
    assert counts["validCount"] == 0
    assert counts["detectionRate"] is None
    assert all(summary["box"] is None for summary in summaries.values())
    assert all(summary["outlierPoints"] == [] for summary in summaries.values())


def test_all_missing_feature_is_serializable_and_not_reported_as_undetected_or_zero():
    frame = pd.DataFrame({"Sample": ["AD1", "NC1"], "Group": ["AD", "NC"], "Species": [np.nan, np.nan]})
    payload = _compute_boxplot(frame, ["Species"], AnalysisScope(), 1)
    item = payload["items"][0]
    assert item["meanAbundance"] is None
    assert item["total"] is None
    assert item["prevalence"] is None
    assert item["detectedInScope"] is None
    json.dumps(payload, allow_nan=False)


def test_zero_and_detection_denominators_are_per_feature_and_group_in_display_units():
    frame = pd.DataFrame({"Sample": ["AD1", "AD2", "NC1", "NC2"], "Group": ["AD", "AD", "NC", "NC"],
                          "Species": [0, np.nan, 0.01, 0.03]})
    frame.attrs["abundance_scale"] = "relative_abundance"
    item = _compute_boxplot(frame, ["Species"], AnalysisScope(), 1)["items"][0]
    assert item["groupStats"]["AD"] == {"sampleCount": 2, "validCount": 1, "missingCount": 1,
                                       "detectedCount": 0, "zeroCount": 1, "detectionRate": 0}
    assert item["groupStats"]["NC"]["detectionRate"] == 1
    assert item["values"]["NC"]["raw"]["box"][2] == pytest.approx(2)
    assert frame["Species"].iloc[-1] == 0.03


def test_review_api_returns_conflict_for_a_different_visible_projection():
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from app.main import app
    from app.services.boxplot_review_service import BoxplotReviewMismatch

    client = TestClient(app)
    with patch("app.api.analysis_runs.get_boxplot_review_data", side_effect=BoxplotReviewMismatch("图表与导出参数不一致")):
        response = client.post("/api/analysis-runs/run/artifacts/species/projections/boxplot/review-data",
                               json={"projectionKey": "0" * 64})
    assert response.status_code == 409
    assert response.json()["detail"] == "图表与导出参数不一致"
    assert client.post("/api/analysis-runs/run/artifacts/species/projections/boxplot/review-data", json={}).status_code == 422
