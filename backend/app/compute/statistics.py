"""Shared statistical helpers used by exploratory chart computations.

The public application can compare thousands of features at once.  Raw
per-feature p-values therefore must never be used as the final significance
decision.  This module keeps the multiple-testing and effect-size rules in one
place so every chart exposes the same semantics.
"""

from __future__ import annotations

import numpy as np


def benjamini_hochberg(p_values: list[float] | np.ndarray) -> np.ndarray:
    """Return Benjamini-Hochberg adjusted p-values in original order.

    Non-finite inputs are treated as 1.0.  The reverse cumulative minimum is
    required to keep adjusted values monotonic after restoring rank order.
    """

    values = np.asarray(p_values, dtype=float)
    if values.size == 0:
        return np.asarray([], dtype=float)

    values = np.where(np.isfinite(values), values, 1.0)
    values = np.clip(values, 0.0, 1.0)
    order = np.argsort(values, kind="stable")
    ranked = values[order]
    adjusted_ranked = ranked * values.size / np.arange(1, values.size + 1)
    adjusted_ranked = np.minimum.accumulate(adjusted_ranked[::-1])[::-1]
    adjusted = np.empty_like(adjusted_ranked)
    adjusted[order] = np.clip(adjusted_ranked, 0.0, 1.0)
    return adjusted


def rank_biserial_from_u(u_statistic: float, n_first: int, n_second: int) -> float:
    """Convert a Mann-Whitney U statistic to rank-biserial correlation.

    Positive values mean the first group tends to have larger observations;
    negative values mean the second group tends to be larger.
    """

    denominator = int(n_first) * int(n_second)
    if denominator <= 0 or not np.isfinite(u_statistic):
        return 0.0
    effect = (2.0 * float(u_statistic) / denominator) - 1.0
    return float(np.clip(effect, -1.0, 1.0))
