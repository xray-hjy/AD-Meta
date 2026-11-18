"""Scientific contracts shared by previews, PCA and PCoA."""
import numpy as np
import pandas as pd
import pytest
from scipy.spatial.distance import pdist

from app.compute.charts.ordination import compute_pca, compute_pcoa, prepare_pca_input, prepare_pcoa_input
from app.domain.projection_policy import PROJECTION_POLICIES


def frame():
    return pd.DataFrame({"Sample": ["a", "b", "c", "zero"], "Group": ["AD", "NC", "NC", "AD"],
        "dominant": [0.9999, 0.8, 0.6, 0], "boundary": [0.0001, 0.2, 0.4, 0], "absent": [0, 0, 0, 0]})


@pytest.mark.parametrize("preset", ["standard", "inclusive", "robust", "unfiltered", "custom", "top_n"])
def test_both_methods_and_preview_share_exact_selection(preset):
    df = frame()
    features = ["dominant", "boundary", "absent"]
    options = dict(filter_preset=preset, minimum_relative_abundance=0.0001, minimum_prevalence=1)
    preview = prepare_pcoa_input(df, features, **options, top_n=2)
    pca = prepare_pca_input(df, features, top_n=2, include_audit=True, **options)
    assert set(pca["selectedFeatures"]) == set(preview["retainedFeatures"])
    for compute in (compute_pca, compute_pcoa):
        result = compute(df, features, top_n=2, **options)
        assert result["featureSelection"]["selectedCount"] == len(preview["retainedFeatures"])
        assert result["sampleFiltering"]["selectedSampleCount"] == preview["sampleFiltering"]["selectedSampleCount"]


def test_boundary_is_inclusive_and_denominator_excludes_zero_total_samples():
    prepared = prepare_pcoa_input(frame(), ["dominant", "boundary", "absent"], "custom", 0.0001, 1)
    assert prepared["retainedFeatures"] == ["dominant", "boundary"]
    assert prepared["filter"]["prevalenceDenominator"] == 3
    assert prepared["sampleFiltering"]["excludedZeroTotalSamples"] == ["zero"]


def test_zero_threshold_does_not_turn_absence_into_detection():
    result = prepare_pcoa_input(frame(), ["dominant", "boundary", "absent"], "custom", 0, 0.1)
    assert "absent" not in result["retainedFeatures"]
    row = next(row for row in result["auditRows"] if row["feature"] == "absent")
    assert row["detectionSampleCount"] == 0


def test_selection_is_label_blind_and_invariant_to_input_sample_scale():
    original = frame()
    altered = original.copy()
    altered["Group"] = ["NC", "AD", "AD", "NC"]
    features = ["dominant", "boundary", "absent"]
    altered[features] = altered[features].mul([100, 20, 3, 7], axis=0)
    for compute in (compute_pca, compute_pcoa):
        a = compute(original, features, filter_preset="standard")
        b = compute(altered, features, filter_preset="standard")
        assert a["featureSelection"]["selectedCount"] == b["featureSelection"]["selectedCount"]
        np.testing.assert_allclose(pdist([[p["x"], p["y"]] for p in a["points"]]), pdist([[p["x"], p["y"]] for p in b["points"]]), atol=1e-8)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -0.1, 1.1])
def test_custom_thresholds_fail_closed(value):
    with pytest.raises(ValueError):
        prepare_pcoa_input(frame(), ["dominant", "boundary"], "custom", value, 0.1)
    with pytest.raises(ValueError):
        PROJECTION_POLICIES["pca"].resolve_parameters({"minimumRelativeAbundance": value})
