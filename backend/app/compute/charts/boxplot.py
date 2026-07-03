"""丰度箱线图数据计算。

对应前端“丰度箱线图”。该模块为 Top N 特征分别计算 AD 和 NC 的箱线图
五数概括，并同时输出原始丰度和 log10(abundance + 1) 两套统计值。
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.compute.charts.species import compute_species
from app.compute.common import AD, NC, group_frames
from app.compute.taxonomy import short_name


def _box_summary(values: np.ndarray, samples: list[str] | np.ndarray | None = None) -> dict[str, list[Any]]:
    """计算单组样本的箱线图统计值。

    返回的 `box` 顺序为 `[lowerWhisker, q1, median, q3, upperWhisker]`。
    离群点同时返回纯数值数组和带样本名的数组，后者用于前端 tooltip。
    """

    values = np.asarray(values, dtype=float)

    # 只对有限数值做统计，避免 NaN/inf 影响分位数和排序。
    finite_mask = np.isfinite(values)
    values = values[finite_mask]
    sample_values: np.ndarray | None = None
    if samples is not None:
        sample_values = np.asarray(samples, dtype=object)[finite_mask]
    order = np.argsort(values, kind="stable")
    values = values[order]
    if sample_values is not None:
        sample_values = sample_values[order]
    if values.size == 0:
        return {"box": [0, 0, 0, 0, 0], "outliers": [], "outlierPoints": []}

    # Tukey 箱线图规则：1.5 * IQR 之外的点视为离群点。
    q1, median, q3 = np.percentile(values, [25, 50, 75])
    iqr = q3 - q1
    lower_fence = q1 - 1.5 * iqr
    upper_fence = q3 + 1.5 * iqr
    inlier_mask = (values >= lower_fence) & (values <= upper_fence)
    inliers = values[inlier_mask]
    outliers = values[~inlier_mask]
    outlier_samples = sample_values[~inlier_mask] if sample_values is not None else []
    if inliers.size == 0:
        inliers = values
        outliers = np.array([], dtype=float)
        outlier_samples = []
    return {
        "box": [float(inliers[0]), float(q1), float(median), float(q3), float(inliers[-1])],
        "outliers": [float(value) for value in outliers],
        "outlierPoints": [
            {"sample": str(sample), "value": float(value)}
            for sample, value in zip(outlier_samples, outliers, strict=False)
        ],
    }


def _box_values(values: np.ndarray) -> list[float]:
    """兼容旧测试/旧导入路径：只返回箱线图五数概括。"""

    return _box_summary(values)["box"]


def _log10_abundance(values: np.ndarray) -> np.ndarray:
    """把丰度转换成 log10(abundance + 1)，用于压缩大数值跨度。"""

    return np.log10(np.clip(values, 0, None) + 1)


def compute_boxplot(df: pd.DataFrame, species_cols: list[str], top_n: int = 30) -> dict:
    """为 Top N 特征生成 AD/NC 箱线图 payload。

    Top N 复用 `compute_species` 的总体丰度排序，确保箱线图和丰度柱状图
    展示的候选特征选择逻辑一致。
    """

    ranked = compute_species(df, species_cols, top_n=top_n)
    ad, nc = group_frames(df, species_cols)

    # 样本名和丰度值一起传入 `_box_summary`，这样离群点能追踪回具体样本。
    ad_samples = df.loc[df["Group"] == AD, "Sample"].astype(str).to_numpy()
    nc_samples = df.loc[df["Group"] == NC, "Sample"].astype(str).to_numpy()
    items = []
    for item in ranked:
        col = item["fullName"]
        # 每个特征分别计算 AD/NC 原始丰度和 log 丰度的箱线图统计值。
        ad_values = ad[col].to_numpy(dtype=float)
        nc_values = nc[col].to_numpy(dtype=float)
        ad_summary = _box_summary(ad_values, ad_samples)
        nc_summary = _box_summary(nc_values, nc_samples)
        ad_log_summary = _box_summary(_log10_abundance(ad_values), ad_samples)
        nc_log_summary = _box_summary(_log10_abundance(nc_values), nc_samples)
        items.append(
            {
                "fullName": col,
                "shortName": short_name(col),
                "total": item["total"],
                "adBox": ad_summary["box"],
                "ncBox": nc_summary["box"],
                "adOutliers": ad_summary["outliers"],
                "ncOutliers": nc_summary["outliers"],
                "adOutlierPoints": ad_summary["outlierPoints"],
                "ncOutlierPoints": nc_summary["outlierPoints"],
                "adLogBox": ad_log_summary["box"],
                "ncLogBox": nc_log_summary["box"],
                "adLogOutliers": ad_log_summary["outliers"],
                "ncLogOutliers": nc_log_summary["outliers"],
                "adLogOutlierPoints": ad_log_summary["outlierPoints"],
                "ncLogOutlierPoints": nc_log_summary["outlierPoints"],
            }
        )
    return {"items": items}
