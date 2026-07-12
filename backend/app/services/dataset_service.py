from __future__ import annotations

import json
from pathlib import Path

from app.core.config import BACKEND_ROOT, PUBLIC_CHART_TYPES
from app.core.database import connect, init_db

CHART_TYPE_ALIASES = {
    "sunburst": "taxonomy",
    "taxonomy_tree": "taxonomy",
}


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
    }
    if available_charts is not None:
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

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[-1]


def list_datasets() -> list[dict]:
    init_db()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM datasets
            WHERE status = 'published'
            ORDER BY published_at DESC, id DESC
            """
        ).fetchall()
    return [_dataset_payload(row) for row in rows]


def get_dataset(slug: str) -> dict | None:
    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM datasets WHERE slug = ? AND status = 'published'",
            (slug,),
        ).fetchone()
        if row is None:
            return None
        charts = conn.execute(
            """
            SELECT chart_type FROM chart_artifacts
            WHERE dataset_id = ?
            ORDER BY chart_type
            """,
            (row["id"],),
        ).fetchall()
    available_set = set()
    for chart in charts:
        chart_type = CHART_TYPE_ALIASES.get(chart["chart_type"], chart["chart_type"])
        if chart_type in PUBLIC_CHART_TYPES:
            available_set.add(chart_type)
    available = sorted(available_set)
    return _dataset_payload(row, available_charts=available)


def read_chart(slug: str, chart_type: str):
    chart_type = CHART_TYPE_ALIASES.get(chart_type, chart_type)
    if chart_type not in PUBLIC_CHART_TYPES and chart_type != "summary":
        return None, "unsupported"

    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM datasets WHERE slug = ? AND status = 'published'",
            (slug,),
        ).fetchone()
        if row is None:
            return None, "dataset"
        lookup_types = [chart_type]
        if chart_type == "taxonomy":
            lookup_types.extend(["taxonomy_tree", "sunburst"])
        elif chart_type == "taxonomy_sankey":
            lookup_types.append("taxonomy")

        artifact = None
        for lookup_type in lookup_types:
            artifact = conn.execute(
                """
                SELECT cache_path FROM chart_artifacts
                WHERE dataset_id = ? AND chart_type = ?
                """,
                (row["id"], lookup_type),
            ).fetchone()
            if artifact is not None:
                break
        if artifact is None:
            return None, "chart"

    path = _resolve_cache_path(artifact["cache_path"])
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except OSError:
        return None, "cache"
