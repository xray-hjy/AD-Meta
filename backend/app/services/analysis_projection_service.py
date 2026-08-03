from __future__ import annotations

import hashlib
import json
import math
import uuid
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core import database
from app.core.config import CACHE_ROOT
from app.core.database import connect
from app.domain.analysis_scope import AbundanceProjectionRequest, AnalysisScope


class AnalysisRunNotFound(LookupError):
    pass


class AnalysisArtifactNotFound(LookupError):
    pass


class AnalysisScopeError(ValueError):
    pass


SERIES_COLORS = {"AD": "#e74c3c", "NC": "#2ecc71", "subset": "#2563eb"}


def _loads(value: Any, fallback):
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _aggregate_cache_path(identity: dict[str, Any]) -> Path | None:
    if database.DB_ENGINE != "mysql":
        return None
    digest = hashlib.sha256(
        json.dumps(identity, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return CACHE_ROOT / "projections" / "abundance" / f"{digest}.json"


def _read_aggregate_cache(path: Path | None) -> list[dict[str, Any]] | None:
    if path is None:
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None
    rows = payload.get("rows") if isinstance(payload, dict) else None
    return rows if isinstance(rows, list) else None


def _write_aggregate_cache(path: Path | None, rows: list[dict[str, Any]]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(
            json.dumps({"schemaVersion": "1.0", "rows": rows}, ensure_ascii=False),
            encoding="utf-8",
        )
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _resolve_run(conn, run_key: str):
    row = conn.execute(
        "SELECT id, run_key, name FROM analysis_runs WHERE run_key = ? AND status = 'published'",
        (run_key,),
    ).fetchone()
    if row is None:
        raise AnalysisRunNotFound(run_key)
    return row


def _resolve_artifact(conn, run_id: int, artifact_key: str):
    row = conn.execute(
        """
        SELECT analysis_artifacts.id, analysis_artifacts.artifact_key,
               analysis_artifacts.artifact_type, analysis_artifacts.dataset_id,
               analysis_artifacts.dataset_revision_id, analysis_artifacts.metadata_json,
               datasets.slug AS dataset_slug, datasets.feature_count,
               datasets.feature_kind, datasets.feature_label,
               dataset_revisions.revision_key,
               dataset_revisions.abundance_scale,
               dataset_revisions.normalization
        FROM analysis_artifacts
        JOIN datasets ON datasets.id = analysis_artifacts.dataset_id
        JOIN dataset_revisions ON dataset_revisions.id = analysis_artifacts.dataset_revision_id
        WHERE analysis_artifacts.analysis_run_id = ?
          AND analysis_artifacts.artifact_key = ?
        """,
        (run_id, artifact_key),
    ).fetchone()
    if row is None:
        raise AnalysisArtifactNotFound(artifact_key)
    return row


def _artifact_samples(conn, run_id: int, artifact_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT analysis_run_samples.sample_code, analysis_run_samples.phenotype,
               analysis_run_samples.cohort_key, analysis_run_samples.source_study,
               analysis_run_samples.metadata_json
        FROM analysis_artifact_samples
        JOIN analysis_run_samples
          ON analysis_run_samples.id = analysis_artifact_samples.run_sample_id
        WHERE analysis_run_samples.analysis_run_id = ?
          AND analysis_artifact_samples.artifact_id = ?
        ORDER BY analysis_run_samples.phenotype, analysis_run_samples.sample_code
        """,
        (run_id, artifact_id),
    ).fetchall()
    return [dict(row) for row in rows]


def list_analysis_samples(
    run_key: str,
    *,
    artifact_key: str | None = None,
    phenotype: str | None = None,
    query: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(500, int(limit)))
    offset = max(0, int(offset))
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        params: list[Any] = [run["id"]]
        join = ""
        where = ["analysis_run_samples.analysis_run_id = ?"]
        if artifact_key:
            artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
            join = (
                "JOIN analysis_artifact_samples ON "
                "analysis_artifact_samples.run_sample_id = analysis_run_samples.id"
            )
            where.append("analysis_artifact_samples.artifact_id = ?")
            params.append(artifact["id"])
        if phenotype:
            normalized_group = phenotype.upper()
            if normalized_group not in {"AD", "NC"}:
                raise AnalysisScopeError("phenotype must be AD or NC")
            where.append("analysis_run_samples.phenotype = ?")
            params.append(normalized_group)
        if query:
            where.append("LOWER(analysis_run_samples.sample_code) LIKE ?")
            params.append(f"%{query.strip().lower()}%")

        where_sql = " AND ".join(where)
        total_row = conn.execute(
            f"SELECT COUNT(*) AS value FROM analysis_run_samples {join} WHERE {where_sql}",
            tuple(params),
        ).fetchone()
        rows = conn.execute(
            f"""
            SELECT analysis_run_samples.sample_code, analysis_run_samples.phenotype,
                   analysis_run_samples.cohort_key, analysis_run_samples.source_study,
                   analysis_run_samples.metadata_json
            FROM analysis_run_samples {join}
            WHERE {where_sql}
            ORDER BY analysis_run_samples.phenotype, analysis_run_samples.sample_code
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        ).fetchall()

    items = []
    for row in rows:
        metadata = _loads(row["metadata_json"], {})
        items.append(
            {
                "sampleCode": row["sample_code"],
                "phenotype": row["phenotype"],
                "cohortKey": row["cohort_key"],
                "sourceStudy": row["source_study"],
                "metadata": metadata,
            }
        )
    return {
        "runKey": run_key,
        "artifactKey": artifact_key,
        "items": items,
        "total": int(total_row["value"]),
        "limit": limit,
        "offset": offset,
    }


def list_scoped_analysis_samples(
    run_key: str,
    artifact_key: str,
    scope: AnalysisScope,
    *,
    query: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Page sample metadata for the exact scope without loading abundance values."""

    limit = max(1, min(500, int(limit)))
    offset = max(0, int(offset))
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
        available = _artifact_samples(conn, int(run["id"]), int(artifact["id"]))
        selected = _select_scope_samples(available, scope)

    needle = (query or "").strip().casefold()
    if needle:
        selected = [
            sample
            for sample in selected
            if needle in str(sample.get("sample_code") or "").casefold()
        ]

    group_counts: dict[str, int] = defaultdict(int)
    for sample in selected:
        group_counts[str(sample.get("phenotype") or "unknown")] += 1

    page = selected[offset: offset + limit]
    items = [
        {
            "sampleCode": sample.get("sample_code") or "",
            "phenotype": sample.get("phenotype") or "",
            "cohortKey": sample.get("cohort_key") or "",
            "sourceStudy": sample.get("source_study") or "",
            "metadata": _loads(sample.get("metadata_json"), {}),
        }
        for sample in page
    ]
    available_fields = ["sampleCode", "phenotype"]
    if any(str(sample.get("source_study") or "").strip() for sample in selected):
        available_fields.append("sourceStudy")
    return {
        "runKey": run_key,
        "artifactKey": artifact_key,
        "items": items,
        "total": len(selected),
        "limit": limit,
        "offset": offset,
        "groupCounts": dict(group_counts),
        "availableFields": available_fields,
    }


def get_analysis_sample(run_key: str, sample_code: str) -> dict[str, Any] | None:
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        sample = conn.execute(
            """
            SELECT id, sample_code, phenotype, cohort_key, source_study, metadata_json
            FROM analysis_run_samples
            WHERE analysis_run_id = ? AND sample_code = ?
            """,
            (run["id"], sample_code),
        ).fetchone()
        if sample is None:
            return None
        artifacts = conn.execute(
            """
            SELECT analysis_artifacts.artifact_key, analysis_artifacts.artifact_type,
                   datasets.feature_kind, datasets.feature_label
            FROM analysis_artifact_samples
            JOIN analysis_artifacts
              ON analysis_artifacts.id = analysis_artifact_samples.artifact_id
            LEFT JOIN datasets ON datasets.id = analysis_artifacts.dataset_id
            WHERE analysis_artifact_samples.run_sample_id = ?
            ORDER BY analysis_artifacts.id
            """,
            (sample["id"],),
        ).fetchall()
    return {
        "runKey": run_key,
        "sampleCode": sample["sample_code"],
        "phenotype": sample["phenotype"],
        "cohortKey": sample["cohort_key"],
        "sourceStudy": sample["source_study"],
        "metadata": _loads(sample["metadata_json"], {}),
        "artifacts": [
            {
                "key": row["artifact_key"],
                "type": row["artifact_type"],
                "featureKind": row["feature_kind"],
                "featureLabel": row["feature_label"],
            }
            for row in artifacts
        ],
    }


def _select_scope_samples(
    available: list[dict[str, Any]], scope: AnalysisScope
) -> list[dict[str, Any]]:
    by_code = {str(sample["sample_code"]): sample for sample in available}
    if scope.mode == "cohort":
        selected = available
    elif scope.mode == "group":
        selected = [sample for sample in available if sample["phenotype"] == scope.groups[0]]
    else:
        missing = [code for code in scope.sampleCodes if code not in by_code]
        if missing:
            preview = ", ".join(missing[:5])
            raise AnalysisScopeError(f"Samples are not covered by this artifact: {preview}")
        selected = [by_code[code] for code in scope.sampleCodes]
    if not selected:
        raise AnalysisScopeError("The selected scope contains no artifact-covered samples")
    return selected


def _sample_std(total: float, sum_squares: float, count: int) -> float:
    if count <= 1:
        return 0.0
    variance = max(0.0, (sum_squares - (total * total) / count) / (count - 1))
    return math.sqrt(variance)


def _series_for_scope(selected: list[dict[str, Any]], scope: AnalysisScope) -> list[dict[str, Any]]:
    group_counts: dict[str, int] = defaultdict(int)
    for sample in selected:
        group_counts[str(sample["phenotype"])] += 1

    if scope.mode == "sample":
        sample = selected[0]
        key = str(sample["sample_code"])
        return [{"key": key, "label": key, "group": sample["phenotype"], "color": SERIES_COLORS[sample["phenotype"]]}]

    return [
        {"key": group, "label": f"{group} 均值", "group": group, "color": SERIES_COLORS[group]}
        for group in ("AD", "NC")
        if group_counts.get(group)
    ]


def _abundance_aggregates(
    conn,
    artifact,
    series_sample_ids: dict[str, tuple[int, ...]],
):
    rows = []
    for series_key, sample_ids in series_sample_ids.items():
        placeholders = ", ".join("?" for _ in sample_ids)
        params: tuple[Any, ...] = (
            series_key,
            artifact["dataset_revision_id"],
            *sample_ids,
        )
        if artifact["feature_kind"] == "taxonomy":
            result = conn.execute(
                f"""
                SELECT taxon_anno.canonical_name AS feature,
                       taxon_anno.full_taxonomy AS full_name,
                       ? AS series_key,
                       SUM(revision_species_abundance.abundance) AS total,
                       SUM(
                           revision_species_abundance.abundance
                           * revision_species_abundance.abundance
                       ) AS sum_squares
                FROM revision_species_abundance
                JOIN taxon_anno
                  ON taxon_anno.taxon_id = revision_species_abundance.taxon_id
                WHERE revision_species_abundance.revision_id = ?
                  AND revision_species_abundance.sample_id IN ({placeholders})
                GROUP BY revision_species_abundance.taxon_id,
                         taxon_anno.canonical_name,
                         taxon_anno.full_taxonomy
                """,
                params,
            ).fetchall()
        else:
            result = conn.execute(
                f"""
                SELECT revision_ko_abundance.ko_id AS feature,
                       revision_ko_abundance.ko_id AS full_name,
                       ? AS series_key,
                       SUM(revision_ko_abundance.abundance) AS total,
                       SUM(
                           revision_ko_abundance.abundance
                           * revision_ko_abundance.abundance
                       ) AS sum_squares
                FROM revision_ko_abundance
                WHERE revision_ko_abundance.revision_id = ?
                  AND revision_ko_abundance.sample_id IN ({placeholders})
                GROUP BY revision_ko_abundance.ko_id
                """,
                params,
            ).fetchall()
        rows.extend(result)
    return rows


def _revision_series_sample_ids(
    conn,
    artifact,
    selected: list[dict[str, Any]],
    scope: AnalysisScope,
) -> dict[str, tuple[int, ...]]:
    selected_codes = tuple(str(sample["sample_code"]) for sample in selected)
    placeholders = ", ".join("?" for _ in selected_codes)
    rows = conn.execute(
        f"""
        SELECT sample_id, sample_code, phenotype
        FROM revision_sample_info
        WHERE revision_id = ? AND sample_code IN ({placeholders})
        """,
        (artifact["dataset_revision_id"], *selected_codes),
    ).fetchall()
    by_code = {str(row["sample_code"]): row for row in rows}
    missing = [code for code in selected_codes if code not in by_code]
    if missing:
        preview = ", ".join(missing[:5])
        raise AnalysisScopeError(
            f"Samples are not available in the dataset revision: {preview}"
        )

    selected_by_code = {
        str(sample["sample_code"]): sample
        for sample in selected
    }
    grouped: dict[str, list[int]] = defaultdict(list)
    for code in selected_codes:
        row = by_code[code]
        expected_group = str(selected_by_code[code]["phenotype"])
        revision_group = str(row["phenotype"])
        if revision_group != expected_group:
            raise AnalysisScopeError(
                f"Sample phenotype differs between run and dataset revision: {code}"
            )
        key = code if scope.mode == "sample" else expected_group
        grouped[key].append(int(row["sample_id"]))
    return {key: tuple(sample_ids) for key, sample_ids in grouped.items()}


@lru_cache(maxsize=128)
def _compute_abundance_projection(
    run_key: str,
    artifact_key: str,
    mode: str,
    groups: tuple[str, ...],
    sample_codes: tuple[str, ...],
    top_n: int,
    ranking: str,
) -> dict[str, Any]:
    scope = AnalysisScope(mode=mode, groups=list(groups), sampleCodes=list(sample_codes))
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
        available = _artifact_samples(conn, int(run["id"]), int(artifact["id"]))
        selected = _select_scope_samples(available, scope)
        selected_codes = tuple(str(sample["sample_code"]) for sample in selected)
        series_sample_ids = _revision_series_sample_ids(conn, artifact, selected, scope)
        cache_path = _aggregate_cache_path(
            {
                "schemaVersion": "1.0",
                "runKey": run_key,
                "artifactKey": artifact_key,
                "revision": artifact["revision_key"],
                "scope": scope.model_dump(),
                "selectedSampleCodes": selected_codes,
                "ranking": ranking,
            }
        )
        cached_rows = _read_aggregate_cache(cache_path)
        if cached_rows is not None:
            rows = cached_rows
        else:
            rows = [
                dict(row)
                for row in _abundance_aggregates(conn, artifact, series_sample_ids)
            ]
            _write_aggregate_cache(cache_path, rows)

    series = _series_for_scope(selected, scope)
    series_keys = [item["key"] for item in series]
    series_counts: dict[str, int] = defaultdict(int)
    group_counts: dict[str, int] = defaultdict(int)
    for sample in selected:
        code = str(sample["sample_code"])
        group = str(sample["phenotype"])
        key = code if scope.mode == "sample" else group
        series_counts[key] += 1
        group_counts[group] += 1

    features: dict[str, dict[str, Any]] = {}
    for row in rows:
        feature = str(row["feature"])
        item = features.setdefault(
            feature,
            {
                "feature": feature,
                "fullName": str(row["full_name"] or feature),
                "aggregates": defaultdict(lambda: [0.0, 0.0]),
            },
        )
        key = str(row["series_key"])
        item["aggregates"][key][0] = float(row["total"] or 0.0)
        item["aggregates"][key][1] = float(row["sum_squares"] or 0.0)

    projected_items = []
    for item in features.values():
        values = {}
        score = 0.0
        for key in series_keys:
            total, sum_squares = item["aggregates"].get(key, (0.0, 0.0))
            count = series_counts[key]
            mean = total / count
            score += mean
            values[key] = {
                "mean": mean,
                "std": _sample_std(total, sum_squares, count),
                "sampleCount": count,
            }
        projected_items.append(
            {
                "feature": item["feature"],
                "fullName": item["fullName"],
                "rankValue": score,
                "values": values,
            }
        )

    projected_items.sort(key=lambda item: (-item["rankValue"], item["feature"]))
    source_feature_count = int(artifact["feature_count"] or len(projected_items))
    returned = projected_items[:top_n]
    projection_identity = {
        "runKey": run_key,
        "artifactKey": artifact_key,
        "revision": artifact["revision_key"],
        "scope": scope.model_dump(),
        "topN": top_n,
        "ranking": ranking,
    }
    projection_key = hashlib.sha256(
        json.dumps(projection_identity, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return {
        "projectionKey": projection_key,
        "runKey": run_key,
        "artifactKey": artifact_key,
        "datasetSlug": artifact["dataset_slug"],
        "datasetRevision": artifact["revision_key"],
        "featureKind": artifact["feature_kind"],
        "featureLabel": artifact["feature_label"],
        "scope": scope.model_dump(),
        "series": series,
        "items": returned,
        "projection": {
            "kind": "top_n_abundance",
            "ranking": ranking,
            "aggregation": "sample_value" if scope.mode == "sample" else "mean_by_group",
            "sampleCount": len(selected),
            "groupCounts": dict(sorted(group_counts.items())),
            "sourceFeatureCount": source_feature_count,
            "nonzeroFeatureCount": len(projected_items),
            "returnedFeatureCount": len(returned),
            "truncatedFeatureCount": max(0, source_feature_count - len(returned)),
            "mergedFeatureCount": 0,
            "filters": [],
            "topN": top_n,
            "isComplete": len(returned) >= source_feature_count,
        },
    }


def project_abundance(
    run_key: str, artifact_key: str, request: AbundanceProjectionRequest
) -> dict[str, Any]:
    scope = request.scope
    return _compute_abundance_projection(
        run_key,
        artifact_key,
        scope.mode,
        tuple(scope.groups),
        tuple(scope.sampleCodes),
        request.topN,
        request.ranking,
    )
