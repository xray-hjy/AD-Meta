"""PCA 和 PCoA 排序图数据计算。

这两个图都把高维特征矩阵降到二维，给前端散点图使用：
- PCA 使用标准化后的 Top N 特征矩阵。
- PCoA 使用 Bray-Curtis 距离矩阵，并在分组条件满足时计算 PERMANOVA
  与 PERMDISP。
"""

from __future__ import annotations

import hashlib
import math

import numpy as np
import pandas as pd
from scipy.spatial.distance import pdist, squareform
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from app.compute.common import FEATURE_META


PCOA_FILTER_PRESETS = {
    "unfiltered": {"minimumRelativeAbundance": 0.0, "minimumPrevalence": 0.0},
    "inclusive": {"minimumRelativeAbundance": 0.00001, "minimumPrevalence": 0.05},
    "standard": {"minimumRelativeAbundance": 0.0001, "minimumPrevalence": 0.10},
    "robust": {"minimumRelativeAbundance": 0.0005, "minimumPrevalence": 0.20},
}
PCOA_DISTANCE = "bray_curtis"
PCOA_PERMUTATIONS = 999
PCOA_PERMANOVA_SEED = 20240514
PCOA_PERMDISP_SEED = 20240515


def _distribution_ellipses(points: list[dict]) -> list[dict]:
    """按分组生成覆盖二维样本分布的 95% 椭圆折线点。

    该椭圆由样本坐标协方差估计，表示组内数据分布，不是均值置信区间。
    前端不再重新计算椭圆，只负责画 `points` 数组。样本数不足 3 或
    协方差不可计算时跳过该组。
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
        ellipses.append({
            "group": group,
            "points": ellipse_points,
            "type": "group_data_distribution_95",
            "label": "95% 数据分布椭圆",
            "sampleCount": int(group_points.shape[0]),
        })
    return ellipses


def compute_pca(df: pd.DataFrame, species_cols: list[str], top_n: int = 50) -> dict:
    """计算 PCA 散点图 payload。

    先按总丰度选择 Top N 特征，再做标准化和二维 PCA。返回每个样本的二维
    坐标、主成分解释方差以及按分组估计的 95% 数据分布椭圆。
    """

    ranked = df[species_cols].sum(axis=0).sort_values(ascending=False).head(top_n).index.tolist()
    if len(ranked) < 2:
        return {
            "method": "PCA",
            "featureCount": len(ranked),
            "speciesCount": len(ranked),
            "variance": [],
            "points": [],
            "ellipses": [],
            "featureSelection": {
                "method": "top_n_by_total_abundance",
                "requestedTopN": top_n,
                "selectedCount": len(ranked),
            },
            "preprocessing": {
                "transformation": "none",
                "scaling": "z_score_per_feature",
            },
        }

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
        "ellipses": _distribution_ellipses(points),
        "featureSelection": {
            "method": "top_n_by_total_abundance",
            "requestedTopN": top_n,
            "selectedCount": len(ranked),
        },
        "preprocessing": {
            "transformation": "none",
            "scaling": "z_score_per_feature",
        },
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


def _permdisp(
    coordinates: np.ndarray,
    groups: np.ndarray,
    n_perm: int = 999,
    seed: int = 20240515,
) -> dict:
    """Test homogeneity of multivariate dispersion in PCoA space.

    Distances from each sample to its group centroid are compared with a
    one-way pseudo-F statistic.  Label permutations provide a reproducible
    p-value.  Coordinates include every positive PCoA axis, rather than only
    the two axes displayed by the browser.
    """

    unique = np.unique(groups)
    n = len(groups)
    if n < 4 or len(unique) < 2 or coordinates.shape[1] == 0:
        return {"pValue": 1.0, "fStat": 0.0, "nPerm": n_perm}

    def calc(labels: np.ndarray) -> float:
        distances = np.zeros(n, dtype=float)
        for group in np.unique(labels):
            idx = np.where(labels == group)[0]
            centroid = coordinates[idx].mean(axis=0)
            distances[idx] = np.linalg.norm(coordinates[idx] - centroid, axis=1)

        overall = distances.mean()
        ss_between = 0.0
        ss_within = 0.0
        for group in np.unique(labels):
            idx = np.where(labels == group)[0]
            group_mean = distances[idx].mean()
            ss_between += idx.size * float((group_mean - overall) ** 2)
            ss_within += float(np.square(distances[idx] - group_mean).sum())

        df_between = len(np.unique(labels)) - 1
        df_within = n - len(np.unique(labels))
        if df_between <= 0 or df_within <= 0 or ss_within <= 1e-12:
            return 0.0
        return float((ss_between / df_between) / (ss_within / df_within))

    observed = calc(groups)
    rng = np.random.default_rng(seed)
    exceedances = sum(
        calc(rng.permutation(groups)) >= observed for _ in range(n_perm)
    )
    return {
        "pValue": (exceedances + 1) / (n_perm + 1),
        "fStat": observed,
        "nPerm": n_perm,
        "method": "distance_to_group_centroid_in_positive_pcoa_space",
    }


def prepare_pcoa_input(
    df: pd.DataFrame,
    feature_cols: list[str],
    filter_preset: str = "standard",
) -> dict:
    """Validate, close and filter a feature matrix for Bray-Curtis PCoA.

    Filtering is label-blind: group labels never participate in feature
    retention. The returned audit rows are shared by the projection and audit
    endpoint so both surfaces describe exactly the same scientific decision.
    """

    if filter_preset not in PCOA_FILTER_PRESETS:
        raise ValueError(f"Unsupported PCoA filter preset: {filter_preset}")
    thresholds = PCOA_FILTER_PRESETS[filter_preset]
    raw = df[feature_cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)
    if not np.isfinite(raw).all():
        raise ValueError("PCoA abundance matrix contains non-finite values")
    if bool((raw < 0).any()):
        raise ValueError("PCoA abundance matrix contains negative values")

    totals = raw.sum(axis=1)
    valid_mask = totals > 0
    valid_raw = raw[valid_mask]
    valid_totals = totals[valid_mask]
    relative = valid_raw / valid_totals[:, None] if len(valid_raw) else valid_raw
    minimum_abundance = float(thresholds["minimumRelativeAbundance"])
    minimum_prevalence = float(thresholds["minimumPrevalence"])
    if relative.shape[0]:
        detected = relative >= minimum_abundance if minimum_abundance > 0 else relative > 0
        prevalence = detected.mean(axis=0)
        means = relative.mean(axis=0)
        maxima = relative.max(axis=0)
        detected_counts = detected.sum(axis=0)
    else:
        prevalence = np.zeros(len(feature_cols), dtype=float)
        means = np.zeros(len(feature_cols), dtype=float)
        maxima = np.zeros(len(feature_cols), dtype=float)
        detected_counts = np.zeros(len(feature_cols), dtype=int)

    retained_mask = (
        np.ones(len(feature_cols), dtype=bool)
        if filter_preset == "unfiltered"
        else prevalence >= minimum_prevalence
    )
    retained = [
        feature
        for feature, keep in zip(feature_cols, retained_mask, strict=False)
        if keep
    ]
    audit_rows = []
    for index, feature in enumerate(feature_cols):
        if retained_mask[index]:
            reason = (
                "retained_unfiltered"
                if filter_preset == "unfiltered"
                else "meets_ordination_filter"
            )
            status = "displayed"
        elif maxima[index] < minimum_abundance:
            reason = "below_minimum_relative_abundance"
            status = "filtered"
        else:
            reason = "below_minimum_prevalence"
            status = "filtered"
        audit_rows.append({
            "feature": str(feature),
            "fullName": str(feature),
            "_featureKeys": [str(feature)],
            "detectionSampleCount": int(detected_counts[index]),
            "prevalence": float(prevalence[index]),
            "meanRelativeAbundance": float(means[index]),
            "maxRelativeAbundance": float(maxima[index]),
            "status": status,
            "reason": reason,
        })
    audit_rows.sort(key=lambda row: (-row["meanRelativeAbundance"], row["feature"]))
    for rank, row in enumerate(audit_rows, start=1):
        row["rank"] = rank

    retained_relative = relative[:, retained_mask]
    retained_mass = (
        retained_relative.sum(axis=1)
        if retained_relative.shape[1]
        else np.zeros(relative.shape[0])
    )
    closed = np.zeros_like(retained_relative)
    positive_mass = retained_mass > 0
    if retained_relative.shape[1] and positive_mass.any():
        closed[positive_mass] = (
            retained_relative[positive_mass] / retained_mass[positive_mass, None]
        )
    valid_indices = np.flatnonzero(valid_mask)
    usable_indices = valid_indices[positive_mass]
    excluded_zero_total = [
        str(df.iloc[index]["Sample"]) for index in np.flatnonzero(~valid_mask)
    ]
    excluded_after_filter = [
        str(df.iloc[index]["Sample"]) for index in valid_indices[~positive_mass]
    ]

    return {
        "matrix": closed[positive_mass],
        "rowIndices": usable_indices,
        "retainedFeatures": retained,
        "auditRows": audit_rows,
        "filter": {
            "method": "label_blind_relative_abundance_and_prevalence",
            "preset": filter_preset,
            "minimumRelativeAbundance": minimum_abundance,
            "minimumPrevalence": minimum_prevalence,
            "sourceFeatureCount": len(feature_cols),
            "selectedCount": len(retained),
            "excludedCount": len(feature_cols) - len(retained),
            "retainedMass": {
                "minimum": float(retained_mass.min()) if len(retained_mass) else 0.0,
                "mean": float(retained_mass.mean()) if len(retained_mass) else 0.0,
                "maximum": float(retained_mass.max()) if len(retained_mass) else 0.0,
            },
            "labelIndependent": True,
        },
        "sampleFiltering": {
            "sourceSampleCount": len(df),
            "selectedSampleCount": int(len(usable_indices)),
            "zeroTotalSampleCount": len(excluded_zero_total),
            "zeroAfterFilterSampleCount": len(excluded_after_filter),
            "excludedZeroTotalSamples": excluded_zero_total,
            "excludedZeroAfterFilterSamples": excluded_after_filter,
        },
    }


def _empty_pcoa_payload(
    df: pd.DataFrame,
    prepared: dict,
    status: str,
    inference_minimum_per_group: int,
    include_audit: bool = False,
) -> dict:
    selection = prepared["filter"]
    return {
        "method": "PCoA",
        "distance": "Bray-Curtis",
        "distanceFingerprint": None,
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "featureCount": selection["selectedCount"],
        "speciesCount": selection["selectedCount"],
        "variance": [],
        "points": [],
        "ellipses": [],
        "permanova": None,
        "permanovaStatus": status,
        "permdisp": None,
        "permdispStatus": status,
        "inferenceMinimumPerGroup": inference_minimum_per_group,
        "featureSelection": selection,
        "sampleFiltering": prepared["sampleFiltering"],
        "preprocessing": {
            "fullMatrixClosure": "total_sum_scaling_per_sample",
            "postFilterClosure": "total_sum_scaling_per_sample",
            "distance": PCOA_DISTANCE,
            "inputScale": df.attrs.get("abundance_scale", "unknown"),
            "sourceNormalization": df.attrs.get("normalization", "unknown"),
        },
        "inferenceContext": {
            "mode": "exploratory_unadjusted",
            "formalEligible": False,
            "stratifiedPermutations": False,
            "covariates": [],
            "inputScaleVerified": df.attrs.get("abundance_scale", "unknown") != "unknown",
            "interpretation": (
                "Exploratory cohort separation without study-stratified "
                "permutations or covariate adjustment."
            ),
        },
        **({"_auditRows": prepared["auditRows"]} if include_audit else {}),
    }


def compute_pcoa(
    df: pd.DataFrame,
    species_cols: list[str],
    filter_preset: str = "standard",
    inference_min_per_group: int = 3,
    include_audit: bool = False,
) -> dict:
    """Compute a reproducible Bray-Curtis PCoA from a documented filter preset."""

    prepared = prepare_pcoa_input(df, species_cols, filter_preset)
    ranked = prepared["retainedFeatures"]
    X = prepared["matrix"]
    if len(ranked) < 2 or len(X) < 3:
        return _empty_pcoa_payload(
            df,
            prepared,
            "not_applicable_insufficient_data",
            inference_min_per_group,
            include_audit,
        )

    distance = squareform(pdist(X, metric="braycurtis"))
    if not np.isfinite(distance).all():
        raise ValueError("Bray-Curtis distance matrix contains non-finite values")
    distance_fingerprint = hashlib.sha256(
        np.ascontiguousarray(distance, dtype="<f8").tobytes()
    ).hexdigest()

    # 经典 PCoA：对平方距离矩阵做双中心化，再做特征分解。
    n = distance.shape[0]
    d2 = distance * distance
    identity = np.eye(n)
    ones = np.ones((n, n)) / n
    centered = -0.5 * (identity - ones) @ d2 @ (identity - ones)
    all_values, all_vectors = np.linalg.eigh(centered)
    order = all_values.argsort()[::-1]
    all_values = all_values[order]
    all_vectors = all_vectors[:, order]
    negative_values = all_values[all_values < -1e-10]
    positive = all_values > 1e-10
    values = all_values[positive]
    vectors = all_vectors[:, positive]

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
        for i, (sample, group) in enumerate(zip(
            df.iloc[prepared["rowIndices"]]["Sample"],
            df.iloc[prepared["rowIndices"]]["Group"],
            strict=False,
        ))
    ]
    selected_df = df.iloc[prepared["rowIndices"]]
    group_counts = selected_df["Group"].astype(str).value_counts().to_dict()
    inference_eligible = (
        len(group_counts) == 2
        and all(count >= inference_min_per_group for count in group_counts.values())
    )
    if inference_eligible:
        groups = selected_df["Group"].astype(str).to_numpy()
        permanova = _permanova(
            distance,
            groups,
            PCOA_PERMUTATIONS,
            PCOA_PERMANOVA_SEED,
        )
        permdisp = _permdisp(
            vectors * np.sqrt(values),
            groups,
            PCOA_PERMUTATIONS,
            PCOA_PERMDISP_SEED,
        )
        permanova["distanceFingerprint"] = distance_fingerprint
        permdisp["distanceFingerprint"] = distance_fingerprint
        permanova_status = "computed_exploratory_unadjusted"
        permdisp_status = "computed_exploratory_unadjusted"
    elif len(group_counts) < 2:
        permanova = None
        permdisp = None
        permanova_status = "not_applicable_single_group"
        permdisp_status = "not_applicable_single_group"
    else:
        permanova = None
        permdisp = None
        permanova_status = "not_applicable_minimum_group_size"
        permdisp_status = "not_applicable_minimum_group_size"

    return {
        "method": "PCoA",
        "distance": "Bray-Curtis",
        "distanceFingerprint": distance_fingerprint,
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "featureCount": len(ranked),
        "speciesCount": len(ranked),
        "variance": variance,
        "points": points,
        "ellipses": _distribution_ellipses(points),
        "permanova": permanova,
        "permanovaStatus": permanova_status,
        "permdisp": permdisp,
        "permdispStatus": permdisp_status,
        "inferenceMinimumPerGroup": inference_min_per_group,
        "featureSelection": prepared["filter"],
        "sampleFiltering": prepared["sampleFiltering"],
        "preprocessing": {
            "fullMatrixClosure": "total_sum_scaling_per_sample",
            "postFilterClosure": "total_sum_scaling_per_sample",
            "distance": PCOA_DISTANCE,
            "inputScale": df.attrs.get("abundance_scale", "unknown"),
            "sourceNormalization": df.attrs.get("normalization", "unknown"),
        },
        "inferenceContext": {
            "mode": "exploratory_unadjusted",
            "formalEligible": False,
            "stratifiedPermutations": False,
            "covariates": [],
            "inputScaleVerified": df.attrs.get("abundance_scale", "unknown") != "unknown",
            "interpretation": (
                "Exploratory cohort separation without study-stratified "
                "permutations or covariate adjustment."
            ),
        },
        "eigenDiagnostics": {
            "negativeEigenvalueCount": int(len(negative_values)),
            "negativeEigenvalueAbsoluteSum": float(np.abs(negative_values).sum()),
            "positiveEigenvalueSum": float(values.sum()),
            "varianceBasis": "positive_eigenvalues",
        },
        **({"_auditRows": prepared["auditRows"]} if include_audit else {}),
    }
