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


def _dataset_payload(row, available_charts: list[str] | None = None) -> dict:
    payload = {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "description": row["description"],
        "sampleCount": row["sample_count"],
        "speciesCount": row["species_count"],
        "groupCounts": _loads(row["group_counts_json"], {}),
        "publishedAt": row["published_at"],
    }
    if available_charts is not None:
        payload["availableCharts"] = available_charts
    return payload


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

    path = Path(artifact["cache_path"])
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except OSError:
        return None, "cache"
