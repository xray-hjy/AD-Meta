import json

import numpy as np
import pandas as pd
import pytest
from scipy.stats import mannwhitneyu

from app.compute.charts.heatmap import analyze_heatmap, compute_heatmap
from app.compute.statistics import benjamini_hochberg


def frame():
    result = pd.DataFrame(
        {
            "Sample": [f"S{i}" for i in range(20)],
            "Group": ["AD"] * 10 + ["NC"] * 10,
            "signalAD": [0.3] * 10 + [0.001] * 10,
            "signalNC": [0.002] * 10 + [0.4] * 10,
            "constant": [0.01] * 20,
            "zero": [0.0] * 20,
            "rare": [1e-8] + [0.0] * 19,
        }
    )
    result.attrs["abundance_scale"] = "relative_abundance"
    return result


def test_full_family_matches_independent_scipy_bh_and_never_depends_on_topn_or_colors():
    df = frame()
    features = list(df.columns[2:])
    expected = benjamini_hochberg(
        [mannwhitneyu(df.loc[df.Group == "AD", col], df.loc[df.Group == "NC", col]).pvalue for col in features]
    )
    one = compute_heatmap(df, features, top_n=1, include_audit=True)
    many = compute_heatmap(
        df, features, top_n=20, view_mode="exploratory", visual_transform="zscore", include_audit=True
    )
    assert [row["qValue"] for row in one["_analysisRows"]] == pytest.approx(expected)
    assert one["analysisRecord"]["analysisKey"] == many["analysisRecord"]["analysisKey"]
    assert one["_analysisRows"] == many["_analysisRows"]
    assert one["summary"]["bothPassCount"] == 2
    assert len(one["stats"]) == 1 and len(many["stats"]) == 5
    assert many["filter"]["viewMode"] == "exploratory"
    # Constant and all-zero features have no dispersion; zero is a real value.
    raw = {row["col"]: row for row in many["_analysisRows"]}
    for col in ["zero", "constant"]:
        i = next(i for i, row in enumerate(many["stats"]) if row["col"] == col)
        assert np.asarray(many["adMatrix"])[:, i].tolist() == [0.0] * 10
        assert raw[col]["pValue"] == raw[col]["qValue"] == 1
    assert raw["rare"]["epsilonSensitive"]
    json.dumps(many, allow_nan=False)


def test_prespecified_pooled_prefilter_records_every_excluded_source_and_its_null_inference():
    df = frame()
    features = list(df.columns[2:])
    record, rows = analyze_heatmap(df, features, prefilter="prevalence", minimum_prevalence=0.1)
    assert record["testedFeatureCount"] == 3
    assert record["excludedFeatureCount"] == 2
    assert all(row["pValue"] is None and row["qValue"] is None for row in rows if not row["tested"])
    reordered = df.copy()
    reordered["Group"] = list(reversed(df.Group))
    _, other = analyze_heatmap(reordered, features, prefilter="prevalence", minimum_prevalence=0.1)
    assert [row["tested"] for row in rows] == [row["tested"] for row in other]
    assert record["prefilter"]["pool"] == "all_selected_samples_without_group_labels"
    with pytest.raises(ValueError, match="相对丰度"):
        df.attrs["abundance_scale"] = "unknown"
        analyze_heatmap(df, features, prefilter="abundance_prevalence")


def test_zero_candidates_do_not_auto_relax_or_fill_and_single_candidate_keeps_all_samples():
    df = frame()
    features = list(df.columns[2:])
    zero = compute_heatmap(df, features, q_value_max=0)
    assert zero["summary"]["bothPassCount"] == 0 and zero["stats"] == []
    assert "adMatrix" not in zero
    one = compute_heatmap(df, features, top_n=1)
    assert len(one["adLabels"]) == len(one["ncLabels"]) == 10
    assert np.asarray(one["rawAdMatrix"]).shape == (10, 1)
    assert one["stats"][0]["nAD"] == 10
    assert one["stats"][0]["detectedAD"] == 10


@pytest.mark.parametrize("value", [np.nan, np.inf, -0.01])
def test_missing_nonfinite_and_negative_inputs_are_not_changed_to_zero(value):
    df = frame()
    df.loc[0, "signalAD"] = value
    with pytest.raises(ValueError, match="静默填零"):
        analyze_heatmap(df, list(df.columns[2:]))


def test_zero_only_data_have_valid_empty_inference_and_finite_explicit_exploration():
    df = frame()
    df.loc[:, df.columns[2:]] = 0
    result = compute_heatmap(df, list(df.columns[2:]), include_audit=True)
    assert result["summary"]["minQ"] == 1
    assert result["summary"]["bothPassCount"] == 0
    visible = compute_heatmap(
        df, list(df.columns[2:]), view_mode="exploratory", visual_transform="log", clustering="grouped"
    )
    assert all(np.isfinite(visible["adMatrix"]).ravel())
    assert visible["dendrograms"]["rows"]["merges"] == []
    assert visible["filter"]["colorMin"] < 0
