"""Strict normalization and validation for imported abundance matrices."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .common import AD, FEATURE_META, KO_RE, NC
from .io import read_table

ABUNDANCE_SCALES = {"counts", "relative_abundance", "normalized_abundance", "unknown"}
MISSING_VALUE_POLICIES = {"error", "zero"}


class InputValidationError(ValueError):
    """A stable, machine-readable import validation failure."""

    def __init__(self, code: str, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": str(self), "details": self.details}


@dataclass(frozen=True)
class InputPolicy:
    abundance_scale: str = "unknown"
    missing_value_policy: str = "error"
    minimum_group_size: int = 1

    def validate(self) -> None:
        if self.abundance_scale not in ABUNDANCE_SCALES:
            raise InputValidationError(
                "invalid_abundance_scale",
                f"Unsupported abundance scale: {self.abundance_scale}",
                details={"allowed": sorted(ABUNDANCE_SCALES)},
            )
        if self.missing_value_policy not in MISSING_VALUE_POLICIES:
            raise InputValidationError(
                "invalid_missing_value_policy",
                f"Unsupported missing value policy: {self.missing_value_policy}",
                details={"allowed": sorted(MISSING_VALUE_POLICIES)},
            )
        if self.minimum_group_size < 1:
            raise InputValidationError(
                "invalid_minimum_group_size",
                "minimum_group_size must be at least 1",
            )


def _fail(code: str, message: str, **details: Any) -> None:
    raise InputValidationError(code, message, details=details)


def validate_covariates(
    df: pd.DataFrame,
    feature_cols: list[str],
    covariates: list[str],
) -> None:
    """Validate only explicitly declared model covariates; never infer them."""

    duplicates = sorted({name for name in covariates if covariates.count(name) > 1})
    if duplicates:
        _fail("duplicate_covariate", "Covariate names must be unique.", covariates=duplicates)
    reserved = {"sample_id", "Sample", "Group", "label", *feature_cols}
    invalid = sorted(set(covariates) & reserved)
    if invalid:
        _fail(
            "invalid_covariate",
            "Covariates cannot reuse sample, group, or abundance feature columns.",
            covariates=invalid,
        )
    missing = sorted(set(covariates) - set(df.columns))
    if missing:
        _fail("missing_covariate", "Declared covariates are missing from the input.", covariates=missing)
    incomplete = [name for name in covariates if df[name].isna().any()]
    if incomplete:
        _fail(
            "missing_covariate_value",
            "Declared covariates must not contain missing values.",
            covariates=incomplete,
        )


def prepare_dataframe(
    path: Path,
    *,
    abundance_scale: str = "unknown",
    missing_value_policy: str = "error",
    minimum_group_size: int = 1,
    group_mapping: dict[str, str] | None = None,
    sample_id_prefixes: list[str] | None = None,
) -> tuple[pd.DataFrame, list[str], list[str]]:
    """Read, validate and normalize one AD/NC abundance matrix.

    Low-level computation tests may use ``minimum_group_size=1``.  Public
    imports pass 2 so descriptive charts never publish one-sample groups.
    """

    policy = InputPolicy(abundance_scale, missing_value_policy, minimum_group_size)
    policy.validate()
    warnings: list[str] = []
    df = read_table(path)

    normalized_columns = [str(col).strip() for col in df.columns]
    duplicate_columns = sorted({col for col in normalized_columns if normalized_columns.count(col) > 1})
    if duplicate_columns:
        _fail(
            "duplicate_columns",
            "Column names must be unique after trimming whitespace.",
            columns=duplicate_columns,
        )
    df.columns = normalized_columns

    sample_col = "sample_id" if "sample_id" in df.columns else "Sample" if "Sample" in df.columns else None
    group_col = "Group" if "Group" in df.columns else "label" if "label" in df.columns else None
    missing_required = []
    if group_col is None:
        missing_required.append("Group or label")
    if sample_col is None:
        missing_required.append("sample_id or Sample")
    if missing_required:
        _fail(
            "missing_required_columns",
            f"Missing required column(s): {', '.join(missing_required)}",
            columns=missing_required,
        )

    taxonomy_cols = [col for col in df.columns if col.startswith("k__")]
    ko_cols = [col for col in df.columns if KO_RE.fullmatch(col)]
    if taxonomy_cols and ko_cols:
        _fail(
            "mixed_feature_families",
            "A dataset cannot contain taxonomy and KO feature columns together.",
            taxonomyCount=len(taxonomy_cols),
            koCount=len(ko_cols),
        )
    feature_cols = taxonomy_cols or ko_cols
    if not feature_cols:
        _fail(
            "missing_feature_columns",
            "No abundance feature columns found. Expected columns starting with k__ or KO columns like K00001.",
        )

    raw_samples = df[sample_col]
    empty_samples = raw_samples.isna() | raw_samples.astype(str).str.strip().eq("")
    if empty_samples.any():
        _fail(
            "empty_sample_id",
            "Sample identifiers must be non-empty.",
            rows=(np.flatnonzero(empty_samples.to_numpy()) + 2).tolist(),
        )
    samples = raw_samples.astype(str).str.strip()
    duplicate_samples = sorted(samples[samples.duplicated(keep=False)].unique().tolist())
    if duplicate_samples:
        _fail(
            "duplicate_sample_id",
            "Sample identifiers must be unique within a dataset.",
            samples=duplicate_samples[:25],
            duplicateCount=len(duplicate_samples),
        )

    raw_groups = df[group_col]
    groups = raw_groups.astype(str).str.strip().str.upper()
    if group_mapping:
        normalized_mapping = {
            str(source).strip().upper(): str(target).strip().upper()
            for source, target in group_mapping.items()
        }
        invalid_targets = sorted(set(normalized_mapping.values()) - {AD, NC})
        if invalid_targets:
            _fail(
                "invalid_group_mapping",
                "Explicit group mapping targets must be AD or NC.",
                values=invalid_targets,
            )
        groups = groups.replace(normalized_mapping)

    normalized_prefixes = tuple(
        dict.fromkeys(
            prefix
            for prefix in (
                str(value).strip().upper() for value in (sample_id_prefixes or [])
            )
            if prefix
        )
    )
    excluded_sample_count = 0
    if normalized_prefixes:
        selected = samples.str.upper().str.startswith(normalized_prefixes)
        if not selected.any():
            _fail(
                "empty_sample_selection",
                "No samples matched the configured sample ID prefixes.",
                sampleIdPrefixes=list(normalized_prefixes),
            )
        excluded_sample_count = int((~selected).sum())
        df = df.loc[selected].reset_index(drop=True)
        samples = samples.loc[selected].reset_index(drop=True)
        groups = groups.loc[selected].reset_index(drop=True)
        warnings.append(
            "Selected "
            f"{len(df)} sample(s) with sample ID prefixes "
            f"{', '.join(normalized_prefixes)}; excluded {excluded_sample_count}."
        )

    invalid_groups = sorted(set(groups) - {AD, NC})
    if invalid_groups:
        _fail(
            "invalid_group",
            "Only AD and NC groups are supported.",
            values=invalid_groups,
        )
    group_counts = groups.value_counts().to_dict()
    undersized = {group: int(group_counts.get(group, 0)) for group in (AD, NC) if group_counts.get(group, 0) < minimum_group_size}
    if undersized:
        _fail(
            "insufficient_group_size",
            f"Each group must contain at least {minimum_group_size} sample(s).",
            groupCounts={str(k): int(v) for k, v in group_counts.items()},
            minimumGroupSize=minimum_group_size,
        )

    raw_abundance = df[feature_cols]
    abundance = raw_abundance.apply(pd.to_numeric, errors="coerce")
    missing_cells = raw_abundance.isna()
    invalid_numeric = abundance.isna() & ~missing_cells
    if invalid_numeric.any().any():
        rows, columns = np.where(invalid_numeric.to_numpy())
        _fail(
            "non_numeric_abundance",
            "Abundance values must be numeric.",
            cells=[{"row": int(row + 2), "column": feature_cols[int(column)]} for row, column in zip(rows[:25], columns[:25], strict=False)],
            cellCount=int(invalid_numeric.sum().sum()),
        )

    infinite = np.isinf(abundance.to_numpy(dtype=float))
    if infinite.any():
        rows, columns = np.where(infinite)
        _fail(
            "non_finite_abundance",
            "Infinite abundance values are not allowed.",
            cells=[{"row": int(row + 2), "column": feature_cols[int(column)]} for row, column in zip(rows[:25], columns[:25], strict=False)],
            cellCount=int(infinite.sum()),
        )

    missing_count = int(abundance.isna().sum().sum())
    if missing_count:
        if missing_value_policy != "zero":
            _fail(
                "missing_abundance",
                "Missing abundance values require missingValuePolicy=zero.",
                cellCount=missing_count,
            )
        warnings.append(f"Imputed {missing_count} missing abundance cells as 0 by explicit policy.")
        abundance = abundance.fillna(0)

    negative = abundance.to_numpy(dtype=float) < 0
    if negative.any():
        rows, columns = np.where(negative)
        _fail(
            "negative_abundance",
            "Negative abundance values are not allowed.",
            cells=[{"row": int(row + 2), "column": feature_cols[int(column)]} for row, column in zip(rows[:25], columns[:25], strict=False)],
            cellCount=int(negative.sum()),
        )

    values = abundance.to_numpy(dtype=float)
    if abundance_scale == "counts" and not np.allclose(values, np.round(values), rtol=0, atol=1e-12):
        _fail(
            "invalid_count_scale",
            "Count abundance must contain non-negative integer values.",
        )
    if abundance_scale == "relative_abundance" and (values > 1 + 1e-9).any():
        _fail(
            "invalid_relative_abundance_scale",
            "Relative abundance must be represented as fractions between 0 and 1.",
            maximum=float(values.max()),
        )

    feature_kind = "taxonomy" if taxonomy_cols else "ko"
    metadata = df.drop(columns=feature_cols).copy()
    metadata["Group"] = groups.to_numpy()
    metadata["Sample"] = samples.to_numpy()
    abundance = abundance.reset_index(drop=True)
    df = pd.concat([metadata.reset_index(drop=True), abundance], axis=1)
    df.attrs.update(
        {
            "feature_kind": feature_kind,
            "feature_label": FEATURE_META[feature_kind]["label"],
            "composition_label": FEATURE_META[feature_kind]["compositionLabel"],
            "taxonomy_label": FEATURE_META[feature_kind]["taxonomyLabel"],
            "abundance_scale": abundance_scale,
            "missing_value_policy": missing_value_policy,
            "validation_report": {
                "status": "valid",
                "sampleCount": len(df),
                "featureCount": len(feature_cols),
                "groupCounts": {group: int(group_counts.get(group, 0)) for group in (AD, NC)},
                "imputedCellCount": missing_count,
                "abundanceScale": abundance_scale,
                "missingValuePolicy": missing_value_policy,
                "groupMapping": group_mapping or {},
                "sampleIdPrefixes": list(normalized_prefixes),
                "excludedSampleCount": excluded_sample_count,
                "inferenceEligible": abundance_scale != "unknown" and missing_count == 0 and min(group_counts.values()) >= 5,
            },
        }
    )
    return df, feature_cols, warnings
