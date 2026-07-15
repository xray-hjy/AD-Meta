"""差异丰度热图数据计算。

该模块筛选 AD/NC 间差异显著的特征，生成前端热图需要的矩阵、差异统计、
行列聚类顺序和 dendrogram linkage 数据。返回数据必须保持紧凑，不能把
完整原始丰度矩阵暴露给 API。
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import leaves_list, linkage
from scipy.spatial.distance import pdist
from scipy.stats import mannwhitneyu

from app.compute.common import AD, FEATURE_META, NC, group_frames
from app.compute.statistics import benjamini_hochberg, rank_biserial_from_u
from app.compute.taxonomy import short_name


def _hierarchical_cluster(matrix: np.ndarray) -> dict[str, list]:
    """对矩阵行做层次聚类并返回叶子顺序和 SciPy linkage。

    小样本、全相同矩阵或距离不可计算时直接返回原顺序，避免导入流程因为
    聚类边界情况失败。
    """

    n = matrix.shape[0]
    if n <= 1:
        return {"order": list(range(n)), "merges": []}
    distances = pdist(matrix, metric="euclidean")
    if not np.isfinite(distances).all() or np.allclose(distances, 0):
        return {"order": list(range(n)), "merges": []}
    tree = linkage(distances, method="average")
    merges = [
        [int(left), int(right), float(distance), int(count)]
        for left, right, distance, count in tree
    ]
    return {
        "order": leaves_list(tree).astype(int).tolist(),
        "merges": merges,
    }


def _cluster_order(matrix: np.ndarray) -> list[int]:
    """只取层次聚类的行顺序，供 AD/NC 分组矩阵内部排序使用。"""

    return _hierarchical_cluster(matrix)["order"]


def _heatmap_filter(
    max_features: int,
    selected_count: int | None = None,
    significant_count: int | None = None,
) -> dict:
    """记录热图筛选条件，随 payload 返回给前端展示/排查。"""

    payload = {
        "qValueMax": 0.05,
        "pValueMax": 0.05,
        "log2FcMinAbs": 1,
        "topN": max_features,
        "maxFeatures": max_features,
        "multipleTesting": "Benjamini-Hochberg",
    }
    if selected_count is not None:
        payload["selectedCount"] = selected_count
        payload["displayedCount"] = selected_count
    if significant_count is not None:
        payload["significantCount"] = significant_count
    return payload


def compute_heatmap(df: pd.DataFrame, species_cols: list[str], top_n: int = 200) -> dict:
    """计算差异特征热图 payload。

    筛选规则：
    - Mann-Whitney U 检验并用 Benjamini-Hochberg 校正，要求 `q < 0.05`。
    - 组均值 log2 fold-change 绝对值大于 1。
    - 候选项按 `-log10(p) * abs(log2FC)` 排序，最多保留 `top_n` 个。
    """

    ad, nc = group_frames(df, species_cols)
    ad_values = ad.to_numpy(dtype=float)
    nc_values = nc.to_numpy(dtype=float)
    ad_mean = ad_values.mean(axis=0)
    nc_mean = nc_values.mean(axis=0)
    eps = 1e-9
    log2fc = np.log2((ad_mean + eps) / (nc_mean + eps))

    p_values = []
    effect_sizes = []
    for i in range(len(species_cols)):
        # 每个特征独立做两组非参数检验；常数列等异常情况按不显著处理。
        try:
            result = mannwhitneyu(ad_values[:, i], nc_values[:, i], alternative="two-sided")
            p = result.pvalue
            effect = rank_biserial_from_u(
                getattr(result, "statistic", float("nan")),
                len(ad_values),
                len(nc_values),
            )
        except ValueError:
            p = 1.0
            effect = 0.0
        p_values.append(float(p) if np.isfinite(p) else 1.0)
        effect_sizes.append(effect)

    q_values = benjamini_hochberg(p_values)

    # 热图使用 log10(abundance + 1)，减少极端丰度值对颜色范围的影响。
    log_ad = np.log10(ad_values + 1)
    log_nc = np.log10(nc_values + 1)
    ad_mean_log = log_ad.mean(axis=0)
    nc_mean_log = log_nc.mean(axis=0)
    diff_log = ad_mean_log - nc_mean_log

    candidates = []
    for i, col in enumerate(species_cols):
        # 只保留同时满足显著性和效应量阈值的差异特征。
        if q_values[i] < 0.05 and abs(log2fc[i]) > 1:
            candidates.append(
                {
                    "idx": i,
                    "col": col,
                    "fullName": col,
                    "label": short_name(col, max_len=10),
                    "p": p_values[i],
                    "pValue": p_values[i],
                    "qValue": float(q_values[i]),
                    "effectSize": float(effect_sizes[i]),
                    "effectMetric": "rank_biserial_correlation",
                    "log2FC": float(log2fc[i]),
                    "meanAD": float(ad_mean[i]),
                    "meanNC": float(nc_mean[i]),
                    "diffLog": float(diff_log[i]),
                }
            )
    for item in candidates:
        # score 同时考虑显著性和效应量，避免只按 p 值选出变化幅度很小的特征。
        item["score"] = -math.log10(item["qValue"] + 1e-300) * abs(item["log2FC"])

    candidates.sort(key=lambda item: item["score"], reverse=True)
    max_features = max(1, int(top_n))
    stats = candidates[: min(len(candidates), max_features)]

    if not stats:
        # 无候选特征时返回可解释错误 payload，前端显示空状态而不是崩溃。
        feature_label = df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"])
        return {
            "error": f"未筛选到满足 q < 0.05 且 |log2FC| > 1 的差异{feature_label}。",
            "filter": _heatmap_filter(max_features, 0, 0),
            "featureLabel": feature_label,
            "method": "Mann-Whitney U with Benjamini-Hochberg FDR",
            "inferenceLevel": "exploratory_fdr",
            "stats": [],
        }

    # 先分别聚类 AD/NC 矩阵，再基于排序后的合并矩阵生成全样本 dendrogram。
    idx = [item["idx"] for item in stats]
    ad_mat = log_ad[:, idx]
    nc_mat = log_nc[:, idx]
    ad_order = _cluster_order(ad_mat)
    nc_order = _cluster_order(nc_mat)
    all_values = np.concatenate([ad_mat.ravel(), nc_mat.ravel()])
    raw_mat = np.concatenate([ad_mat, nc_mat], axis=0)
    ordered_ad_mat = ad_mat[ad_order, :]
    ordered_nc_mat = nc_mat[nc_order, :]
    combined_cluster = _hierarchical_cluster(np.concatenate([ordered_ad_mat, ordered_nc_mat], axis=0))
    column_cluster = _hierarchical_cluster(raw_mat.T)

    return {
        "method": "Mann-Whitney U with Benjamini-Hochberg FDR",
        "inferenceLevel": "exploratory_fdr",
        "filter": _heatmap_filter(max_features, len(stats), len(candidates)),
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "stats": [{k: v for k, v in item.items() if k != "idx"} for item in stats],
        "colLabels": [item["label"] for item in stats],
        "adMatrix": ordered_ad_mat.tolist(),
        "ncMatrix": ordered_nc_mat.tolist(),
        "adLabels": df.loc[df["Group"] == AD, "Sample"].iloc[ad_order].tolist(),
        "ncLabels": df.loc[df["Group"] == NC, "Sample"].iloc[nc_order].tolist(),
        "diffMatrix": [[item["diffLog"] for item in stats]],
        "diffLabels": ["AD - NC"],
        "maxV": float(np.max(all_values)) if all_values.size else 1.0,
        "maxAbs": float(max(abs(item["diffLog"]) for item in stats)),
        "pairedRows": int(max(ad_mat.shape[0], nc_mat.shape[0])),
        "combinedRowOrder": combined_cluster["order"],
        "colOrder": column_cluster["order"],
        "dendrograms": {
            "metric": "euclidean",
            "linkage": "average",
            "rows": {"merges": combined_cluster["merges"]},
            "columns": {"merges": column_cluster["merges"]},
        },
    }
