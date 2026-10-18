"""Validate DiTing tables and prepare version-bound community functional results."""
from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu, rankdata

from app.compute.table import InputValidationError


def read_profile(source: Path, metadata_path: Path, header: str):
    def fail(message):
        raise InputValidationError("invalid_diting_profile", message)

    with source.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle, delimiter="\t"))
    if not rows or rows[0][0] != header or len(rows[0]) < 3:
        fail(f"Expected {header} and sample columns.")
    samples = rows[0][1:]
    rows = [row for row in rows[1:] if row]
    if not rows or any(len(row) != len(samples) + 1 for row in rows):
        fail("Profile rows must match header width.")
    names = [row[0] for row in rows]
    if len(set(samples)) != len(samples) or len(set(names)) != len(names) or not all(names):
        fail("Sample and feature identifiers must be unique and non-empty.")
    try:
        values = np.asarray([row[1:] for row in rows], dtype=float)
    except ValueError:
        fail("Abundances must be numeric.")
    if not np.isfinite(values).all() or (values < 0).any():
        fail("Abundances must be finite and nonnegative; missing values are not imputed.")
    meta = pd.read_csv(metadata_path, sep="\t", dtype=str, keep_default_na=False)
    if not {"sample_id", "Group"}.issubset(meta.columns):
        fail("Metadata requires sample_id and Group.")
    if meta.sample_id.duplicated().any() or set(meta.Group) != {"AD", "NC"}:
        fail("Metadata requires unique samples and both AD/NC groups.")
    if set(samples) != set(meta.sample_id):
        fail("Profile samples must exactly match verified AD/NC metadata.")
    order = [samples.index(sample) for sample in meta.sample_id]
    return names, values[:, order], meta


def normalize_diting(source: Path, metadata_path: Path, pathway_file: Path):
    names, values, meta = read_profile(source, metadata_path, "k_number")
    standard = [i for i, name in enumerate(names) if re.fullmatch(r"K\d{5}", name)]
    if not standard:
        raise InputValidationError("invalid_diting_profile", "No standard KO identifiers found.")
    pathway_names, pathway_values, pathway_meta = read_profile(pathway_file, metadata_path, "#Pathway")
    if not meta.equals(pathway_meta):
        raise InputValidationError("invalid_diting_profile", "Pathway sample metadata mismatch.")
    matrix = pd.DataFrame(values[standard].T, columns=[names[i] for i in standard])
    matrix.insert(0, "Group", meta.Group.to_numpy())
    matrix.insert(0, "sample_id", meta.sample_id.to_numpy())
    report = {
        "format": "diting_ko", "adapterVersion": "1.1", "sampleCount": len(meta),
        "standardKoCount": len(standard), "sourceFeatureCount": len(names),
        "additionalFunctionalGenes": [name for name in names if not re.fullmatch(r"K\d{5}", name)],
        "pathwayCount": len(pathway_names),
        "pathwaySha256": hashlib.sha256(pathway_file.read_bytes()).hexdigest(),
        "sampleMetadataSha256": hashlib.sha256(metadata_path.read_bytes()).hexdigest(),
        "conversion": "transpose; join groups by sample ID; retain upstream values; no reclosure",
    }
    ad = meta.Group.eq("AD").to_numpy()
    rng = np.random.default_rng(20261016)
    n_ad, n_nc = int(ad.sum()), int((~ad).sum())
    # One reproducible participant-level bootstrap design shared across features.
    a_idx = rng.integers(n_ad, size=(1000, n_ad))
    b_idx = rng.integers(n_nc, size=(1000, n_nc))
    items = []
    for name, row in zip(pathway_names, pathway_values, strict=True):
        a, b = row[ad], row[~ad]
        result = mannwhitneyu(a, b, alternative="two-sided", method="asymptotic")
        p_value = float(result.pvalue) if np.isfinite(result.pvalue) else 1.0
        delta = 2 * float(result.statistic) / (n_ad * n_nc) - 1
        boot = np.concatenate([a[a_idx], b[b_idx]], axis=1)
        ranks = rankdata(boot, axis=1)
        boot_u = ranks[:, :n_ad].sum(axis=1) - n_ad * (n_ad + 1) / 2
        ci = np.quantile(2 * boot_u / (n_ad * n_nc) - 1, [.025, .975]).tolist()
        items.append({
            "id": hashlib.sha256(name.encode()).hexdigest()[:20], "name": name,
            "values": row.tolist(), "mean": float(row.mean()),
            "groups": {group: {"mean": float(v.mean()), "median": float(np.median(v)),
                                  "detected": int((v > 0).sum()), "count": len(v)}
                       for group, v in [("AD", a), ("NC", b)]},
            "effect": delta, "ci": ci, "pValue": p_value,
        })
    order = np.argsort([item["pValue"] for item in items])
    adjusted = np.minimum.accumulate(np.asarray([items[i]["pValue"] for i in order])[::-1]
                                     * len(items) / np.arange(len(items), 0, -1))[::-1]
    for index, q in zip(order, adjusted, strict=True):
        items[int(index)]["qValue"] = float(min(q, 1))
    payload = {
        "schemaVersion": "1.0", "source": "DiTing", "abundanceScale": "normalized_abundance",
        "unit": "DiTing 标准化丰度（上游原值）", "sampleCount": len(meta),
        "samples": [{"id": row.sample_id, "group": row.Group} for row in meta.itertuples()],
        "items": items, "preprocessing": report,
        "statistics": {"method": "Mann–Whitney U (two-sided, asymptotic, tie corrected)",
                       "effect": "Cliff's delta (positive = AD higher)",
                       "confidenceInterval": "95% percentile bootstrap; 1000 within-group resamples; seed 20261016",
                       "multipleTesting": "Benjamini–Hochberg across all supplied pathways",
                       "covariates": [], "detectionThreshold": "> 0 (numerical presence)"},
    }
    # Statistical missing values must never pass through the generic chart
    # serializer, which historically converts non-finite numbers to zero.
    try:
        json.dumps(payload, allow_nan=False)
    except ValueError as exc:
        raise InputValidationError("invalid_diting_statistics", "DiTing derived statistics must be finite.") from exc
    return matrix, report, payload
