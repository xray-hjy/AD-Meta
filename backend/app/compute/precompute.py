from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import leaves_list, linkage
from scipy.spatial.distance import pdist, squareform
from scipy.stats import mannwhitneyu
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from .taxonomy import get_level, short_name, taxonomy_chain

AD = "AD"
NC = "NC"


def read_table(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path, engine="openpyxl")
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".tsv":
        return pd.read_csv(path, sep="\t")
    raise ValueError(f"Unsupported file type: {suffix}")


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, np.ndarray):
        return _jsonable(value.tolist())
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        return f if math.isfinite(f) else 0.0
    return value


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(_jsonable(payload), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def prepare_dataframe(path: Path) -> tuple[pd.DataFrame, list[str], list[str]]:
    warnings: list[str] = []
    df = read_table(path)
    df.columns = [str(col).strip() for col in df.columns]

    sample_col = "sample_id" if "sample_id" in df.columns else "Sample" if "Sample" in df.columns else None
    required = {"Group"}
    missing = sorted(required - set(df.columns))
    if sample_col is None:
        missing.append("sample_id or Sample")
    if missing:
        raise ValueError(f"Missing required column(s): {', '.join(missing)}")

    species_cols = [col for col in df.columns if col.startswith("k__")]
    if not species_cols:
        raise ValueError("No species abundance columns found. Expected columns starting with k__.")

    groups = df["Group"].astype(str).str.strip().str.upper()
    df["Group"] = groups

    if AD not in set(groups) or NC not in set(groups):
        raise ValueError("The first version requires both AD and NC groups.")

    abundance = df[species_cols].apply(pd.to_numeric, errors="coerce")
    non_numeric = int(abundance.isna().sum().sum())
    if non_numeric:
        warnings.append(f"Converted {non_numeric} empty or non-numeric abundance cells to 0.")
    abundance = abundance.fillna(0).clip(lower=0)
    df[species_cols] = abundance
    df["Sample"] = df[sample_col].astype(str).str.strip()

    return df, species_cols, warnings


def _group_frames(df: pd.DataFrame, species_cols: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    ad = df.loc[df["Group"] == AD, species_cols]
    nc = df.loc[df["Group"] == NC, species_cols]
    return ad, nc


def _box_values(values: np.ndarray) -> list[float]:
    values = np.sort(values[np.isfinite(values)])
    if values.size == 0:
        return [0, 0, 0, 0, 0]
    q1, median, q3 = np.percentile(values, [25, 50, 75])
    iqr = q3 - q1
    lower = max(float(values[0]), float(q1 - 1.5 * iqr))
    upper = min(float(values[-1]), float(q3 + 1.5 * iqr))
    return [lower, float(q1), float(median), float(q3), upper]


def compute_summary(df: pd.DataFrame, species_cols: list[str], slug: str, name: str, published_at: str) -> dict:
    group_counts = df["Group"].value_counts().to_dict()
    return {
        "datasetSlug": slug,
        "datasetName": name,
        "totalSamples": int(len(df)),
        "adSamples": int(group_counts.get(AD, 0)),
        "ncSamples": int(group_counts.get(NC, 0)),
        "totalSpecies": int(len(species_cols)),
        "groupCounts": {str(k): int(v) for k, v in group_counts.items()},
        "publishedAt": published_at,
    }


def compute_species(df: pd.DataFrame, species_cols: list[str], top_n: int = 50) -> list[dict]:
    ad, nc = _group_frames(df, species_cols)
    ad_mean = ad.mean(axis=0)
    nc_mean = nc.mean(axis=0)
    ad_std = ad.std(axis=0, ddof=1).fillna(0)
    nc_std = nc.std(axis=0, ddof=1).fillna(0)
    total = ad_mean + nc_mean

    ordered = total.sort_values(ascending=False).head(top_n).index
    return [
        {
            "species": short_name(col),
            "fullName": col,
            "adMean": float(ad_mean[col]),
            "adStd": float(ad_std[col]),
            "ncMean": float(nc_mean[col]),
            "ncStd": float(nc_std[col]),
            "total": float(total[col]),
        }
        for col in ordered
    ]


def compute_phylum(df: pd.DataFrame, species_cols: list[str]) -> list[dict]:
    ad, nc = _group_frames(df, species_cols)
    ad_mean = ad.mean(axis=0)
    nc_mean = nc.mean(axis=0)
    ad_sum: dict[str, float] = defaultdict(float)
    nc_sum: dict[str, float] = defaultdict(float)

    for col in species_cols:
        phylum = get_level(col, "p") or "Unclassified"
        ad_sum[phylum] += float(ad_mean[col])
        nc_sum[phylum] += float(nc_mean[col])

    ad_total = sum(ad_sum.values()) or 1.0
    nc_total = sum(nc_sum.values()) or 1.0
    rows = [
        {
            "phylum": phylum.replace("_", " "),
            "adRatio": ad_sum.get(phylum, 0.0) / ad_total,
            "ncRatio": nc_sum.get(phylum, 0.0) / nc_total,
        }
        for phylum in sorted(set(ad_sum) | set(nc_sum))
    ]
    rows.sort(key=lambda item: item["adRatio"] + item["ncRatio"], reverse=True)

    if len(rows) <= 6:
        return rows

    top = rows[:6]
    other = {
        "phylum": "Other",
        "adRatio": sum(item["adRatio"] for item in rows[6:]),
        "ncRatio": sum(item["ncRatio"] for item in rows[6:]),
    }
    return [*top, other]


def compute_boxplot(df: pd.DataFrame, species_cols: list[str], top_n: int = 30) -> dict:
    ranked = compute_species(df, species_cols, top_n=top_n)
    ad, nc = _group_frames(df, species_cols)
    items = []
    for item in ranked:
        col = item["fullName"]
        items.append(
            {
                "fullName": col,
                "shortName": short_name(col),
                "total": item["total"],
                "adBox": _box_values(ad[col].to_numpy(dtype=float)),
                "ncBox": _box_values(nc[col].to_numpy(dtype=float)),
            }
        )
    return {"items": items}


def _cluster_order(matrix: np.ndarray) -> list[int]:
    n = matrix.shape[0]
    if n <= 2:
        return list(range(n))
    distances = pdist(matrix, metric="euclidean")
    if not np.isfinite(distances).all() or np.allclose(distances, 0):
        return list(range(n))
    return leaves_list(linkage(distances, method="average")).astype(int).tolist()


def compute_heatmap(df: pd.DataFrame, species_cols: list[str], top_n: int = 30) -> dict:
    ad, nc = _group_frames(df, species_cols)
    ad_values = ad.to_numpy(dtype=float)
    nc_values = nc.to_numpy(dtype=float)
    ad_mean = ad_values.mean(axis=0)
    nc_mean = nc_values.mean(axis=0)
    eps = 1e-9
    log2fc = np.log2((ad_mean + eps) / (nc_mean + eps))

    p_values = []
    for i in range(len(species_cols)):
        try:
            p = mannwhitneyu(ad_values[:, i], nc_values[:, i], alternative="two-sided").pvalue
        except ValueError:
            p = 1.0
        p_values.append(float(p) if np.isfinite(p) else 1.0)

    log_ad = np.log10(ad_values + 1)
    log_nc = np.log10(nc_values + 1)
    ad_mean_log = log_ad.mean(axis=0)
    nc_mean_log = log_nc.mean(axis=0)
    diff_log = ad_mean_log - nc_mean_log

    candidates = []
    for i, col in enumerate(species_cols):
        if p_values[i] < 0.05 and abs(log2fc[i]) > 1:
            candidates.append(
                {
                    "idx": i,
                    "col": col,
                    "fullName": col,
                    "label": short_name(col, max_len=10),
                    "p": p_values[i],
                    "log2FC": float(log2fc[i]),
                    "meanAD": float(ad_mean[i]),
                    "meanNC": float(nc_mean[i]),
                    "diffLog": float(diff_log[i]),
                }
            )
    candidates.sort(key=lambda item: (item["p"], -abs(item["log2FC"])))
    stats = candidates[:top_n]

    if not stats:
        return {
            "error": "未筛选到满足 p < 0.05 且 |log2FC| > 1 的差异物种。",
            "filter": {"pValueMax": 0.05, "log2FcMinAbs": 1, "topN": top_n},
        }

    idx = [item["idx"] for item in stats]
    ad_mat = log_ad[:, idx]
    nc_mat = log_nc[:, idx]
    ad_order = _cluster_order(ad_mat)
    nc_order = _cluster_order(nc_mat)
    all_values = np.concatenate([ad_mat.ravel(), nc_mat.ravel()])

    return {
        "filter": {"pValueMax": 0.05, "log2FcMinAbs": 1, "topN": top_n},
        "stats": [{k: v for k, v in item.items() if k != "idx"} for item in stats],
        "colLabels": [item["label"] for item in stats],
        "adMatrix": ad_mat[ad_order, :].tolist(),
        "ncMatrix": nc_mat[nc_order, :].tolist(),
        "adLabels": df.loc[df["Group"] == AD, "Sample"].iloc[ad_order].tolist(),
        "ncLabels": df.loc[df["Group"] == NC, "Sample"].iloc[nc_order].tolist(),
        "diffMatrix": [[item["diffLog"] for item in stats]],
        "diffLabels": ["AD - NC"],
        "maxV": float(np.max(all_values)) if all_values.size else 1.0,
        "maxAbs": float(max(abs(item["diffLog"]) for item in stats)),
        "pairedRows": int(max(ad_mat.shape[0], nc_mat.shape[0])),
    }


def _sum_tree_values(node: dict) -> float:
    children = node.get("children") or []
    if not children:
        return float(node.get("value", 0))
    node["value"] = sum(_sum_tree_values(child) for child in children)
    return float(node["value"])


def _prune_children(children: list[dict], limit: int, other_name: str) -> list[dict]:
    children.sort(key=lambda item: item.get("value", 0), reverse=True)
    if len(children) <= limit:
        return children
    visible = children[:limit]
    hidden = children[limit:]
    hidden_value = sum(child.get("value", 0) for child in hidden)
    if hidden_value > 0:
        visible.append({"name": other_name, "value": hidden_value})
    return visible


def compute_sunburst(df: pd.DataFrame, species_cols: list[str]) -> list[dict]:
    totals = df[species_cols].sum(axis=0)
    tree: dict[str, dict] = {}

    for col in species_cols:
        value = float(totals[col])
        if value <= 0:
            continue
        chain = taxonomy_chain(col)
        phylum = chain["phylum"]
        cls = chain["class"]
        genus = chain["genus"]
        species = chain["species"]

        p_node = tree.setdefault(phylum, {"name": phylum, "children": {}})
        c_node = p_node["children"].setdefault(cls, {"name": cls, "children": {}})
        g_node = c_node["children"].setdefault(genus, {"name": genus, "children": {}})
        s_node = g_node["children"].setdefault(species, {"name": species, "value": 0.0})
        s_node["value"] += value

    def materialize(node: dict, depth: int = 0) -> dict:
        children_map = node.get("children")
        if not children_map:
            return {"name": node["name"], "value": node.get("value", 0.0)}
        children = [materialize(child, depth + 1) for child in children_map.values()]
        limit = 6 if depth == 0 else 5
        children = _prune_children(children, limit, "Other")
        materialized = {"name": node["name"], "children": children}
        _sum_tree_values(materialized)
        return materialized

    roots = [materialize(node, 0) for node in tree.values()]
    roots = _prune_children(roots, 6, "Other")
    return roots


def _confidence_ellipses(points: list[dict]) -> list[dict]:
    ellipses = []
    for group in sorted({point["group"] for point in points}):
        group_points = np.array(
            [[point["x"], point["y"]] for point in points if point["group"] == group],
            dtype=float,
        )
        if group_points.shape[0] < 3:
            continue
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
    ranked = df[species_cols].sum(axis=0).sort_values(ascending=False).head(top_n).index.tolist()
    if len(ranked) < 2:
        return {"method": "PCA", "speciesCount": len(ranked), "variance": [], "points": [], "ellipses": []}

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
        for i, (sample, group) in enumerate(zip(df["Sample"], df["Group"]))
    ]
    return {
        "method": "PCA",
        "speciesCount": len(ranked),
        "variance": model.explained_variance_ratio_.tolist(),
        "points": points,
        "ellipses": _confidence_ellipses(points),
    }


def _permanova(distance: np.ndarray, groups: np.ndarray, n_perm: int = 999, seed: int = 20240514) -> dict:
    n = distance.shape[0]
    d2 = distance * distance
    unique = np.unique(groups)
    if n < 4 or len(unique) < 2:
        return {"r2": 0.0, "pValue": 1.0, "fStat": 0.0, "nPerm": n_perm}

    triu = np.triu_indices(n, 1)
    ss_total = float(d2[triu].sum() / n)

    def calc(labels: np.ndarray) -> tuple[float, float]:
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
    ranked = df[species_cols].sum(axis=0).sort_values(ascending=False).head(top_n).index.tolist()
    if len(ranked) < 2 or len(df) < 3:
        return {
            "method": "PCoA",
            "distance": "Bray-Curtis",
            "speciesCount": len(ranked),
            "variance": [],
            "points": [],
            "ellipses": [],
            "permanova": {"r2": 0.0, "pValue": 1.0, "fStat": 0.0, "nPerm": 999},
        }

    X = df[ranked].to_numpy(dtype=float)
    row_sums = X.sum(axis=1, keepdims=True)
    row_sums[row_sums <= 0] = 1
    X = X / row_sums
    distance = squareform(pdist(X, metric="braycurtis"))
    distance = np.nan_to_num(distance, nan=0.0, posinf=0.0, neginf=0.0)

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
        for i, (sample, group) in enumerate(zip(df["Sample"], df["Group"]))
    ]
    return {
        "method": "PCoA",
        "distance": "Bray-Curtis",
        "speciesCount": len(ranked),
        "variance": variance,
        "points": points,
        "ellipses": _confidence_ellipses(points),
        "permanova": _permanova(distance, df["Group"].to_numpy()),
    }


def precompute_all(path: Path, slug: str, name: str, published_at: str) -> tuple[dict, dict[str, Any], list[str]]:
    df, species_cols, warnings = prepare_dataframe(path)
    summary = compute_summary(df, species_cols, slug, name, published_at)
    artifacts = {
        "summary": summary,
        "species": compute_species(df, species_cols),
        "phylum": compute_phylum(df, species_cols),
        "boxplot": compute_boxplot(df, species_cols),
        "heatmap": compute_heatmap(df, species_cols),
        "sunburst": compute_sunburst(df, species_cols),
        "pca": compute_pca(df, species_cols),
        "pcoa": compute_pcoa(df, species_cols),
    }
    return summary, artifacts, warnings
