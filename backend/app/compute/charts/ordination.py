"""PCA 和 PCoA 排序图数据计算。

这两个图都把高维特征矩阵降到二维，给前端散点图使用：
- PCA 使用标准化后的 Top N 特征矩阵。
- PCoA 使用 Bray-Curtis 距离矩阵，并额外计算 PERMANOVA。
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.spatial.distance import pdist, squareform
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from app.compute.common import FEATURE_META


def _confidence_ellipses(points: list[dict]) -> list[dict]:
    """按分组生成二维置信椭圆折线点。

    前端不再重新计算椭圆，只负责画 `points` 数组。样本数不足 3 或协方差
    不可计算时跳过该组。
    """

    ellipses = []
    for group in sorted({point["group"] for point in points}):
        group_points = np.array(
            [[point["x"], point["y"]] for point in points if point["group"] == group],
            dtype=float,
        )
        if group_points.shape[0] < 3:
            continue

        # 椭圆方向来自协方差矩阵特征向量，半径使用 95% 二维卡方阈值。
        mean_xy = group_points.mean(axis=0)
        cov = np.cov(group_points.T)
        if not np.isfinite(cov).all():
            continue
        values, vectors = np.linalg.eigh(cov)
        order = values.argsort()[::-1]
        values = np.maximum(values[order], 0)
        vectors = vectors[:, order]
        angle = math.atan2(vectors[1, 0], vectors[0, 0])
        chi2 = 5.991
        radii = np.sqrt(values * chi2)
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)
        ellipse_points = []
        for t in np.linspace(0, 2 * math.pi, 121):
            x = radii[0] * math.cos(t)
            y = radii[1] * math.sin(t)
            ellipse_points.append(
                [
                    float(mean_xy[0] + x * cos_a - y * sin_a),
                    float(mean_xy[1] + x * sin_a + y * cos_a),
                ]
            )
        ellipses.append({"group": group, "points": ellipse_points})
    return ellipses


def compute_pca(df: pd.DataFrame, species_cols: list[str], top_n: int = 50) -> dict:
    """计算 PCA 散点图 payload。

    先按总丰度选择 Top N 特征，再做标准化和二维 PCA。返回每个样本的二维
    坐标、主成分解释方差以及按 AD/NC 分组的置信椭圆。
    """

    ranked = df[species_cols].sum(axis=0).sort_values(ascending=False).head(top_n).index.tolist()
    if len(ranked) < 2:
        return {"method": "PCA", "speciesCount": len(ranked), "variance": [], "points": [], "ellipses": []}

    # PCA 对量纲敏感，所以先对每个特征做标准化。
    X = df[ranked].to_numpy(dtype=float)
    X = StandardScaler().fit_transform(X)
    model = PCA(n_components=2)
    coords = model.fit_transform(X)
    points = [
        {
            "sample": str(sample),
            "group": str(group),
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1]),
        }
        for i, (sample, group) in enumerate(zip(df["Sample"], df["Group"], strict=False))
    ]
    return {
        "method": "PCA",
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "featureCount": len(ranked),
        "speciesCount": len(ranked),
        "variance": model.explained_variance_ratio_.tolist(),
        "points": points,
        "ellipses": _confidence_ellipses(points),
    }


def _permanova(distance: np.ndarray, groups: np.ndarray, n_perm: int = 999, seed: int = 20240514) -> dict:
    """基于距离矩阵做简化 PERMANOVA。

    用组内/组间平方距离估计 F 统计量和 R²，再通过固定随机种子的置换检验
    估计 p 值。固定 seed 可以保证缓存可重复生成。
    """

    n = distance.shape[0]
    d2 = distance * distance
    unique = np.unique(groups)
    if n < 4 or len(unique) < 2:
        return {"r2": 0.0, "pValue": 1.0, "fStat": 0.0, "nPerm": n_perm}

    triu = np.triu_indices(n, 1)
    ss_total = float(d2[triu].sum() / n)

    def calc(labels: np.ndarray) -> tuple[float, float]:
        """给一组标签计算 F statistic 和 R²。"""

        ss_within = 0.0
        for group in np.unique(labels):
            idx = np.where(labels == group)[0]
            if idx.size < 2:
                continue
            sub = d2[np.ix_(idx, idx)]
            ss_within += float(np.triu(sub, 1).sum() / idx.size)
        ss_between = ss_total - ss_within
        df_between = len(np.unique(labels)) - 1
        df_within = n - len(np.unique(labels))
        if ss_total <= 1e-12 or df_between <= 0 or df_within <= 0:
            return 0.0, 0.0
        ms_between = ss_between / df_between
        ms_within = ss_within / df_within
        f_stat = ms_between / ms_within if ms_within > 1e-12 else 0.0
        return float(f_stat), float(ss_between / ss_total)

    obs_f, obs_r2 = calc(groups)
    rng = np.random.default_rng(seed)
    count = 0
    for _ in range(n_perm):
        # 置换组标签，统计随机标签下 F 值大于等于观察值的次数。
        perm = rng.permutation(groups)
        perm_f, _ = calc(perm)
        if perm_f >= obs_f:
            count += 1
    return {
        "r2": obs_r2,
        "pValue": (count + 1) / (n_perm + 1),
        "fStat": obs_f,
        "nPerm": n_perm,
    }


def compute_pcoa(df: pd.DataFrame, species_cols: list[str], top_n: int = 500) -> dict:
    """计算 Bray-Curtis PCoA 散点图 payload。

    PCoA 先把每个样本的 Top N 特征丰度归一化为相对丰度，再计算样本间
    Bray-Curtis 距离，最后通过经典 MDS 方法取前两个主坐标。
    """

    ranked = df[species_cols].sum(axis=0).sort_values(ascending=False).head(top_n).index.tolist()
    if len(ranked) < 2 or len(df) < 3:
        return {
            "method": "PCoA",
            "distance": "Bray-Curtis",
            "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
            "featureCount": len(ranked),
            "speciesCount": len(ranked),
            "variance": [],
            "points": [],
            "ellipses": [],
            "permanova": {"r2": 0.0, "pValue": 1.0, "fStat": 0.0, "nPerm": 999},
        }

    # Bray-Curtis 通常基于相对丰度；空样本行用 1 避免除零。
    X = df[ranked].to_numpy(dtype=float)
    row_sums = X.sum(axis=1, keepdims=True)
    row_sums[row_sums <= 0] = 1
    X = X / row_sums
    distance = squareform(pdist(X, metric="braycurtis"))
    distance = np.nan_to_num(distance, nan=0.0, posinf=0.0, neginf=0.0)

    # 经典 PCoA：对平方距离矩阵做双中心化，再做特征分解。
    n = distance.shape[0]
    d2 = distance * distance
    identity = np.eye(n)
    ones = np.ones((n, n)) / n
    centered = -0.5 * (identity - ones) @ d2 @ (identity - ones)
    values, vectors = np.linalg.eigh(centered)
    order = values.argsort()[::-1]
    values = values[order]
    vectors = vectors[:, order]
    positive = values > 1e-10
    values = values[positive]
    vectors = vectors[:, positive]

    if len(values) < 2:
        coords = np.zeros((n, 2))
        variance = [0.0, 0.0]
    else:
        coords = vectors[:, :2] * np.sqrt(values[:2])
        total = values.sum() or 1.0
        variance = (values[:2] / total).tolist()

    points = [
        {
            "sample": str(sample),
            "group": str(group),
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1]),
        }
        for i, (sample, group) in enumerate(zip(df["Sample"], df["Group"], strict=False))
    ]
    return {
        "method": "PCoA",
        "distance": "Bray-Curtis",
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "featureCount": len(ranked),
        "speciesCount": len(ranked),
        "variance": variance,
        "points": points,
        "ellipses": _confidence_ellipses(points),
        "permanova": _permanova(distance, df["Group"].to_numpy()),
    }
