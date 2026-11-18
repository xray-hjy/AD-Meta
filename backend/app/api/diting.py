"""Immutable revision endpoints for paired DiTing functional outputs."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.database import connect
from app.domain.analysis_scope import AnalysisScope
from app.services.dataset_service import _resolve_cache_path
from app.services.function_exploration_service import exploration_snapshot

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




class FunctionExplorationRequest(BaseModel):
    scope: AnalysisScope = Field(default_factory=AnalysisScope)
    prevalenceMin: float = Field(default=0.1, ge=0, le=1)
    kind: Literal['ko', 'pathway'] = 'ko'
    feature: str | None = Field(default=None, max_length=1000)


@router.post('/exploration')
def exploration(slug: str, revision: str, request: FunctionExplorationRequest) -> dict:
    path, payload = _artifact(slug, revision)
    try:
        record, kos, pathways, km, pm, mapping = exploration_snapshot(
            str(path.parent), payload['koSourceSha256'], payload['preprocessing']['pathwaySha256'],
            payload['preprocessing']['sampleMetadataSha256'], request.scope.model_dump_json(), request.prevalenceMin)
    except (ValueError, OSError) as exc:
        raise HTTPException(422, str(exc)) from exc
    record = {**record, 'datasetRevision': revision}
    if request.feature is not None:
        rows, matrix = (kos, km) if request.kind == 'ko' else (pathways, pm)
        index = next((i for i, row in enumerate(rows) if row['id'] == request.feature), None)
        if index is None:
            raise HTTPException(404, '该修订中没有指定功能对象。')
        related = mapping if mapping and (request.feature == mapping['pathway'] if request.kind == 'pathway' else request.feature in mapping['kos']) else None
        return {'record': record, 'item': rows[index], 'values': matrix[index].tolist(), 'mapping': related}
    return {'record': record, 'kos': kos, 'pathways': pathways}
