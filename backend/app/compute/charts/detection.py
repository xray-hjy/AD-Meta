"""KO 检出率热图数据计算。

检出率图只用于 KO 数据集。它不看丰度大小本身，而是看某个 KO 在 AD/NC
样本中是否出现过：`abundance > 0` 即视为检出。
"""

from __future__ import annotations

import pandas as pd

from app.compute.common import AD, FEATURE_META, NC, group_frames


def compute_detection_heatmap(
    df: pd.DataFrame,
    species_cols: list[str],
    top_n: int = 50,
    abundance_threshold: float = 0.0,
    include_audit: bool = False,
) -> dict:
    """计算 AD/NC 两组 KO 检出率矩阵。

    排序优先展示两组检出率差异最大的 KO；返回的 `matrix` 是两行：
    第一行 AD 检出率，第二行 NC 检出率。
    """

    ad, nc = group_frames(df, species_cols)

    # presence 是布尔矩阵：丰度大于 0 表示该样本检出了这个 KO。
    ad_presence = ad.gt(abundance_threshold)
    nc_presence = nc.gt(abundance_threshold)
    ad_sample_count = int(len(ad))
    nc_sample_count = int(len(nc))
    total_sample_count = ad_sample_count + nc_sample_count
    max_features = max(1, int(top_n))

    items = []
    audit_items = []
    for col in species_cols:
        # 分别统计两组检出样本数，再换算成检出率。
        ad_detected = int(ad_presence[col].sum())
        nc_detected = int(nc_presence[col].sum())
        overall_detected = ad_detected + nc_detected
        ad_rate = ad_detected / ad_sample_count if ad_sample_count else 0.0
        nc_rate = nc_detected / nc_sample_count if nc_sample_count else 0.0
        item = {
                "koId": col,
                "koName": col,
                "adDetectedSamples": ad_detected,
                "adDetectionRate": float(ad_rate),
                "ncDetectedSamples": nc_detected,
                "ncDetectionRate": float(nc_rate),
                "rateGap": float(ad_rate - nc_rate),
                "overallDetectedSamples": overall_detected,
                "overallDetectionRate": float(overall_detected / total_sample_count) if total_sample_count else 0.0,
            }
        audit_items.append(item)
        if overall_detected > 0:
            items.append(item)

    # 差异越大的 KO 越靠前；差异相同时用整体检出水平和 KO 编号稳定排序。
    items.sort(
        key=lambda item: (
            -abs(item["rateGap"]),
            -max(item["adDetectionRate"], item["ncDetectionRate"]),
            -item["overallDetectionRate"],
            item["koId"],
        )
    )
    eligible_count = len(items)
    selected_ids = {item["koId"] for item in items[:max_features]}
    items = items[:max_features]

    if include_audit:
        eligible_ids = {item["koId"] for item in audit_items if item["overallDetectedSamples"] > 0}
        for item in audit_items:
            if item["koId"] in selected_ids:
                item["status"] = "displayed"
                item["reason"] = "largest_detection_rate_gap"
            elif item["koId"] in eligible_ids:
                item["status"] = "display_cap"
                item["reason"] = "outside_top_n"
            else:
                item["status"] = "filtered"
                item["reason"] = "not_detected_above_threshold"

    payload = {
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "detectionRule": f"abundance > {abundance_threshold:g}",
        "filter": {
            "abundanceThreshold": abundance_threshold,
            "topN": max_features,
            "selectionMode": "largest_detection_rate_gap",
        },
        "summary": {
            "sourceFeatureCount": len(species_cols),
            "detectedFeatureCount": eligible_count,
            "displayedCount": len(items),
        },
        "groups": [
            {"group": AD, "sampleCount": ad_sample_count},
            {"group": NC, "sampleCount": nc_sample_count},
        ],
        "rowLabels": [AD, NC],
        "colLabels": [item["koId"] for item in items],
        "matrix": [
            [item["adDetectionRate"] for item in items],
            [item["ncDetectionRate"] for item in items],
        ],
        "items": items,
    }
    if include_audit:
        payload["_auditRows"] = audit_items
    return payload
