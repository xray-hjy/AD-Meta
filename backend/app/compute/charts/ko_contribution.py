"""Relative KO contribution profiles for descriptive browser projections.

The source abundance matrix remains unchanged. This module closes every sample
to relative contributions before group aggregation, then applies one shared
ranking across the visible series. It intentionally does not create an
``Other`` category: KOs outside the display cap remain individually traceable
in the projection audit table.
"""

from __future__ import annotations

from typing import Any

import pandas as pd


def compute_relative_series_values(
    frame: pd.DataFrame,
    features: list[str],
    series: list[dict[str, Any]],
    *,
    sample_mode: bool,
) -> tuple[dict[str, pd.Series], int]:
    """Return closed relative profiles for each visible sample/group series."""

    matrix = frame[features].astype(float).clip(lower=0.0)
    sample_totals = matrix.sum(axis=1)
    zero_total_count = int((sample_totals <= 0).sum())
    relative = matrix.div(sample_totals.where(sample_totals > 0), axis=0).fillna(0.0)

    values: dict[str, pd.Series] = {}
    for item in series:
        if sample_mode:
            profile = relative.iloc[0].copy()
        else:
            group_rows = relative.loc[frame["Group"] == item["group"]]
            profile = group_rows.mean(axis=0) if not group_rows.empty else pd.Series(0.0, index=features)

        # Valid samples already sum to one. Re-closing the aggregate only
        # protects the contract when an upstream artifact contains zero-total
        # samples; their count is disclosed separately in the payload.
        profile_total = float(profile.sum())
        values[item["key"]] = profile / profile_total if profile_total > 0 else profile

    return values, zero_total_count


def rank_relative_contributions(
    features: list[str],
    series_values: dict[str, pd.Series],
) -> pd.Series:
    """Rank KOs by the equally weighted sum of visible relative profiles."""

    scores = pd.Series(0.0, index=features, dtype=float)
    for values in series_values.values():
        scores = scores.add(values.reindex(features, fill_value=0.0), fill_value=0.0)
    return scores.sort_values(ascending=False, kind="stable")


def compute_ko_contribution(
    frame: pd.DataFrame,
    features: list[str],
    series: list[dict[str, Any]],
    *,
    sample_mode: bool,
    top_n: int,
) -> dict[str, Any]:
    """Build a Top-N KO contribution payload without collapsing the long tail."""

    series_values, zero_total_count = compute_relative_series_values(
        frame,
        features,
        series,
        sample_mode=sample_mode,
    )
    ordered = rank_relative_contributions(features, series_values)
    kept = [str(feature) for feature in ordered.head(top_n).index]

    cumulative = {item["key"]: 0.0 for item in series}
    items = []
    for rank, feature in enumerate(kept, start=1):
        values = {
            item["key"]: float(series_values[item["key"]].get(feature, 0.0))
            for item in series
        }
        for key, value in values.items():
            cumulative[key] += value
        items.append({
            "rank": rank,
            "feature": feature,
            "values": values,
            "cumulativeCoverage": dict(cumulative),
        })

    return {
        "series": series,
        "items": items,
        "sourceFeatureCount": len(features),
        "displayedFeatureCount": len(items),
        "omittedFeatureCount": max(0, len(features) - len(items)),
        "coverageBySeries": dict(cumulative),
        "zeroTotalSampleCount": zero_total_count,
        "normalizationMethod": "total_sum_scaling_per_sample",
        "aggregationMethod": "arithmetic_mean_of_sample_relative_contributions",
        "rankingMethod": "shared_sum_of_visible_series_relative_contributions",
    }


__all__ = [
    "compute_ko_contribution",
    "compute_relative_series_values",
    "rank_relative_contributions",
]
