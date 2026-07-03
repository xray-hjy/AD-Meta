"""KO LDA 柱状图数据计算。

该模块只用于 KO 功能数据。流程是先用 Mann-Whitney U 检验筛出显著 KO，
再用单变量 LDA 衡量每个 KO 对 AD/NC 分组的区分强度，最后按 AD 富集和
NC 富集分别取 Top 项，供前端画左右发散柱状图。
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis

from app.compute.common import AD, NC, FEATURE_META, group_frames


def _univariate_lda_score(values: np.ndarray, labels: np.ndarray) -> float:
    """计算一个 KO 特征的单变量 LDA 强度。

    输入是一列 log 后丰度和对应 AD/NC 标签。返回绝对系数作为效应强度；
    如果该特征没有变化或模型无法拟合，返回 0，避免单个 KO 影响整批导入。
    """

    if len(np.unique(values)) < 2 or len(np.unique(labels)) < 2:
        return 0.0

    try:
        model = LinearDiscriminantAnalysis()
        model.fit(values.reshape(-1, 1), labels)
    except (ValueError, FloatingPointError):
        return 0.0

    coef = np.ravel(getattr(model, "coef_", [0.0]))[0]
    return float(abs(coef)) if np.isfinite(coef) else 0.0


def compute_ko_lda(df: pd.DataFrame, species_cols: list[str], top_n: int = 30, p_value_max: float = 0.05) -> dict:
    """生成 KO LDA 图 payload。

    筛选和排序规则：
    - 每个 KO 先做 Mann-Whitney U 检验。
    - 只保留 `p < p_value_max` 的显著 KO。
    - 根据 AD/NC 组均值判断富集方向。
    - 每组按 `ldaScore desc -> pValue asc -> koId asc` 排序。
    """

    ad, nc = group_frames(df, species_cols)
    ad_values = ad.to_numpy(dtype=float)
    nc_values = nc.to_numpy(dtype=float)
    ad_mean = ad_values.mean(axis=0)
    nc_mean = nc_values.mean(axis=0)
    log_values = np.log10(np.concatenate([ad_values, nc_values], axis=0) + 1)
    labels = np.array([AD] * len(ad_values) + [NC] * len(nc_values))
    eps = 1e-9
    max_features = max(1, int(top_n))
    per_group_top_n = max(1, max_features // 2)

    items = []
    for index, col in enumerate(species_cols):
        # 非参数检验负责显著性筛选；无法检验时按不显著处理。
        try:
            p_value = mannwhitneyu(ad_values[:, index], nc_values[:, index], alternative="two-sided").pvalue
        except ValueError:
            p_value = 1.0

        # 不显著 KO 不进入候选池，也不会为了凑满左右两边数量而回填。
        p_value = float(p_value) if np.isfinite(p_value) else 1.0
        if p_value >= p_value_max:
            continue

        # LDA 用 log 后丰度，log2FC 用原始组均值加极小值避免除零。
        mean_ad = float(ad_mean[index])
        mean_nc = float(nc_mean[index])
        lda_score = _univariate_lda_score(log_values[:, index], labels)
        log2fc = float(np.log2((mean_ad + eps) / (mean_nc + eps)))
        enriched_group = AD if mean_ad >= mean_nc else NC
        items.append(
            {
                "koId": col,
                "koName": col,
                "enrichedGroup": enriched_group,
                "ldaScore": lda_score,
                "pValue": p_value,
                "log2FC": log2fc,
                "meanAD": mean_ad,
                "meanNC": mean_nc,
            }
        )

    ad_items = [item for item in items if item["enrichedGroup"] == AD]
    nc_items = [item for item in items if item["enrichedGroup"] == NC]

    # 两组独立排序和截断，保证 AD/NC 富集项展示更平衡。
    sort_key = lambda item: (-item["ldaScore"], item["pValue"], item["koId"])
    ad_items.sort(key=sort_key)
    nc_items.sort(key=sort_key)
    selected_items = (ad_items[:per_group_top_n] + nc_items[:per_group_top_n])[:max_features]

    return {
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["ko"]["label"]),
        "method": "Mann-Whitney U + univariate LDA on log10(abundance + 1)",
        "filter": {
            "pValueMax": p_value_max,
            "topN": max_features,
            "selectionMode": "balanced_significant_by_group",
            "perGroupTopN": per_group_top_n,
        },
        "summary": {
            "significantCount": len(items),
            "adEnrichedCount": len(ad_items),
            "ncEnrichedCount": len(nc_items),
            "displayedCount": len(selected_items),
            "adDisplayedCount": sum(1 for item in selected_items if item["enrichedGroup"] == AD),
            "ncDisplayedCount": sum(1 for item in selected_items if item["enrichedGroup"] == NC),
        },
        "items": selected_items,
    }
