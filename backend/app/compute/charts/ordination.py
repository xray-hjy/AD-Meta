"""PCA 和 PCoA 排序图数据计算。

这两个图都把高维特征矩阵降到二维，给前端散点图使用：
- PCA 使用组成数据闭合、零值替换和 CLR 变换后的 Top N 特征矩阵。
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
PCA_MAX_COMPONENTS = 20
PCOA_NEGATIVE_EIGEN_WARNING_RATIO = 0.01
PCA_FEATURE_SELECTION_METHOD = "top_n_by_mean_relative_abundance_after_sample_closure"


def _numeric_abundance_matrix(
    df: pd.DataFrame,
    feature_cols: list[str],
    context: str,
) -> np.ndarray:
    """Convert a validated abundance block without a Python call per column."""

    try:
        raw = df.loc[:, feature_cols].to_numpy(dtype=float, copy=False)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{context} abundance matrix contains non-numeric values") from exc
    if not np.isfinite(raw).all():
        raise ValueError(f"{context} abundance matrix contains non-finite values")
    if bool((raw < 0).any()):
        raise ValueError(f"{context} abundance matrix contains negative values")
    return raw


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


def _validate_and_close(df: pd.DataFrame, feature_cols: list[str], context: str) -> tuple[np.ndarray, np.ndarray]:
    """Return non-empty sample compositions and the matching source row indices."""

    raw = _numeric_abundance_matrix(df, feature_cols, context)
    totals = raw.sum(axis=1)
    valid = totals > 0
    return raw[valid] / totals[valid, None], np.flatnonzero(valid)


def _multiplicative_zero_replacement(composition: np.ndarray) -> tuple[np.ndarray, int]:
    """Replace structural zeros while retaining each row's total of one.

    The replacement is deliberately tied to the smallest observed part in a
    sample rather than to the original library size, so it is invariant to a
    sample-wise multiplication of the abundance matrix.
    """

    result = composition.copy()
    replaced = 0
    for row in result:
        zero = row <= 0
        zero_count = int(zero.sum())
        if not zero_count:
            continue
        positive = row[~zero]
        if len(positive) == 0:
            continue
        delta = min(float(positive.min()) * 0.65, 0.5 / zero_count)
        row[zero] = delta
        row[~zero] *= (1 - zero_count * delta)
        replaced += zero_count
    return result, replaced


def _canonicalize_component_signs(coords: np.ndarray, components: np.ndarray) -> None:
    """Make PCA signs reproducible across otherwise equivalent SVD solutions."""

    for index, component in enumerate(components):
        pivot = int(np.argmax(np.abs(component)))
        if component[pivot] < 0:
            component *= -1
            coords[:, index] *= -1


def prepare_pca_input(
    df: pd.DataFrame,
    species_cols: list[str],
    top_n: int = 50,
    include_audit: bool = False,
) -> dict:
    """Close, rank and select a PCA subcomposition without running the SVD."""

    relative, source_rows = _validate_and_close(df, species_cols, "PCA")
    mean_relative = relative.mean(axis=0) if len(relative) else np.zeros(len(species_cols))
    order = np.lexsort((np.asarray(species_cols, dtype=str), -mean_relative))
    selected_indices = order[:min(top_n, len(species_cols))]
    selected_set = set(selected_indices.tolist())
    rank_by_index = {int(feature_index): rank + 1 for rank, feature_index in enumerate(order)}
    audit_rows = []
    if include_audit:
        audit_rows = [
            {
                "feature": str(feature),
                "fullName": str(feature),
                "_featureKeys": [str(feature)],
                "rank": rank_by_index[index],
                "meanRelativeAbundance": float(mean_relative[index]),
                "rankValue": float(mean_relative[index]),
                "status": "displayed" if index in selected_set else "excluded",
                "reason": (
                    "within_top_n_by_mean_relative_abundance"
                    if index in selected_set
                    else "outside_top_n_by_mean_relative_abundance"
                ),
            }
            for index, feature in enumerate(species_cols)
        ]
        audit_rows.sort(key=lambda row: row["rank"])
    return {
        "relative": relative,
        "sourceRows": source_rows,
        "meanRelativeAbundance": mean_relative,
        "selectedIndices": selected_indices,
        "selectedFeatures": [species_cols[index] for index in selected_indices],
        "auditRows": audit_rows,
    }


def _empty_pca_payload(
    df: pd.DataFrame,
    prepared: dict,
    top_n: int,
    status: str,
    zero_total_samples: list[str],
    zero_after_selection: int,
    include_audit: bool,
) -> dict:
    ranked = prepared["selectedFeatures"]
    source_rows = prepared["sourceRows"]
    return {
        "method": "PCA",
        "projectionStatus": status,
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "featureCount": len(ranked),
        "speciesCount": len(ranked),
        "variance": [],
        "points": [],
        "ellipses": [],
        "featureSelection": {
            "method": PCA_FEATURE_SELECTION_METHOD,
            "requestedTopN": top_n,
            "selectedCount": len(ranked),
        },
        "sampleFiltering": {
            "sourceSampleCount": len(df),
            "selectedSampleCount": 0,
            "validTotalSampleCount": int(len(source_rows)),
            "zeroTotalSampleCount": len(zero_total_samples),
            "excludedZeroTotalSamples": zero_total_samples,
            "zeroAfterFeatureSelectionSampleCount": zero_after_selection,
        },
        "preprocessing": {
            "fullMatrixClosure": "total_sum_scaling_per_sample",
            "postSelectionClosure": "total_sum_scaling_per_sample",
            "transformation": "clr",
            "zeroReplacement": "multiplicative_smallest_positive_part",
        },
        "resources": {
            "componentSummary": [],
            "featureLoadings": [],
            "selectionAudit": [],
        },
        **({"_auditRows": prepared["auditRows"]} if include_audit else {}),
    }


def compute_pca(
    df: pd.DataFrame,
    species_cols: list[str],
    top_n: int = 50,
    include_audit: bool = False,
) -> dict:
    """Compute a scale-invariant, composition-aware exploratory PCA.

    Feature selection is based on mean sample-relative abundance.  The selected
    subcomposition is re-closed, zeros receive a documented multiplicative
    replacement, then CLR coordinates are decomposed by a deterministic full
    SVD.  This removes sequencing-depth dominance from the ordination while
    keeping the original IDs available for inspection.
    """

    prepared = prepare_pca_input(df, species_cols, top_n, include_audit)
    relative = prepared["relative"]
    source_rows = prepared["sourceRows"]
    mean_relative = prepared["meanRelativeAbundance"]
    selected_indices = prepared["selectedIndices"]
    ranked = prepared["selectedFeatures"]
    zero_total_samples = [str(df.iloc[index]["Sample"]) for index in np.flatnonzero(~np.isin(np.arange(len(df)), source_rows))]
    if len(ranked) < 2 or len(relative) < 2:
        return _empty_pca_payload(
            df, prepared, top_n, "not_applicable_insufficient_data",
            zero_total_samples, 0, include_audit,
        )

    selected_relative = relative[:, selected_indices]
    selected_mass = selected_relative.sum(axis=1)
    usable = selected_mass > 0
    usable_count = int(usable.sum())
    if usable_count < 2:
        return _empty_pca_payload(
            df, prepared, top_n,
            "not_applicable_insufficient_samples_after_feature_selection",
            zero_total_samples, int((~usable).sum()), include_audit,
        )
    composition = selected_relative[usable] / selected_mass[usable, None]
    replaced, replaced_cells = _multiplicative_zero_replacement(composition)
    clr = np.log(replaced) - np.log(replaced).mean(axis=1, keepdims=True)
    n_components = min(PCA_MAX_COMPONENTS, clr.shape[0], clr.shape[1])
    model = PCA(n_components=n_components, svd_solver="full")
    coords = model.fit_transform(clr)
    _canonicalize_component_signs(coords, model.components_)
    active_rows = source_rows[usable]
    points = [
        {
            "sample": str(sample),
            "group": str(group),
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1]),
        }
        for i, (sample, group) in enumerate(zip(df.iloc[active_rows]["Sample"], df.iloc[active_rows]["Group"], strict=False))
    ]
    return {
        "method": "PCA",
        "projectionStatus": "computed",
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "featureCount": len(ranked),
        "speciesCount": len(ranked),
        "variance": model.explained_variance_ratio_.tolist(),
        "points": points,
        "ellipses": _distribution_ellipses(points),
        "featureSelection": {
            "method": PCA_FEATURE_SELECTION_METHOD,
            "requestedTopN": top_n,
            "selectedCount": len(ranked),
        },
        "sampleFiltering": {
            "sourceSampleCount": len(df), "selectedSampleCount": int(len(active_rows)),
            "zeroTotalSampleCount": len(zero_total_samples), "excludedZeroTotalSamples": zero_total_samples,
            "zeroAfterFeatureSelectionSampleCount": int((~usable).sum()),
        },
        "preprocessing": {
            "fullMatrixClosure": "total_sum_scaling_per_sample",
            "postSelectionClosure": "total_sum_scaling_per_sample",
            "transformation": "clr",
            "zeroReplacement": "multiplicative_smallest_positive_part",
            "zeroReplacedCellCount": int(replaced_cells),
            "inputScale": df.attrs.get("abundance_scale", "unknown"),
            "sourceNormalization": df.attrs.get("normalization", "unknown"),
        },
        "resources": {
            "componentSummary": [
                {"component": index + 1, "eigenvalue": float(model.explained_variance_[index]), "explainedVarianceRatio": float(model.explained_variance_ratio_[index]), "cumulativeExplainedVarianceRatio": float(model.explained_variance_ratio_[:index + 1].sum())}
                for index in range(n_components)
            ],
            "featureLoadings": [
                {"feature": str(feature), "selectionRank": rank + 1, "meanRelativeAbundance": float(mean_relative[selected_indices[rank]]), "pc1Loading": float(model.components_[0, rank]), "pc2Loading": float(model.components_[1, rank]) if n_components > 1 else 0.0}
                for rank, feature in enumerate(ranked)
            ],
            "selectionAudit": [
                {"feature": str(feature), "rank": rank + 1, "meanRelativeAbundance": float(mean_relative[selected_indices[rank]])}
                for rank, feature in enumerate(ranked)
            ],
        },
        **({"_auditRows": prepared["auditRows"]} if include_audit else {}),
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


def _permdisp_distances(
    positive_coordinates: np.ndarray,
    negative_coordinates: np.ndarray,
    groups: np.ndarray,
) -> tuple[np.ndarray, int]:
    """Distances to group centroids, correcting Euclidean axes by imaginary axes."""

    distances = np.zeros(len(groups), dtype=float)
    clipped = 0
    for group in np.unique(groups):
        idx = np.where(groups == group)[0]
        positive_delta = positive_coordinates[idx] - positive_coordinates[idx].mean(axis=0)
        positive_sq = np.square(positive_delta).sum(axis=1)
        if negative_coordinates.shape[1]:
            negative_delta = negative_coordinates[idx] - negative_coordinates[idx].mean(axis=0)
            negative_sq = np.square(negative_delta).sum(axis=1)
        else:
            negative_sq = np.zeros(len(idx))
        squared = positive_sq - negative_sq
        clipped += int((squared < 0).sum())
        distances[idx] = np.sqrt(np.maximum(squared, 0))
    return distances, clipped


def _permdisp(
    positive_coordinates: np.ndarray,
    negative_coordinates: np.ndarray,
    groups: np.ndarray,
    n_perm: int = 999,
    seed: int = 20240515,
) -> dict:
    """Test homogeneity of multivariate dispersion in PCoA space.

    Distances from each sample to its group centroid are compared with a
    one-way pseudo-F statistic. Label permutations provide a reproducible
    p-value. Negative PCoA axes are subtracted from squared centroid distances
    before the square root, matching the correction used by PERMDISP2.
    """

    unique = np.unique(groups)
    n = len(groups)
    method = "permdisp2_group_centroid_with_negative_axis_correction"
    formula = "sqrt(max(positive_squared_distance - negative_squared_distance, 0))"
    if n < 4 or len(unique) < 2 or positive_coordinates.shape[1] == 0:
        return {
            "pValue": None,
            "fStat": None,
            "nPerm": 0,
            "requestedPermutations": n_perm,
            "method": method,
            "distanceFormula": formula,
            "negativeAxisCorrection": True,
            "interpretable": False,
            "status": "not_interpretable_insufficient_pcoa_geometry",
        }

    def calc(labels: np.ndarray) -> float | None:
        distances, _ = _permdisp_distances(positive_coordinates, negative_coordinates, labels)

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
            return None
        return float((ss_between / df_between) / (ss_within / df_within))

    observed_distances, clipped_count = _permdisp_distances(
        positive_coordinates, negative_coordinates, groups,
    )
    observed = calc(groups)
    if observed is None:
        return {
            "pValue": None,
            "fStat": None,
            "nPerm": 0,
            "requestedPermutations": n_perm,
            "method": method,
            "distanceFormula": formula,
            "negativeAxisCorrection": True,
            "clippedDistanceCount": clipped_count,
            "clippedDistanceFraction": clipped_count / n if n else 0.0,
            "interpretable": False,
            "status": "not_interpretable_degenerate_dispersion",
        }
    rng = np.random.default_rng(seed)
    exceedances = 0
    valid_permutations = 0
    for _ in range(n_perm):
        permuted = calc(rng.permutation(groups))
        if permuted is None:
            continue
        valid_permutations += 1
        if permuted >= observed:
            exceedances += 1
    if valid_permutations != n_perm:
        return {
            "pValue": None,
            "fStat": observed,
            "nPerm": valid_permutations,
            "requestedPermutations": n_perm,
            "invalidPermutationCount": n_perm - valid_permutations,
            "method": method,
            "distanceFormula": formula,
            "negativeAxisCorrection": True,
            "clippedDistanceCount": clipped_count,
            "clippedDistanceFraction": clipped_count / n if n else 0.0,
            "interpretable": False,
            "status": "not_interpretable_degenerate_permutations",
        }
    return {
        "pValue": (exceedances + 1) / (valid_permutations + 1),
        "fStat": observed,
        "nPerm": valid_permutations,
        "requestedPermutations": n_perm,
        "invalidPermutationCount": n_perm - valid_permutations,
        "method": method,
        "distanceFormula": formula,
        "negativeAxisCorrection": True,
        "clippedDistanceCount": clipped_count,
        "clippedDistanceFraction": clipped_count / n if n else 0.0,
        "interpretable": True,
        "status": "computed",
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
    raw = _numeric_abundance_matrix(df, feature_cols, "PCoA")

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
    negative = all_values < -1e-10
    negative_coordinates = all_vectors[:, negative] * np.sqrt(np.abs(all_values[negative]))
    positive_coordinates = vectors * np.sqrt(values)

    coords = np.zeros((n, 2))
    variance = [0.0, 0.0]
    displayed_axis_count = min(2, len(values))
    if displayed_axis_count:
        coords[:, :displayed_axis_count] = (
            vectors[:, :displayed_axis_count] * np.sqrt(values[:displayed_axis_count])
        )
        total = values.sum() or 1.0
        for index, ratio in enumerate(values[:displayed_axis_count] / total):
            variance[index] = float(ratio)

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
    group_labels = selected_df["Group"].astype(str).to_numpy()
    dispersion_distances, clipped_distance_count = _permdisp_distances(
        positive_coordinates, negative_coordinates, group_labels,
    ) if len(values) else (np.zeros(n), 0)
    dispersion_rows = [
        {
            "sample": point["sample"], "group": point["group"],
            "distanceToGroupCentroid": float(dispersion_distances[index]),
            "distanceFingerprint": distance_fingerprint,
            "negativeAxisCorrection": True,
        }
        for index, point in enumerate(points)
    ] if len(values) else []
    inference_eligible = (
        len(group_counts) == 2
        and all(count >= inference_min_per_group for count in group_counts.values())
    )
    if inference_eligible:
        groups = group_labels
        permanova = _permanova(
            distance,
            groups,
            PCOA_PERMUTATIONS,
            PCOA_PERMANOVA_SEED,
        )
        permdisp = (
            _permdisp(
                positive_coordinates,
                negative_coordinates,
                groups,
                PCOA_PERMUTATIONS,
                PCOA_PERMDISP_SEED,
            )
            if len(values)
            else None
        )
        permanova["distanceFingerprint"] = distance_fingerprint
        permanova_status = "computed_exploratory_unadjusted"
        if permdisp is None:
            permdisp_status = "not_applicable_no_positive_pcoa_axes"
        else:
            permdisp["distanceFingerprint"] = distance_fingerprint
            permdisp["clippedDistanceCount"] = clipped_distance_count
            permdisp["clippedDistanceFraction"] = clipped_distance_count / n if n else 0.0
            permdisp_status = (
                "computed_exploratory_unadjusted"
                if permdisp.get("interpretable")
                else str(permdisp.get("status") or "not_interpretable")
            )
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
            "negativeEigenvalueAbsoluteRatio": float(np.abs(negative_values).sum() / values.sum()) if values.sum() else 0.0,
            "largestNegativeEigenvalueAbsoluteRatio": float(np.abs(negative_values).max() / values.max()) if len(negative_values) and len(values) else 0.0,
            "warningThreshold": PCOA_NEGATIVE_EIGEN_WARNING_RATIO,
            "interpretationStatus": (
                "not_interpretable_no_positive_eigenvalues"
                if not len(values)
                else "caution_negative_eigenvalues"
                if len(negative_values)
                and np.abs(negative_values).max() / values.max()
                > PCOA_NEGATIVE_EIGEN_WARNING_RATIO
                else "within_default_tolerance"
            ),
            "varianceBasis": "positive_eigenvalues",
        },
        "resources": {
            "dispersionDistances": dispersion_rows,
            "eigenDiagnostics": [
                {
                    "axis": f"Axis {index + 1}",
                    "eigenvalue": float(value),
                    "sign": "positive",
                    "positiveExplainedVarianceRatio": float(value / values.sum()) if values.sum() else 0.0,
                }
                for index, value in enumerate(values)
            ] + [
                {
                    "axis": f"Negative axis {index + 1}", "eigenvalue": float(value),
                    "sign": "negative", "positiveExplainedVarianceRatio": 0.0,
                }
                for index, value in enumerate(negative_values)
            ],
        },
        **({"_auditRows": prepared["auditRows"]} if include_audit else {}),
    }
