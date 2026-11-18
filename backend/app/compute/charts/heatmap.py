"""差异丰度热图数据计算。

该模块筛选 AD/NC 间差异显著的特征，生成前端热图需要的矩阵、差异统计、
行列聚类顺序和 dendrogram linkage 数据。返回数据必须保持紧凑，不能把
完整原始丰度矩阵暴露给 API。
"""

from __future__ import annotations

import hashlib
import json
import math

import numpy as np
import pandas as pd
from scipy import __version__ as scipy_version
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
    merges = [[int(left), int(right), float(distance), int(count)] for left, right, distance, count in tree]
    return {
        "order": leaves_list(tree).astype(int).tolist(),
        "merges": merges,
    }


def _cluster_order(matrix: np.ndarray) -> list[int]:
    """只取层次聚类的行顺序，供 AD/NC 分组矩阵内部排序使用。"""

    return _hierarchical_cluster(matrix)["order"]


def _heatmap_filter(
    max_features: int,
    q_value_max: float = 0.05,
    log2_fc_min_abs: float = 1.0,
    selected_count: int | None = None,
    significant_count: int | None = None,
) -> dict:
    """记录热图筛选条件，随 payload 返回给前端展示/排查。"""

    payload = {
        "qValueMax": q_value_max,
        "log2FcMinAbs": log2_fc_min_abs,
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


def heatmap_analysis_key(df, features, prefilter="none", minimum_prevalence=0.1, detection_threshold=0.0001):
    settings = {
        "version": "heatmap-mwu-bh-v2",
        "scipy": scipy_version,
        "features": features,
        "samples": df[["Sample", "Group"]].astype(str).values.tolist(),
        "scale": df.attrs.get("abundance_scale", "unknown"),
        "prefilter": prefilter,
        "prevalence": minimum_prevalence if prefilter != "none" else 0,
        "threshold": detection_threshold if prefilter == "abundance_prevalence" else 0,
    }
    digest = hashlib.sha256(json.dumps(settings, ensure_ascii=False, sort_keys=True).encode())
    digest.update(df[features].to_numpy(dtype="<f8").tobytes())
    return digest.hexdigest()


def analyze_heatmap(
    df: pd.DataFrame,
    species_cols: list[str],
    *,
    prefilter: str = "none",
    minimum_prevalence: float = 0.1,
    detection_threshold: float = 0.0001,
) -> tuple[dict, list[dict]]:
    """One complete, display-independent MWU/BH record; never use Top N here."""
    if prefilter not in {"none", "prevalence", "abundance_prevalence"}:
        raise ValueError("Unknown heatmap prefilter")
    relative = df.attrs.get("abundance_scale") == "relative_abundance"
    if prefilter == "abundance_prevalence" and not relative:
        raise ValueError("丰度检出预筛需要已声明的相对丰度比例输入")
    ad, nc = group_frames(df, species_cols)
    av, nv = ad.to_numpy(dtype=float), nc.to_numpy(dtype=float)
    values = np.concatenate([av, nv], axis=0)
    if not len(av) or not len(nv):
        raise ValueError("差异分析需要 AD 和 NC 两组样本")
    if not np.isfinite(values).all() or (values < 0).any():
        raise ValueError("热图输入含缺失、非有限或负丰度，不能静默填零")
    threshold = detection_threshold if prefilter == "abundance_prevalence" else 0.0
    prevalence_min = minimum_prevalence if prefilter != "none" else 0.0
    prevalences = (values > threshold).mean(axis=0)
    eligible = prevalences >= prevalence_min
    am, nm = av.mean(axis=0), nv.mean(axis=0)
    eps = 1e-9
    fold = np.log2((am + eps) / (nm + eps))
    rows, p_values, tested_indices = [], [], []
    for i, name in enumerate(species_cols):
        tested = bool(eligible[i])
        p, effect = None, None
        constant = bool(np.ptp(values[:, i]) == 0)
        if tested:
            if constant:
                p, effect = 1.0, 0.0
            else:
                result = mannwhitneyu(av[:, i], nv[:, i], alternative="two-sided", method="auto", use_continuity=True)
                p = float(result.pvalue)
                effect = rank_biserial_from_u(result.statistic, len(av), len(nv))
                if not math.isfinite(p):
                    raise ValueError(f"物种 {name} 的检验返回非有限 p 值")
            p_values.append(p)
            tested_indices.append(i)
        low = float(np.log2((am[i] + eps / 10) / (nm[i] + eps / 10)))
        high = float(np.log2((am[i] + eps * 10) / (nm[i] + eps * 10)))
        rows.append(
            {
                "idx": i,
                "col": name,
                "feature": name,
                "fullName": name,
                "label": short_name(name, max_len=10),
                "tested": tested,
                "inclusionReason": "all_source_features"
                if prefilter == "none"
                else "passes_pooled_prevalence"
                if tested
                else "below_pooled_prevalence",
                "p": p,
                "pValue": p,
                "qValue": None,
                "effectSize": effect,
                "effectMetric": "rank_biserial_correlation",
                "log2FC": float(fold[i]),
                "meanAD": float(am[i]),
                "meanNC": float(nm[i]),
                "medianAD": float(np.median(av[:, i])),
                "medianNC": float(np.median(nv[:, i])),
                "minAD": float(av[:, i].min()),
                "maxAD": float(av[:, i].max()),
                "minNC": float(nv[:, i].min()),
                "maxNC": float(nv[:, i].max()),
                "nAD": len(av),
                "nNC": len(nv),
                "detectedAD": int((av[:, i] > 0).sum()),
                "detectedNC": int((nv[:, i] > 0).sum()),
                "prevalenceAD": float((av[:, i] > 0).mean()),
                "prevalenceNC": float((nv[:, i] > 0).mean()),
                "pooledPrevalence": float(prevalences[i]),
                "detectionThreshold": threshold,
                "meanAbundance": float(values[:, i].mean()),
                "variance": float(values[:, i].var()),
                "constant": constant,
                "allZero": bool((values[:, i] == 0).all()),
                "log2FCAtEps1e10": low,
                "log2FCAtEps1e8": high,
                "epsilonSensitive": bool(abs(low - high) > 0.5),
            }
        )
    adjusted = benjamini_hochberg(p_values)
    for index, q in zip(tested_indices, adjusted, strict=True):
        rows[index]["qValue"] = float(q)
    samples = [
        {"sample": str(row.Sample), "group": str(row.Group)} for row in df[["Sample", "Group"]].itertuples(index=False)
    ]
    settings = {
        "methodVersion": "heatmap-mwu-bh-v2",
        "scipyVersion": scipy_version,
        "method": "Mann-Whitney U",
        "alternative": "two-sided",
        "pValueMethod": "auto",
        "continuityCorrection": True,
        "multipleTesting": "Benjamini-Hochberg",
        "correctionFamily": "all_prefilter_eligible_features",
        "prefilter": {
            "mode": prefilter,
            "minimumPrevalence": prevalence_min,
            "strictAbundanceThreshold": threshold,
            "pool": "all_selected_samples_without_group_labels",
            "status": "unchanged_default" if prefilter == "none" else "user_selected_sensitivity_analysis",
        },
        "foldChange": "log2((meanAD + 1e-9) / (meanNC + 1e-9))",
        "foldChangePseudocount": eps,
        "inputScale": "relative_abundance" if relative else str(df.attrs.get("abundance_scale", "unknown")),
        "missingValuePolicy": "reject_nonfinite_no_imputation",
        "normalization": "none_in_heatmap_preserve_source",
        "covariates": [],
        "adjustment": "unadjusted_two_group_comparison",
    }
    record = {
        **settings,
        "analysisKey": heatmap_analysis_key(df, species_cols, prefilter, minimum_prevalence, detection_threshold),
        "samples": samples,
        "sourceFeatureCount": len(species_cols),
        "testedFeatureCount": len(tested_indices),
        "excludedFeatureCount": len(species_cols) - len(tested_indices),
        "groupCounts": {"AD": len(av), "NC": len(nv)},
    }
    return record, rows


def heatmap_audit_rows(
    rows: list[dict], displayed: set[str], q_max: float, fc_min: float, view_mode: str
) -> list[dict]:
    result = []
    for source in rows:
        row = dict(source)
        passes_q = row["tested"] and row["qValue"] < q_max
        passes_effect = abs(row["log2FC"]) > fc_min
        row.update(
            passesQ=bool(passes_q), passesEffect=bool(passes_effect), passesBoth=bool(passes_q and passes_effect)
        )
        if not row["tested"]:
            row.update(status="excluded", reason="below_pooled_prevalence")
        elif row["col"] in displayed:
            row.update(
                status="displayed",
                reason="exploratory_display_not_significance"
                if view_mode == "exploratory"
                else "significance_effect_rank",
            )
        elif view_mode == "exploratory" or (passes_q and passes_effect):
            row.update(status="display_cap", reason="outside_top_n")
        else:
            row.update(status="filtered", reason="q_value_threshold" if not passes_q else "effect_size_threshold")
        result.append(row)
    return result


def compute_heatmap(
    df: pd.DataFrame,
    species_cols: list[str],
    top_n: int = 200,
    q_value_max: float = 0.05,
    log2_fc_min_abs: float = 1.0,
    include_audit: bool = False,
    *,
    prefilter: str = "none",
    minimum_prevalence: float = 0.1,
    detection_threshold: float = 0.0001,
    view_mode: str = "differential",
    exploration_ranking: str = "abundance",
    visual_transform: str = "log1p",
    visual_pseudocount: float = 0.00001,
    clustering: str = "hierarchical",
    analysis: tuple[dict, list[dict]] | None = None,
) -> dict:
    """Statistical selection and visual transforms share one complete analysis."""
    record, rows = analysis or analyze_heatmap(
        df,
        species_cols,
        prefilter=prefilter,
        minimum_prevalence=minimum_prevalence,
        detection_threshold=detection_threshold,
    )
    tested = [row for row in rows if row["tested"]]
    candidates = [row for row in tested if row["qValue"] < q_value_max and abs(row["log2FC"]) > log2_fc_min_abs]
    max_features = max(1, int(top_n))
    if view_mode == "differential":
        ordered = sorted(
            candidates, key=lambda row: (-(-math.log10(row["qValue"] + 1e-300) * abs(row["log2FC"])), row["col"])
        )
        selection_note = f"统计筛选：q < {q_value_max:g} 且 |log2FC| > {log2_fc_min_abs:g}，之后按评分取 Top N"
    elif view_mode == "exploratory":
        if exploration_ranking == "q_value":
            ordered = sorted(tested, key=lambda row: (row["qValue"], row["pValue"], row["col"]))
        elif exploration_ranking in {"abundance", "variance"}:
            key = "meanAbundance" if exploration_ranking == "abundance" else "variance"
            ordered = sorted(tested, key=lambda row: (-row[key], row["col"]))
        else:
            raise ValueError("Unknown exploration ranking")
        selection_note = f"探索性丰度查看：按 {exploration_ranking} 排序取 Top N，不代表通过显著性筛选"
    else:
        raise ValueError("Unknown heatmap view mode")
    stats = [dict(row) for row in ordered[:max_features]]
    summary = {
        "sourceFeatureCount": len(rows),
        "testedFeatureCount": len(tested),
        "excludedFeatureCount": len(rows) - len(tested),
        "rawPLt005Count": sum(row["pValue"] < 0.05 for row in tested),
        "qPassCount": sum(row["qValue"] < q_value_max for row in tested),
        "effectPassCount": sum(abs(row["log2FC"]) > log2_fc_min_abs for row in tested),
        "bothPassCount": len(candidates),
        "minQ": min((row["qValue"] for row in tested), default=None),
        "displayedCount": len(stats),
        "epsilonSensitiveCount": sum(row["epsilonSensitive"] for row in tested),
    }
    filter_payload = _heatmap_filter(max_features, q_value_max, log2_fc_min_abs, len(stats), len(candidates))
    filter_payload.update(
        viewMode=view_mode,
        visualTransform=visual_transform,
        selectionNote=selection_note,
        clustering=clustering,
        analysisKey=record["analysisKey"],
    )
    payload = {
        "method": "Mann-Whitney U with Benjamini-Hochberg FDR",
        "inferenceLevel": "exploratory_fdr",
        "analysisRecord": record,
        "summary": summary,
        "filter": filter_payload,
        "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
        "display": {
            "viewMode": view_mode,
            "ranking": exploration_ranking,
            "selectionNote": selection_note,
            "visualTransform": visual_transform,
            "visualPseudocount": visual_pseudocount,
            "clustering": clustering,
        },
        "stats": stats,
    }
    if include_audit:
        payload["_analysisRows"] = rows
        payload["_auditRows"] = heatmap_audit_rows(
            rows, {row["col"] for row in stats}, q_value_max, log2_fc_min_abs, view_mode
        )
    if not stats:
        payload["error"] = (
            f"未筛选到满足 q < {q_value_max:g} 且 |log2FC| > {log2_fc_min_abs:g} 的差异{payload['featureLabel']}。"
            if view_mode == "differential"
            else "预筛后没有可供探索的物种；请核对预先选定的分析范围和规则。"
        )
        return payload
    ad, nc = group_frames(df, species_cols)
    av, nv = ad.to_numpy(dtype=float), nc.to_numpy(dtype=float)
    indices = [row["idx"] for row in stats]
    raw = np.concatenate([av[:, indices], nv[:, indices]], axis=0)
    relative = record["inputScale"] == "relative_abundance"
    if visual_transform == "log1p":
        visual = np.log10(raw + 1)
        note = "log10(存储丰度 + 1)；对很小的比例值近似线性"
    elif visual_transform == "relative":
        visual = raw * (100 if relative else 1)
        note = "原始相对丰度（%）" if relative else "原始丰度（源单位未声明）"
    elif visual_transform in {"log", "zscore"}:
        if visual_pseudocount <= 0:
            raise ValueError("对数伪计数必须大于零")
        visual = np.log10(raw + visual_pseudocount)
        note = f"log10(存储丰度 + {visual_pseudocount:g})"
        if visual_transform == "zscore":
            sd = visual.std(axis=0)
            visual = np.divide(
                visual - visual.mean(axis=0),
                sd,
                out=np.zeros_like(visual),
                where=(sd > 0) & (np.ptp(visual, axis=0) > 0),
            )
            note += " 后按物种在所有所选样本内作 Z-score（ddof=0，常数列置 0）；颜色不能跨物种解释为绝对丰度"
    else:
        raise ValueError("Unknown heatmap visual transform")
    ad_mat, nc_mat = visual[: len(av)], visual[len(av) :]
    ad_order = _cluster_order(ad_mat) if clustering == "hierarchical" else list(range(len(av)))
    nc_order = _cluster_order(nc_mat) if clustering == "hierarchical" else list(range(len(nv)))
    base = np.concatenate([ad_mat[ad_order], nc_mat[nc_order]], axis=0)
    combined = (
        _hierarchical_cluster(base) if clustering == "hierarchical" else {"order": list(range(len(base))), "merges": []}
    )
    columns = (
        _hierarchical_cluster(visual.T)
        if clustering == "hierarchical"
        else {"order": list(range(len(stats))), "merges": []}
    )
    diff = ad_mat.mean(axis=0) - nc_mat.mean(axis=0)
    for index, row in enumerate(stats):
        row.update(diffLog=float(diff[index]), score=-math.log10(row["qValue"] + 1e-300) * abs(row["log2FC"]))
    filter_payload.update(transformNote=note, colorMin=float(visual.min()), colorMaxAbs=float(np.abs(visual).max()))
    payload.update(
        {
            "valueTransformNote": f"颜色值为 {note}。仅改变显示，不改变原始检验和 q 值。",
            "colLabels": [row["label"] for row in stats],
            "adMatrix": ad_mat[ad_order].tolist(),
            "ncMatrix": nc_mat[nc_order].tolist(),
            "rawAdMatrix": av[ad_order][:, indices].tolist(),
            "rawNcMatrix": nv[nc_order][:, indices].tolist(),
            "adLabels": df.loc[df.Group == AD, "Sample"].iloc[ad_order].astype(str).tolist(),
            "ncLabels": df.loc[df.Group == NC, "Sample"].iloc[nc_order].astype(str).tolist(),
            "diffMatrix": [diff.tolist()],
            "diffLabels": ["AD - NC"],
            "maxV": float(visual.max()),
            "maxAbs": float(np.abs(diff).max()),
            "pairedRows": max(len(av), len(nv)),
            "combinedRowOrder": combined["order"],
            "colOrder": columns["order"],
            "dendrograms": {
                "metric": "euclidean",
                "linkage": "average",
                "rows": {"merges": combined["merges"]},
                "columns": {"merges": columns["merges"]},
            },
        }
    )
    return payload
