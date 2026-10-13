"""Read version-scoped dataset facts without editorial copy."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.core.database import connect
from app.services.dataset_service import read_chart_with_metadata

VERIFIED_COHORTS_PATH = Path(__file__).resolve().parents[2] / "metadata" / "verified_cohorts.json"


def _json_object(value: str | None) -> dict[str, Any]:
    try:
        decoded = json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _count(value: Any) -> int | None:
    if value is None:
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _verified_cohort(sample_codes: list[str], group_counts: dict[str, int]) -> dict[str, Any] | None:
    if not sample_codes or len(sample_codes) != len(set(sample_codes)):
        return None
    try:
        registry = json.loads(VERIFIED_COHORTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(registry, dict) or not isinstance(registry.get("cohorts"), list):
        return None
    fingerprint = hashlib.sha256("\n".join(sorted(sample_codes)).encode("utf-8")).hexdigest()
    for cohort in registry["cohorts"]:
        if not isinstance(cohort, dict):
            continue
        if (
            cohort.get("sampleSetSha256") == fingerprint
            and cohort.get("sampleCount") == len(sample_codes)
            and cohort.get("groupCounts") == group_counts
        ):
            return {
                "cohortId": cohort.get("cohortId"),
                "repository": cohort.get("repository"),
                "studyAccession": cohort.get("studyAccession"),
                "studyUrl": cohort.get("studyUrl"),
                "projectAccession": cohort.get("projectAccession"),
                "projectUrl": cohort.get("projectUrl"),
                "verifiedOn": cohort.get("verifiedOn"),
                "publication": cohort.get("publication"),
            }
    return None


def get_dataset_description(slug: str, revision_key: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT datasets.current_revision_id, datasets.name, datasets.original_filename,
                   datasets.feature_kind, datasets.feature_label, datasets.feature_count,
                   datasets.sample_count, datasets.group_counts_json,
                   dataset_revisions.id AS revision_id, dataset_revisions.revision_key,
                   dataset_revisions.source_sha256, dataset_revisions.source_file_size,
                   dataset_revisions.abundance_scale, dataset_revisions.normalization,
                   dataset_revisions.missing_value_policy, dataset_revisions.validation_json,
                   dataset_revisions.published_at
            FROM datasets
            JOIN dataset_revisions ON dataset_revisions.dataset_id = datasets.id
            WHERE datasets.slug = ? AND datasets.status = 'published'
              AND dataset_revisions.revision_key = ?
              AND dataset_revisions.status = 'published'
            """,
            (slug, revision_key),
        ).fetchone()
        if row is None:
            return None
        group_rows = conn.execute(
            """
            SELECT phenotype, COUNT(*) AS count
            FROM revision_sample_info WHERE revision_id = ?
            GROUP BY phenotype
            """,
            (row["revision_id"],),
        ).fetchall()
        sample_rows = conn.execute(
            "SELECT sample_code FROM revision_sample_info WHERE revision_id = ?",
            (row["revision_id"],),
        ).fetchall()

    validation = _json_object(row["validation_json"])
    is_current = row["current_revision_id"] == row["revision_id"]
    group_counts = {str(item["phenotype"]): int(item["count"]) for item in group_rows}
    if not group_counts:
        group_counts = {
            str(group): int(count)
            for group, count in (validation.get("groupCounts") or {}).items()
        }
    if not group_counts and is_current:
        group_counts = _json_object(row["group_counts_json"])

    sample_count = sum(group_counts.values()) if group_counts else _count(validation.get("sampleCount"))
    feature_count = _count(validation.get("featureCount"))
    if sample_count is None or feature_count is None:
        summary, error, _ = read_chart_with_metadata(slug, "summary", revision_key)
        summary = summary if error is None and isinstance(summary, dict) else {}
        if sample_count is None:
            sample_count = _count(summary.get("totalSamples"))
        if feature_count is None:
            feature_count = _count(summary.get("totalFeatures") or summary.get("totalSpecies"))
    if is_current:
        sample_count = sample_count if sample_count is not None else _count(row["sample_count"])
        feature_count = feature_count if feature_count is not None else _count(row["feature_count"])

    return {
        "datasetSlug": slug,
        "datasetName": row["name"],
        "datasetRevision": revision_key,
        "sourceSha256": row["source_sha256"],
        "sourceFileName": row["original_filename"] if is_current else None,
        "sourceFileSize": row["source_file_size"],
        "publishedAt": row["published_at"],
        "featureKind": row["feature_kind"],
        "featureLabel": row["feature_label"],
        "sampleCount": sample_count,
        "featureCount": feature_count,
        "groupCounts": group_counts,
        "abundanceScale": row["abundance_scale"],
        "normalization": row["normalization"],
        "sampleIdPrefixes": validation.get("sampleIdPrefixes") or [],
        "excludedSampleCount": _count(validation.get("excludedSampleCount")),
        "groupMapping": validation.get("groupMapping") or {},
        "missingValuePolicy": row["missing_value_policy"],
        "imputedCellCount": _count(validation.get("imputedCellCount")),
        "duplicateFeaturePolicy": validation.get("duplicateFeaturePolicy"),
        "cohortSource": _verified_cohort(
            [str(item["sample_code"]) for item in sample_rows], group_counts
        ),
    }
