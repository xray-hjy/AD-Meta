"""Traceable phylum aggregation; preserve source totals and sample distributions."""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.compute.charts.boxplot import boxplot_display, describe_boxplot_group
from app.compute.taxonomy import get_level


def compute_phylum_composition(df: pd.DataFrame, features: list[str], series: list[dict], merge_below: float = 0) -> dict:
    raw = df[features].to_numpy(dtype=float)
    if not np.isfinite(raw).all() or (raw < 0).any():
        raise ValueError("Phylum composition requires finite non-negative abundances")
    relative = df.attrs.get("abundance_scale") == "relative_abundance"
    if merge_below > 0 and not relative:
        raise ValueError("Low-abundance merging requires a declared relative-abundance input")
    members: dict[str, list[str]] = {}
    for feature in features:
        label = (get_level(feature, "p") or "Unclassified").replace("_", " ")
        members.setdefault(label, []).append(feature)
    values = pd.DataFrame({label: df[columns].sum(axis=1) for label, columns in members.items()}, index=df.index)
    means = values.mean(axis=0)
    labels = sorted(members, key=lambda label: (-float(means[label]), label))
    merged = [label for label in labels if merge_below > 0 and float(means[label]) < merge_below]
    other_label = "Other（合并低丰度门）"
    while other_label in labels:
        other_label += "*"
    display_labels = [label for label in labels if label not in merged] + ([other_label] if merged else [])
    display = values.copy()
    if merged:
        display[other_label] = values[merged].sum(axis=1)
    group_counts = df["Group"].astype(str).value_counts().to_dict()
    group_values = {}
    for item in series:
        selected = display if "group" not in item else display.loc[df["Group"] == item["group"]]
        group_values[item["key"]] = selected.mean(axis=0)
    items = [{"feature": label, "values": {item["key"]: float(group_values[item["key"]][label]) for item in series},
              **({"mergedCount": len(merged)} if label == other_label and merged else {})} for label in display_labels]
    original_groups = {}
    for item in series:
        selected = values if "group" not in item else values.loc[df["Group"] == item["group"]]
        original_groups[item["key"]] = selected.mean(axis=0)
    audit_rows = [{"rank": index + 1, "feature": label, "_featureKeys": members[label],
                   "status": "merged" if label in merged else "displayed",
                   "destination": other_label if label in merged else label,
                   "reason": "user_low_abundance_merge" if label in merged else "all_phyla_displayed",
                   **{f"series_{index}": float(original_groups[item["key"]][label]) for index, item in enumerate(series)}}
                  for index, label in enumerate(labels)]
    def sample_rows(matrix, names):
        return [{"sample": str(df.iloc[index]["Sample"]), "group": str(df.iloc[index]["Group"]),
                 "values": {label: float(matrix.iloc[index][label]) for label in names}}
                for index in range(len(df))]
    scale, transforms = boxplot_display(df.attrs.get("abundance_scale", "unknown"))
    box_series = [{"key": group, "label": f"{group} 组", "color": "#e74c3c" if group == "AD" else "#2ecc71"} for group in sorted(group_counts)]
    distributions = []
    for label in display_labels:
        stats, summaries = {}, {}
        for item in box_series:
            mask = df["Group"] == item["key"]
            stats[item["key"]], summaries[item["key"]] = describe_boxplot_group(
                display.loc[mask, label].to_numpy(dtype=float) * scale, df.loc[mask, "Sample"].astype(str).to_numpy())
        distributions.append({"featureId": label, "fullName": label, "shortName": label,
                              "values": summaries, "groupStats": stats})
    totals = values.sum(axis=1)
    return {"series": series, "items": items, "sourceItems": [{"feature": label,
            "values": {item["key"]: float(original_groups[item["key"]][label]) for item in series}} for label in labels],
            "samples": sample_rows(display, display_labels), "sourceSamples": sample_rows(values, labels),
            "distributions": {"series": box_series, "items": distributions, **transforms},
            "sourceCategoryCount": len(labels), "displayedCategoryCount": len(items), "mergedCategoryCount": len(merged),
            "merge": {"minimumMeanRelativeAbundance": merge_below, "members": merged, "destination": other_label if merged else None,
                      "rule": "mean_across_selected_samples_strictly_below_threshold", "enabled": merge_below > 0},
            "semantics": {"rank": "phylum", "source": "aggregated_from_species", "abundanceScale": df.attrs.get("abundance_scale", "unknown"),
                          "groupAggregation": "arithmetic_mean_of_sample_phylum_sums_including_zeros", "closure": "none",
                          "sourceNormalization": df.attrs.get("normalization", "unknown"),
                          "sampleCount": len(df), "groupCounts": group_counts,
                          "unclassifiedSpeciesCount": len(members.get("Unclassified", [])),
                          "sampleTotalMinimum": float(totals.min()) if len(totals) else 0,
                          "sampleTotalMaximum": float(totals.max()) if len(totals) else 0,
                          "methodVersion": "2026-11-15-phylum-source-totals-v2"}, "_aggregationRows": audit_rows}
