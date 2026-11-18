"""Lazy, exact-projection sample data for scientific figure review packages."""

from __future__ import annotations

from typing import Any

import numpy as np

from app.compute.charts.boxplot import _log10_abundance, _sqrt_abundance, boxplot_display
from app.core.database import connect
from app.domain.analysis_scope import BoxplotReviewRequest, ChartProjectionRequest
from app.services.analysis_projection_service import (
    _artifact_samples,
    _resolve_artifact,
    _resolve_run,
    _select_scope_samples,
)
from app.services.chart_projection_service import _load_scoped_dataframe, project_chart


class BoxplotReviewMismatch(ValueError):
    pass


def get_boxplot_review_data(run_key: str, artifact_key: str, request: BoxplotReviewRequest) -> dict[str, Any]:
    projection = project_chart(run_key, artifact_key, "boxplot", ChartProjectionRequest(
        scope=request.scope, topN=request.topN, parameters=request.parameters, selection=request.selection,
    ))
    if projection["projectionKey"] != request.projectionKey:
        raise BoxplotReviewMismatch("图表与导出参数不一致，请等待图表更新后重新导出。")
    items = projection["payload"]["items"]
    features = [item["fullName"] for item in items]
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
        if artifact["revision_key"] != projection["datasetRevision"]:
            raise BoxplotReviewMismatch("数据版本已经变化，请刷新图表后重新导出。")
        available = _artifact_samples(conn, int(run["id"]), int(artifact["id"]))
        selected = _select_scope_samples(available, request.scope)
        frame, _ = _load_scoped_dataframe(conn, artifact, selected, request.scope, selected_features=features)
    multiplier, _ = boxplot_display(frame.attrs.get("abundance_scale", "unknown"))
    def serial_values(values):
        return [float(value) if np.isfinite(value) else None for value in values]

    exported_items = []
    for item in items:
        stored = frame[item["fullName"]].to_numpy(dtype=float)
        raw = stored * multiplier
        exported_items.append({"featureId": item["featureId"], "storedValues": serial_values(stored), "displayValues": {
            "raw": serial_values(raw), "sqrt": serial_values(_sqrt_abundance(raw)), "log": serial_values(_log10_abundance(raw)),
        }})
    return {
        "projectionKey": projection["projectionKey"],
        "samples": [{"sampleCode": str(row.Sample), "group": str(row.Group)}
                    for row in frame[["Sample", "Group"]].itertuples(index=False)],
        "items": exported_items,
        "displayMultiplier": multiplier,
    }
