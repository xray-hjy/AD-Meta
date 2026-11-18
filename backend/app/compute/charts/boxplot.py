"""丰度箱线图数据计算。

对应前端“丰度箱线图”。该模块为 Top N 特征分别计算 AD 和 NC 的箱线图
五数概括，并输出输入丰度、平方根和 log10(abundance + 1) 三套统计值。
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.compute.charts.species import compute_species
from app.compute.common import AD, NC, group_frames
from app.compute.taxonomy import short_name

BOXPLOT_VALUE_TRANSFORMS = (
    {"key": "raw", "label": "输入丰度", "formula": "x"},
    {"key": "sqrt", "label": "sqrt(丰度)", "formula": "sqrt(max(x, 0))"},
    {"key": "log", "label": "log10(丰度 + 1)", "formula": "log10(max(x, 0) + 1)"},
)
BOXPLOT_DEFAULT_VALUE_TRANSFORM = "log"
BOXPLOT_VALUE_TRANSFORM_NOTE = (
    "数值变换仅用于箱线图展示；物种选择、样本范围和输入丰度不随变换改变。"
)

BOXPLOT_STATISTICAL_METHODS = {
    "detection": "stored abundance > 0",
    "detectionDenominator": "finite values in the selected group and sample scope",
    "zeros": "included in quartiles and detection denominator",
    "missing": "non-finite values excluded; never replaced with zero",
    "sparseMatrix": "absent abundance rows in the revision matrix represent zero",
    "quartiles": "numpy.percentile, method=linear, percentiles=[25, 50, 75]",
    "whiskers": "most extreme observed values within Q1 - 1.5*IQR and Q3 + 1.5*IQR",
    "transforms": "transform each sample first, then recompute quartiles and outliers",
}


def describe_boxplot_group(values: np.ndarray, samples: np.ndarray) -> tuple[dict, dict]:
    """Describe the actual scoped population without treating missing values as zeros.

    Values are in display units. The positive/zero predicates are unchanged by
    the positive percentage multiplier used for relative abundance.
    """
    values = np.asarray(values, dtype=float)
    finite = np.isfinite(values)
    valid = values[finite]
    detected = int(np.count_nonzero(valid > 0))
    counts = {
        "sampleCount": int(len(values)),
        "validCount": int(len(valid)),
        "missingCount": int(len(values) - len(valid)),
        "detectedCount": detected,
        "zeroCount": int(np.count_nonzero(valid == 0)),
        "detectionRate": detected / len(valid) if len(valid) else None,
    }
    summaries: dict[str, dict[str, Any]] = {
        "raw": _box_summary(values, samples),
        "sqrt": _box_summary(_sqrt_abundance(values), samples),
        "log": _box_summary(_log10_abundance(values), samples),
    }
    for summary in summaries.values():
        if not len(valid):
            summary["box"] = None
    return counts, summaries


def boxplot_display(abundance_scale: str) -> tuple[float, dict]:
    """Keep storage fractional while displaying relative abundances as percent."""
    if abundance_scale == "relative_abundance":
        return 100.0, {
            "valueTransforms": [
                {"key": "raw", "label": "相对丰度（%）", "formula": "100 × x"},
                {"key": "sqrt", "label": "sqrt(丰度 %)", "formula": "sqrt(100 × x)"},
                {"key": "log", "label": "log10(丰度 % + 1)", "formula": "log10(100 × x + 1)"},
            ],
            "defaultValueTransform": "raw",
            "valueTransformNote": "存储与分析使用 0–1 比例；本图先换算为百分数，再应用所选展示变换。",
        }
    return 1.0, {
        "valueTransforms": [dict(item) for item in BOXPLOT_VALUE_TRANSFORMS],
        "defaultValueTransform": BOXPLOT_DEFAULT_VALUE_TRANSFORM,
        "valueTransformNote": BOXPLOT_VALUE_TRANSFORM_NOTE,
    }


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
    q1, median, q3 = np.percentile(values, [25, 50, 75], method="linear")
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


def _sqrt_abundance(values: np.ndarray) -> np.ndarray:
    """把非负输入值转换为平方根尺度，用于温和压缩数值跨度。"""

    return np.sqrt(np.clip(values, 0, None))


def compute_boxplot(df: pd.DataFrame, species_cols: list[str], top_n: int = 30) -> dict:
    """为 Top N 特征生成 AD/NC 箱线图 payload。

    Top N 复用 `compute_species` 的总体丰度排序，确保箱线图和丰度柱状图
    展示的候选特征选择逻辑一致。
    """

    ranked = compute_species(df, species_cols, top_n=top_n)
    display_scale, display = boxplot_display(df.attrs.get("abundance_scale", "unknown"))
    ad, nc = group_frames(df, species_cols)

    # 样本名和丰度值一起传入 `_box_summary`，这样离群点能追踪回具体样本。
    ad_samples = df.loc[df["Group"] == AD, "Sample"].astype(str).to_numpy()
    nc_samples = df.loc[df["Group"] == NC, "Sample"].astype(str).to_numpy()
    items = []
    for item in ranked:
        col = item["fullName"]
        # 每个特征分别计算 AD/NC 原始丰度和 log 丰度的箱线图统计值。
        ad_values = ad[col].to_numpy(dtype=float) * display_scale
        nc_values = nc[col].to_numpy(dtype=float) * display_scale
        ad_stats, ad_summaries = describe_boxplot_group(ad_values, ad_samples)
        nc_stats, nc_summaries = describe_boxplot_group(nc_values, nc_samples)
        ad_summary, nc_summary = ad_summaries["raw"], nc_summaries["raw"]
        ad_sqrt_summary, nc_sqrt_summary = ad_summaries["sqrt"], nc_summaries["sqrt"]
        ad_log_summary, nc_log_summary = ad_summaries["log"], nc_summaries["log"]
        items.append(
            {
                "fullName": col,
                "shortName": short_name(col),
                "total": item["total"],
                "groupStats": {"AD": ad_stats, "NC": nc_stats},
                "adBox": ad_summary["box"],
                "ncBox": nc_summary["box"],
                "adOutliers": ad_summary["outliers"],
                "ncOutliers": nc_summary["outliers"],
                "adOutlierPoints": ad_summary["outlierPoints"],
                "ncOutlierPoints": nc_summary["outlierPoints"],
                "adSqrtBox": ad_sqrt_summary["box"],
                "ncSqrtBox": nc_sqrt_summary["box"],
                "adSqrtOutliers": ad_sqrt_summary["outliers"],
                "ncSqrtOutliers": nc_sqrt_summary["outliers"],
                "adSqrtOutlierPoints": ad_sqrt_summary["outlierPoints"],
                "ncSqrtOutlierPoints": nc_sqrt_summary["outlierPoints"],
                "adLogBox": ad_log_summary["box"],
                "ncLogBox": nc_log_summary["box"],
                "adLogOutliers": ad_log_summary["outliers"],
                "ncLogOutliers": nc_log_summary["outliers"],
                "adLogOutlierPoints": ad_log_summary["outlierPoints"],
                "ncLogOutlierPoints": nc_log_summary["outlierPoints"],
            }
        )
    return {
        "items": items,
        "statisticalMethods": BOXPLOT_STATISTICAL_METHODS,
        **display,
    }
