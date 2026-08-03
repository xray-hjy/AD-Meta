"""Exploratory KO differential-feature computation.

The historical module name is kept for import compatibility.  The previous
single-feature LinearDiscriminantAnalysis coefficient was not a LEfSe score and
has been replaced by FDR-adjusted Mann-Whitney tests plus rank-biserial effect
sizes.  New callers should use :func:`compute_ko_differential`.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu

from app.compute.common import AD, FEATURE_META, NC, group_frames
from app.compute.statistics import benjamini_hochberg, rank_biserial_from_u


def _univariate_lda_score(values: np.ndarray, labels: np.ndarray) -> float:
    """Compatibility shim for historical imports; no longer used for results."""

    del values, labels
    return 0.0


def compute_ko_differential(
    df: pd.DataFrame,
    species_cols: list[str],
    top_n: int = 30,
    q_value_max: float = 0.05,
    prevalence_min: float = 0.1,
    include_audit: bool = False,
) -> dict:
    """Generate an FDR-controlled exploratory KO differential payload."""

    ad, nc = group_frames(df, species_cols)
    ad_values = ad.to_numpy(dtype=float)
    nc_values = nc.to_numpy(dtype=float)
    ad_mean = ad_values.mean(axis=0)
    nc_mean = nc_values.mean(axis=0)
    all_values = np.concatenate([ad_values, nc_values], axis=0)
    eps = 1e-9
    max_features = max(1, int(top_n))
    per_group_top_n = max(1, max_features // 2)

    tested: list[dict] = []
    audit_rows: list[dict] = []
    for index, col in enumerate(species_cols):
        prevalence = float(np.mean(all_values[:, index] > 0)) if len(all_values) else 0.0
        if prevalence < prevalence_min:
            if include_audit:
                audit_rows.append({
                    "koId": col,
                    "prevalence": prevalence,
                    "status": "filtered",
                    "reason": "below_prevalence_threshold",
                })
            continue
        try:
            result = mannwhitneyu(ad_values[:, index], nc_values[:, index], alternative="two-sided")
            p_value = float(result.pvalue) if np.isfinite(result.pvalue) else 1.0
            effect_size = rank_biserial_from_u(
                getattr(result, "statistic", float("nan")),
                len(ad_values),
                len(nc_values),
            )
        except ValueError:
            p_value = 1.0
            effect_size = 0.0

        mean_ad = float(ad_mean[index])
        mean_nc = float(nc_mean[index])
        tested.append(
            {
                "koId": col,
                "koName": col,
                "pValue": p_value,
                "effectSize": effect_size,
                "effectMetric": "rank_biserial_correlation",
                "log2FC": float(np.log2((mean_ad + eps) / (mean_nc + eps))),
                "meanAD": mean_ad,
                "meanNC": mean_nc,
                "prevalence": prevalence,
            }
        )

    q_values = benjamini_hochberg([item["pValue"] for item in tested])
    for item, q_value in zip(tested, q_values, strict=True):
        item["qValue"] = float(q_value)
        item["enrichedGroup"] = AD if item["effectSize"] >= 0 else NC
        # One-version compatibility field.  It is the absolute rank-biserial
        # effect, not an LDA score, and new clients must use effectSize.
        item["ldaScore"] = abs(float(item["effectSize"]))

    significant = [item for item in tested if item["qValue"] < q_value_max]
    ad_items = [item for item in significant if item["enrichedGroup"] == AD]
    nc_items = [item for item in significant if item["enrichedGroup"] == NC]
    def sort_key(item):
        return (-abs(item["effectSize"]), item["qValue"], item["koId"])
    ad_items.sort(key=sort_key)
    nc_items.sort(key=sort_key)
    selected_items = (ad_items[:per_group_top_n] + nc_items[:per_group_top_n])[:max_features]
    if include_audit:
        selected_ids = {item["koId"] for item in selected_items}
        for item in tested:
            row = dict(item)
            if item["koId"] in selected_ids:
                row["status"] = "displayed"
                row["reason"] = "balanced_effect_ranking"
            elif item["qValue"] < q_value_max:
                row["status"] = "display_cap"
                row["reason"] = "outside_balanced_top_n"
            else:
                row["status"] = "filtered"
                row["reason"] = "q_value_threshold"
            audit_rows.append(row)

    payload = {
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["ko"]["label"]),
        "method": "Mann-Whitney U with Benjamini-Hochberg FDR",
        "inferenceLevel": "exploratory_fdr",
        "modelFormula": "Group",
        "filter": {
            "qValueMax": q_value_max,
            "prevalenceMin": prevalence_min,
            "topN": max_features,
            "selectionMode": "balanced_fdr_significant_by_group",
            "perGroupTopN": per_group_top_n,
            "multipleTesting": "Benjamini-Hochberg",
        },
        "summary": {
            "testedCount": len(tested),
            "significantCount": len(significant),
            "adEnrichedCount": len(ad_items),
            "ncEnrichedCount": len(nc_items),
            "displayedCount": len(selected_items),
            "adDisplayedCount": sum(1 for item in selected_items if item["enrichedGroup"] == AD),
            "ncDisplayedCount": sum(1 for item in selected_items if item["enrichedGroup"] == NC),
        },
        "items": selected_items,
        "deprecations": {
            "artifact": "lda",
            "replacement": "differential_ko",
            "legacyFields": ["ldaScore"],
        },
    }
    if include_audit:
        payload["_auditRows"] = audit_rows
    return payload


def compute_ko_lda(
    df: pd.DataFrame,
    species_cols: list[str],
    top_n: int = 30,
    p_value_max: float = 0.05,
) -> dict:
    """Compatibility alias for the historical public function."""

    return compute_ko_differential(
        df,
        species_cols,
        top_n=top_n,
        q_value_max=p_value_max,
    )
