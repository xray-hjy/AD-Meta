"""Immutable revision endpoints for paired DiTing functional outputs."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.database import connect
from app.services.dataset_service import _resolve_cache_path

router = APIRouter(prefix="/api/datasets/{slug}/revisions/{revision}/diting", tags=["DiTing"])


def _artifact(slug: str, revision: str):
    with connect() as conn:
        row = conn.execute("""
            SELECT a.cache_path, a.sha256 FROM revision_chart_artifacts a
            JOIN dataset_revisions r ON r.id = a.revision_id
            JOIN datasets d ON d.id = r.dataset_id
            WHERE d.slug = ? AND r.revision_key = ? AND r.status = 'published'
              AND a.chart_type = 'diting_pathways'
        """, (slug, revision)).fetchone()
    if row is None:
        raise HTTPException(404, "该分析版本未附带 DiTing 通路数据，请选择含 DiTing 结果的分析批次。")
    path = _resolve_cache_path(row["cache_path"])
    if not path.is_file():
        raise HTTPException(503, "通路结果文件暂不可用。")
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != row["sha256"]:
        raise HTTPException(503, "通路结果校验失败。")
    return path, json.loads(content)


@router.get("/pathways")
def pathways(slug: str, revision: str) -> dict:
    _, payload = _artifact(slug, revision)
    return payload


@router.get("/download/{kind}")
def download(slug: str, revision: str, kind: str):
    path, payload = _artifact(slug, revision)
    choices = {
        "pathways": ("pathways_relative_abundance.tab", payload["preprocessing"]["pathwaySha256"]),
        "ko": ("raw.tab", payload["koSourceSha256"]),
    }
    if kind not in choices:
        raise HTTPException(404, "Unknown DiTing source table")
    filename, digest = choices[kind]
    source: Path = path.parent / filename
    if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != digest:
        raise HTTPException(503, "原始表校验失败。")
    return FileResponse(source, media_type="text/tab-separated-values", filename=(
        "ko_abundance_among_samples.tab" if kind == "ko" else filename))
