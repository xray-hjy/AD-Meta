"""Convert MetaPhlAn clade profiles to the platform's species matrix contract."""

from __future__ import annotations

import csv
import hashlib
import re
from pathlib import Path

import numpy as np
import pandas as pd

from app.compute.table import InputValidationError


def normalize_metaphlan(source: Path, metadata_path: Path) -> tuple[pd.DataFrame, dict]:
    """Keep species rows, join groups by CRR, and convert percent to fractions."""
    def fail(message: str) -> None:
        raise InputValidationError("invalid_metaphlan_profile", message)

    with source.open(encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.reader(handle, delimiter="\t") if row and not row[0].startswith("#")]
    if not rows or rows[0][0] != "ID" or len(rows[0]) < 2:
        fail("MetaPhlAn profile requires an ID header and sample columns.")
    header = rows.pop(0)
    samples = []
    for column in header[1:]:
        match = re.fullmatch(r"(CRR\d+)_metaphlan", column)
        if not match:
            fail(f"Unexpected MetaPhlAn sample column: {column}")
        samples.append(match.group(1))
    if len(set(samples)) != len(samples):
        fail("MetaPhlAn sample columns must be unique.")
    if any(len(row) != len(header) for row in rows):
        fail("MetaPhlAn rows must have the same width as the header.")
    ids = [row[0] for row in rows]
    if any(not value for value in ids) or len(set(ids)) != len(ids):
        fail("Taxonomy IDs must be non-empty and unique.")
    selected = [row for row in rows if row[0].startswith("k__")
                and row[0].split("|")[-1].startswith("s__")]
    if not selected:
        fail("No species-level rows found; strain (t__) rows are excluded.")
    try:
        values = np.array([row[1:] for row in selected], dtype=float)
    except ValueError:
        fail("Species abundances must be numeric; missing cells are not zero-filled.")
    if not np.isfinite(values).all() or (values < 0).any() or (values > 100).any():
        fail("Species abundance must be finite and within 0–100 percent.")
    totals = values.sum(axis=0)
    if not np.allclose(totals, 100, rtol=0, atol=0.01):
        fail("Species abundances must sum to 100 percent per sample (rounding tolerance 0.01).")
    metadata = pd.read_csv(metadata_path, sep="\t", dtype=str, keep_default_na=False)
    if not {"sample_id", "Group"}.issubset(metadata.columns):
        fail("Sample metadata must contain sample_id and Group columns.")
    if metadata["sample_id"].duplicated().any() or metadata["sample_id"].eq("").any():
        fail("Sample metadata IDs must be non-empty and unique.")
    if set(metadata["Group"]) - {"AD", "NC"}:
        fail("Sample metadata groups must be AD or NC.")
    if set(metadata["sample_id"]) != set(samples):
        fail("Profile sample set must exactly match the verified AD/NC metadata.")
    groups = metadata.set_index("sample_id")["Group"]
    matrix = pd.DataFrame(values.T / 100, index=samples, columns=[row[0] for row in selected])
    matrix.insert(0, "Group", groups.loc[samples].to_numpy())
    matrix.insert(0, "sample_id", samples)
    matrix = matrix.set_index("sample_id").loc[metadata["sample_id"]].reset_index()
    report = {
        "format": "metaphlan4_taxonomy", "adapterVersion": "1",
        "sourceRows": len(rows), "speciesFeatureCount": len(selected),
        "excludedParentAndStrainRows": len(rows) - len(selected),
        "sampleCount": len(samples), "groupCounts": metadata["Group"].value_counts().to_dict(),
        "sourceUnit": "percent", "storedUnit": "fraction", "conversion": "x / 100; no reclosure",
        "speciesPercentSumRange": [float(totals.min()), float(totals.max())],
        "sampleMetadataSha256": hashlib.sha256(metadata_path.read_bytes()).hexdigest(),
    }
    return matrix, report
