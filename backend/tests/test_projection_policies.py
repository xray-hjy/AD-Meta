from __future__ import annotations

import pandas as pd
import pytest

from app.compute.charts.ko_contribution import compute_ko_contribution
from app.compute.charts.ordination import compute_pca, compute_pcoa, prepare_pcoa_input
from app.domain.projection_policy import PROJECTION_POLICIES
from app.services.chart_projection_service import _projection_metadata


def _ordination_frame(groups: list[str]) -> tuple[pd.DataFrame, list[str]]:
    features = ["f1", "f2", "f3", "f4"]
    rows = []
    for index, group in enumerate(groups):
        rows.append({
            "Sample": f"S{index + 1}",
            "Group": group,
            "f1": 1 + index,
            "f2": 2 + (index % 3),
            "f3": 5 + (index % 2),
            "f4": 8 - (index % 4),
        })
    frame = pd.DataFrame(rows)
    frame.attrs["feature_label"] = "物种"
    return frame, features


def test_each_projection_owns_an_explicit_policy() -> None:
    assert PROJECTION_POLICIES["heatmap"].min_per_group == 3
    assert PROJECTION_POLICIES["pca"].top_n_recommended == (50, 100, 200, 500)
    assert PROJECTION_POLICIES["pcoa"].inference_min_per_group == 3
    assert PROJECTION_POLICIES["pcoa"].resolve_parameter({}, "filterPreset") == "standard"
    with pytest.raises(ValueError, match="must be one of"):
        PROJECTION_POLICIES["pcoa"].resolve_parameter(
            {"filterPreset": "unknown"}, "filterPreset"
        )
    assert PROJECTION_POLICIES["detection"].parameters[
        "abundanceThreshold"
    ].recommended == (0.0,)


def test_policy_parameters_have_defaults_and_authoritative_bounds() -> None:
    heatmap = PROJECTION_POLICIES["heatmap"]
    assert heatmap.resolve_parameter({}, "qValueMax") == pytest.approx(0.05)
    assert heatmap.resolve_parameter({"log2FcMinAbs": 1.5}, "log2FcMinAbs") == pytest.approx(1.5)
    with pytest.raises(ValueError, match="between"):
        heatmap.resolve_parameter({"qValueMax": 2}, "qValueMax")

    assert heatmap.resolve_parameters({"qValueMax": 0.01}) == {
        "qValueMax": pytest.approx(0.01),
        "log2FcMinAbs": pytest.approx(1.0),
    }
    with pytest.raises(ValueError, match="Unsupported parameters"):
        heatmap.resolve_parameters({"unknown": 1})


def test_projection_policies_distinguish_display_caps_from_computation() -> None:
    assert PROJECTION_POLICIES["heatmap"].top_n_role == "display_cap"
    assert PROJECTION_POLICIES["detection"].top_n_role == "display_cap"
    assert PROJECTION_POLICIES["differential_ko"].top_n_role == "display_cap"
    assert PROJECTION_POLICIES["pca"].top_n_role == "feature_selection"
    assert PROJECTION_POLICIES["pcoa"].top_n_role == "not_applicable"
    assert PROJECTION_POLICIES["composition"].top_n_role == "aggregation_limit"
    assert PROJECTION_POLICIES["composition"].feature_kind == "taxonomy"
    assert PROJECTION_POLICIES["ko_contribution"].top_n_role == "display_cap"
    assert PROJECTION_POLICIES["ko_contribution"].feature_kind == "ko"
    assert PROJECTION_POLICIES["taxonomy"].top_n_role == "not_applicable"

    assert PROJECTION_POLICIES["heatmap"].analysis_family == "exploratory_group_comparison"
    assert PROJECTION_POLICIES["pca"].analysis_family == "exploratory_ordination"
    assert (
        PROJECTION_POLICIES["pcoa"].analysis_family
        == "ordination_with_optional_inference"
    )


def test_ko_contribution_closes_each_sample_and_never_creates_other() -> None:
    frame = pd.DataFrame(
        [
            {"Sample": "AD-1", "Group": "AD", "K1": 90.0, "K2": 10.0, "K3": 0.0},
            {"Sample": "AD-2", "Group": "AD", "K1": 1.0, "K2": 9.0, "K3": 0.0},
            {"Sample": "NC-1", "Group": "NC", "K1": 0.0, "K2": 20.0, "K3": 80.0},
        ]
    )
    series = [
        {"key": "AD", "label": "AD 均值", "group": "AD", "color": "#e74c3c"},
        {"key": "NC", "label": "NC 均值", "group": "NC", "color": "#2ecc71"},
    ]

    payload = compute_ko_contribution(
        frame,
        ["K1", "K2", "K3"],
        series,
        sample_mode=False,
        top_n=2,
    )

    assert [item["feature"] for item in payload["items"]] == ["K3", "K2"]
    assert payload["items"][0]["values"]["NC"] == pytest.approx(0.8)
    assert payload["items"][1]["values"]["AD"] == pytest.approx(0.5)
    assert payload["coverageBySeries"] == {
        "AD": pytest.approx(0.5),
        "NC": pytest.approx(1.0),
    }
    assert payload["sourceFeatureCount"] == 3
    assert payload["displayedFeatureCount"] == 2
    assert payload["omittedFeatureCount"] == 1
    assert all(item["feature"] != "Other" for item in payload["items"])
    assert payload["normalizationMethod"] == "total_sum_scaling_per_sample"


def test_sankey_projection_metadata_counts_only_terminal_nodes_as_leaves() -> None:
    payload = {
        "nodes": [
            {"name": "root", "mergedCount": 0},
            {"name": "root/child-a", "mergedCount": 0},
            {"name": "root/child-b", "mergedCount": 2},
        ],
        "links": [
            {"source": "root", "target": "root/child-a", "value": 2},
            {"source": "root", "target": "root/child-b", "value": 1},
        ],
    }

    metadata = _projection_metadata("taxonomy_sankey", payload, 10, 20)

    assert metadata["displayedNodeCount"] == 3
    assert metadata["terminalNodeCount"] == 2
    assert metadata["returnedFeatureCount"] == 2


def test_pca_discloses_feature_selection_scaling_and_ellipse_semantics() -> None:
    frame, features = _ordination_frame(["AD", "AD", "AD", "NC", "NC", "NC"])
    payload = compute_pca(frame, features, top_n=3)

    assert payload["featureSelection"] == {
        "method": "top_n_by_total_abundance",
        "requestedTopN": 3,
        "selectedCount": 3,
    }
    assert payload["preprocessing"]["scaling"] == "z_score_per_feature"
    assert {ellipse["type"] for ellipse in payload["ellipses"]} == {
        "group_data_distribution_95"
    }


def test_pcoa_only_runs_group_inference_when_both_groups_have_three_samples() -> None:
    invalid, features = _ordination_frame(["AD", "NC", "NC"])
    invalid_payload = compute_pcoa(invalid, features, filter_preset="unfiltered")
    assert invalid_payload["permanova"] is None
    assert invalid_payload["permanovaStatus"] == "not_applicable_minimum_group_size"
    assert invalid_payload["permdisp"] is None

    valid, features = _ordination_frame(["AD", "AD", "AD", "NC", "NC", "NC"])
    valid_payload = compute_pcoa(
        valid,
        features,
        filter_preset="unfiltered",
        inference_min_per_group=3,
    )
    assert valid_payload["permanovaStatus"] == "computed_exploratory_unadjusted"
    assert valid_payload["permdispStatus"] == "computed_exploratory_unadjusted"
    assert valid_payload["permanova"]["nPerm"] == 999
    assert valid_payload["permdisp"]["nPerm"] == 999
    assert valid_payload["permanova"]["distanceFingerprint"] == valid_payload["distanceFingerprint"]
    assert valid_payload["permdisp"]["distanceFingerprint"] == valid_payload["distanceFingerprint"]
    assert valid_payload["eigenDiagnostics"]["varianceBasis"] == "positive_eigenvalues"


def test_pcoa_filtering_is_label_blind_and_recloses_retained_features() -> None:
    rows = []
    for index in range(20):
        rows.append({
            "Sample": f"S{index + 1}",
            "Group": "AD" if index < 10 else "NC",
            "common": 999.0,
            "rare": 1.0 if index == 0 else 0.0,
            "absent": 0.0,
        })
    frame = pd.DataFrame(rows)
    relabelled = frame.copy()
    relabelled["Group"] = ["NC" if value == "AD" else "AD" for value in frame["Group"]]

    prepared = prepare_pcoa_input(frame, ["common", "rare", "absent"], "standard")
    relabelled_prepared = prepare_pcoa_input(
        relabelled,
        ["common", "rare", "absent"],
        "standard",
    )

    assert prepared["retainedFeatures"] == ["common"]
    assert relabelled_prepared["retainedFeatures"] == prepared["retainedFeatures"]
    assert prepared["filter"]["labelIndependent"] is True
    assert prepared["filter"]["retainedMass"]["mean"] == pytest.approx(0.99995)
    assert prepared["matrix"].sum(axis=1).tolist() == pytest.approx([1.0] * 20)
    reasons = {row["feature"]: row["reason"] for row in prepared["auditRows"]}
    assert reasons == {
        "common": "meets_ordination_filter",
        "rare": "below_minimum_prevalence",
        "absent": "below_minimum_relative_abundance",
    }


def test_pcoa_excludes_zero_total_samples_before_closure() -> None:
    frame = pd.DataFrame([
        {"Sample": "S0", "Group": "AD", "f1": 0.0, "f2": 0.0},
        {"Sample": "S1", "Group": "AD", "f1": 2.0, "f2": 1.0},
        {"Sample": "S2", "Group": "NC", "f1": 1.0, "f2": 2.0},
        {"Sample": "S3", "Group": "NC", "f1": 3.0, "f2": 1.0},
    ])

    prepared = prepare_pcoa_input(frame, ["f1", "f2"], "unfiltered")

    assert prepared["sampleFiltering"]["sourceSampleCount"] == 4
    assert prepared["sampleFiltering"]["selectedSampleCount"] == 3
    assert prepared["sampleFiltering"]["excludedZeroTotalSamples"] == ["S0"]
    assert prepared["matrix"].sum(axis=1).tolist() == pytest.approx([1.0, 1.0, 1.0])
