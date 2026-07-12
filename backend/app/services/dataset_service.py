from __future__ import annotations

import json
from pathlib import Path

from app.core.config import BACKEND_ROOT, PUBLIC_CHART_TYPES
from app.core.database import connect, init_db


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

    if path.is_absolute():
        candidates.append(path)
        parts = path.parts
        for index in range(len(parts) - 1):
            if parts[index] == "backend" and parts[index + 1] == "storage":
                candidates.append(BACKEND_ROOT.joinpath(*parts[index + 1 :]))
                break
    else:
        candidates.append(BACKEND_ROOT / path)

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
    available = [chart["chart_type"] for chart in charts if chart["chart_type"] in PUBLIC_CHART_TYPES]
    return _dataset_payload(row, available_charts=available)


def read_chart(slug: str, chart_type: str):
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
        artifact = conn.execute(
            """
            SELECT cache_path FROM chart_artifacts
            WHERE dataset_id = ? AND chart_type = ?
            """,
            (row["id"], chart_type),
        ).fetchone()
        if artifact is None:
            return None, "chart"

    path = _resolve_cache_path(artifact["cache_path"])
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except OSError:
        return None, "cache"
