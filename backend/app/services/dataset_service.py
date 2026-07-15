from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.core.config import BACKEND_ROOT, CACHE_ROOT, PUBLIC_CHART_TYPES
from app.core.database import connect

CHART_TYPE_ALIASES = {
    "sunburst": "taxonomy",
    "taxonomy_tree": "taxonomy",
    "lda": "differential_ko",
}
CACHE_METRICS = {"requests": 0, "hits": 0, "misses": 0, "errors": 0}


def cache_metrics() -> dict[str, int]:
    return dict(CACHE_METRICS)


def _loads(value: str, fallback):
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _row_get(row, key: str, fallback=None):
    try:
        return row[key]
    except (KeyError, IndexError):
        return fallback


def _dataset_payload(row, available_charts: list[str] | None = None) -> dict:
    payload = {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "description": row["description"],
        "sampleCount": row["sample_count"],
        "speciesCount": row["species_count"],
        "featureCount": _row_get(row, "feature_count", row["species_count"]),
        "featureKind": _row_get(row, "feature_kind", "taxonomy"),
        "featureLabel": _row_get(row, "feature_label", "物种"),
        "groupCounts": _loads(row["group_counts_json"], {}),
        "publishedAt": row["published_at"],
        "currentRevision": _row_get(row, "current_revision_key"),
        "analysisStatus": _row_get(row, "analysis_status", "exploratory_only"),
        "provenance": _loads(_row_get(row, "provenance_json", "{}"), {}),
    }
    if available_charts is not None:
        payload["availableArtifacts"] = available_charts
        payload["availableCharts"] = available_charts
    return payload


def _resolve_cache_path(raw_path: str) -> Path:
    path = Path(raw_path)
    candidates: list[Path] = []
    normalized_parts = tuple(part for part in raw_path.replace("\\", "/").split("/") if part)

    if path.is_absolute():
        candidates.append(path)
    else:
        candidates.append(BACKEND_ROOT / path)

    for index in range(len(normalized_parts) - 1):
        if normalized_parts[index : index + 2] == ("backend", "storage"):
            candidates.append(BACKEND_ROOT.joinpath(*normalized_parts[index + 1 :]))
            break

    allowed_roots = {CACHE_ROOT.resolve(), (BACKEND_ROOT / "storage" / "cache").resolve()}
    safe_candidates = []
    for candidate in candidates:
        resolved = candidate.resolve()
        if any(resolved == root or root in resolved.parents for root in allowed_roots):
            safe_candidates.append(resolved)
            if resolved.exists():
                return resolved
    if not safe_candidates:
        raise ValueError("Cache path escapes the configured cache root")
    return safe_candidates[-1]


def _dataset_select(where: str = "") -> str:
    return f"""
        SELECT datasets.*, dataset_revisions.revision_key AS current_revision_key
        FROM datasets
        LEFT JOIN dataset_revisions ON dataset_revisions.id = datasets.current_revision_id
        {where}
    """


def _public_artifacts(rows) -> list[str]:
    available = {
        CHART_TYPE_ALIASES.get(row["chart_type"], row["chart_type"])
        for row in rows
    }
    return sorted(chart_type for chart_type in available if chart_type in PUBLIC_CHART_TYPES)


def list_datasets() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            _dataset_select("WHERE datasets.status = 'published' ORDER BY datasets.published_at DESC, datasets.id DESC")
        ).fetchall()
        revision_charts = conn.execute(
            """
            SELECT datasets.id AS dataset_id, revision_chart_artifacts.chart_type
            FROM datasets
            JOIN revision_chart_artifacts
              ON revision_chart_artifacts.revision_id = datasets.current_revision_id
            WHERE datasets.status = 'published'
            """
        ).fetchall()
        legacy_charts = conn.execute(
            """
            SELECT datasets.id AS dataset_id, chart_artifacts.chart_type
            FROM datasets
            JOIN chart_artifacts ON chart_artifacts.dataset_id = datasets.id
            WHERE datasets.status = 'published' AND datasets.current_revision_id IS NULL
            """
        ).fetchall()
    charts_by_dataset: dict[int, list] = {}
    for chart in [*revision_charts, *legacy_charts]:
        charts_by_dataset.setdefault(int(chart["dataset_id"]), []).append(chart)
    return [
        _dataset_payload(row, available_charts=_public_artifacts(charts_by_dataset.get(int(row["id"]), [])))
        for row in rows
    ]


def get_dataset(slug: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            _dataset_select("WHERE datasets.slug = ? AND datasets.status = 'published'"),
            (slug,),
        ).fetchone()
        if row is None:
            return None
        if _row_get(row, "current_revision_id") is not None:
            charts = conn.execute(
                """
                SELECT chart_type FROM revision_chart_artifacts
                WHERE revision_id = ? ORDER BY chart_type
                """,
                (row["current_revision_id"],),
            ).fetchall()
        else:
            charts = conn.execute(
                """
                SELECT chart_type FROM chart_artifacts
                WHERE dataset_id = ? ORDER BY chart_type
                """,
                (row["id"],),
            ).fetchall()
    return _dataset_payload(row, available_charts=_public_artifacts(charts))


def _read_chart_record(slug: str, chart_type: str, revision_key: str | None = None):
    chart_type = CHART_TYPE_ALIASES.get(chart_type, chart_type)
    if chart_type not in PUBLIC_CHART_TYPES and chart_type != "summary":
        return None, "unsupported", None

    with connect() as conn:
        if revision_key is None:
            row = conn.execute(
                "SELECT * FROM datasets WHERE slug = ? AND status = 'published'",
                (slug,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT datasets.id, dataset_revisions.id AS current_revision_id
                FROM datasets
                JOIN dataset_revisions ON dataset_revisions.dataset_id = datasets.id
                WHERE datasets.slug = ? AND dataset_revisions.revision_key = ?
                  AND dataset_revisions.status = 'published'
                """,
                (slug, revision_key),
            ).fetchone()
        if row is None:
            return None, "dataset", None
        lookup_types = [chart_type]
        if chart_type == "taxonomy":
            lookup_types.extend(["taxonomy_tree", "sunburst"])
        elif chart_type == "taxonomy_sankey":
            lookup_types.append("taxonomy")
        elif chart_type == "differential_ko":
            lookup_types.append("lda")

        artifact = None
        for lookup_type in lookup_types:
            if _row_get(row, "current_revision_id") is not None:
                artifact = conn.execute(
                    """
                    SELECT cache_path, sha256, size_bytes, created_at
                    FROM revision_chart_artifacts
                    WHERE revision_id = ? AND chart_type = ?
                    """,
                    (row["current_revision_id"], lookup_type),
                ).fetchone()
            else:
                artifact = conn.execute(
                    """
                    SELECT * FROM chart_artifacts
                    WHERE dataset_id = ? AND chart_type = ?
                    """,
                    (row["id"], lookup_type),
                ).fetchone()
            if artifact is not None:
                break
        if artifact is None:
            CACHE_METRICS["misses"] += 1
            return None, "chart", None

    CACHE_METRICS["requests"] += 1
    try:
        path = _resolve_cache_path(artifact["cache_path"])
        encoded = path.read_bytes()
        expected_sha256 = _row_get(artifact, "sha256")
        actual_sha256 = hashlib.sha256(encoded).hexdigest()
        if expected_sha256 and actual_sha256 != expected_sha256:
            CACHE_METRICS["errors"] += 1
            return None, "cache", None
        metadata = {
            "etag": actual_sha256,
            "lastModified": _row_get(artifact, "created_at"),
            "sizeBytes": len(encoded),
        }
        payload = json.loads(encoded)
        CACHE_METRICS["hits"] += 1
        return payload, None, metadata
    except (OSError, ValueError, json.JSONDecodeError):
        CACHE_METRICS["errors"] += 1
        return None, "cache", None


def read_chart(slug: str, chart_type: str):
    payload, error, _ = _read_chart_record(slug, chart_type)
    return payload, error


def read_chart_with_metadata(slug: str, chart_type: str, revision_key: str | None = None):
    return _read_chart_record(slug, chart_type, revision_key)
