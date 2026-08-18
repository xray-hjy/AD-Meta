"""Versioned audit details for browser chart projections.

The chart payload remains compact. This service verifies the immutable visible
projection, builds the chart-specific decision rows once, and stores them in a
queryable read model. Each chart family owns its scientific decision rows; the
API only standardizes identity, metadata, options and pagination.
"""

from __future__ import annotations

import hashlib
import json
import threading
from typing import Any

import pandas as pd

from app.compute.charts.ko_contribution import (
    compute_relative_series_values,
    rank_relative_contributions,
)
from app.compute.charts.ordination import prepare_pca_input, prepare_pcoa_input
from app.compute.charts.taxonomy.hierarchy import compute_taxonomy_hierarchy
from app.compute.taxonomy import short_name, taxonomy_chain
from app.core.config import COMPUTE_VERSION
from app.core.database import connect
from app.domain.analysis_scope import (
    AbundanceProjectionRequest,
    AuditProjectionKind,
    ChartProjectionRequest,
    ProjectionAuditRequest,
)
from app.services.analysis_projection_service import (
    _artifact_samples,
    _resolve_artifact,
    _resolve_run,
    _select_scope_samples,
    project_abundance,
)
from app.services.chart_projection_service import (
    _compute_payload,
    _load_scoped_dataframe,
    _resolve_projection_parameters,
    _series_values,
    project_chart,
)
from app.services.projection_audit_repository import (
    AUDIT_SCHEMA_VERSION,
    AuditArtifactIdentity,
    begin_audit_artifact,
    complete_audit_artifact,
    fail_audit_artifact,
    find_audit_artifact,
    load_audit_rows,
    query_audit_rows_page,
    query_distinct_row_values,
)


class ProjectionAuditMismatch(RuntimeError):
    """Raised when a detail request no longer describes the visible chart."""


_BUILD_LOCKS: dict[tuple[str, str], threading.Lock] = {}
_BUILD_LOCKS_GUARD = threading.Lock()


def _build_lock(projection_key: str, section: str) -> threading.Lock:
    key = (projection_key, section)
    with _BUILD_LOCKS_GUARD:
        return _BUILD_LOCKS.setdefault(key, threading.Lock())


SECTION_TITLE_TEMPLATES = {
    "selection": "展示与未展示{feature_label}",
    "contribution_selection": "展示与未展示 KO",
    "aggregation": "Other 合并明细",
    "feature_selection": "计算{feature_label}选择",
    "ordination_filter": "PCoA {feature_label}过滤",
    "statistical_filter": "统计筛选明细",
    "detection_filter": "检出与展示筛选",
    "hierarchy_aggregation": "层级合并明细",
    "sankey_layout": "桑基布局压缩",
}


def _section_title(section: str, projection: dict[str, Any]) -> str:
    feature_label = str(projection.get("featureLabel") or "物种")
    return SECTION_TITLE_TEMPLATES[section].format(feature_label=feature_label)

PRIMARY_SECTION = {
    "abundance": "selection",
    "composition": "aggregation",
    "ko_contribution": "contribution_selection",
    "boxplot": "feature_selection",
    "pca": "feature_selection",
    "pcoa": "ordination_filter",
    "heatmap": "statistical_filter",
    "detection": "detection_filter",
    "differential_ko": "statistical_filter",
    "taxonomy": "hierarchy_aggregation",
    "taxonomy_sankey": "hierarchy_aggregation",
}

COMMON_COLUMNS = {
    "selection": [
        {"key": "rank", "label": "排序", "sortable": True},
        {"key": "feature", "label": "物种", "labelRole": "feature", "sortable": True},
        {"key": "rankValue", "label": "排序值", "format": "number", "sortable": True},
        {"key": "status", "label": "处理结果", "format": "status"},
        {"key": "reason", "label": "原因", "format": "reason"},
    ],
    "aggregation": [
        {"key": "rank", "label": "排序", "sortable": True},
        {"key": "feature", "label": "类别", "sortable": True},
        {"key": "status", "label": "处理结果", "format": "status"},
        {"key": "destination", "label": "合并至"},
    ],
    "contribution_selection": [
        {"key": "rank", "label": "排序", "sortable": True},
        {"key": "feature", "label": "KO", "sortable": True},
        {"key": "rankValue", "label": "共享排序值", "format": "percent", "sortable": True},
        {"key": "status", "label": "处理结果", "format": "status"},
        {"key": "reason", "label": "原因", "format": "reason"},
    ],
    "feature_selection": [
        {"key": "rank", "label": "排序", "sortable": True},
        {"key": "feature", "label": "物种", "labelRole": "feature", "sortable": True},
        {"key": "total", "label": "范围内总丰度", "format": "number", "sortable": True},
        {"key": "coverage", "label": "累计覆盖", "format": "percent", "sortable": True},
        {"key": "status", "label": "计算状态", "format": "status"},
        {"key": "reason", "label": "原因", "format": "reason"},
    ],
    "ordination_filter": [
        {"key": "rank", "label": "排序", "sortable": True},
        {"key": "feature", "label": "物种", "labelRole": "feature", "sortable": True},
        {"key": "detectionSampleCount", "label": "达到阈值样本数", "format": "integer", "sortable": True},
        {"key": "prevalence", "label": "检出率", "format": "percent", "sortable": True},
        {"key": "meanRelativeAbundance", "label": "平均相对丰度", "format": "percent", "sortable": True},
        {"key": "maxRelativeAbundance", "label": "最大相对丰度", "format": "percent", "sortable": True},
        {"key": "status", "label": "计算状态", "format": "status"},
        {"key": "reason", "label": "原因", "format": "reason"},
    ],
    "statistical_filter": [
        {"key": "feature", "label": "物种", "labelRole": "feature", "sortable": True},
        {"key": "pValue", "label": "p", "format": "number", "sortable": True},
        {"key": "qValue", "label": "q", "format": "number", "sortable": True},
        {"key": "effectSize", "label": "效应量", "format": "number", "sortable": True},
        {"key": "log2FC", "label": "log2FC", "format": "number", "sortable": True},
        {"key": "status", "label": "处理结果", "format": "status"},
        {"key": "reason", "label": "原因", "format": "reason"},
    ],
    "detection_filter": [
        {"key": "feature", "label": "KO", "sortable": True},
        {"key": "adDetectionRate", "label": "AD 检出率", "format": "percent", "sortable": True},
        {"key": "ncDetectionRate", "label": "NC 检出率", "format": "percent", "sortable": True},
        {"key": "rateGap", "label": "检出率差", "format": "percent", "sortable": True},
        {"key": "status", "label": "处理结果", "format": "status"},
        {"key": "reason", "label": "原因", "format": "reason"},
    ],
    "hierarchy_aggregation": [
        {"key": "feature", "label": "原始物种", "sortable": True},
        {"key": "path", "label": "分类路径"},
        {"key": "total", "label": "范围内总丰度", "format": "number", "sortable": True},
        {"key": "status", "label": "处理结果", "format": "status"},
        {"key": "destination", "label": "展示节点/合并位置"},
        {"key": "reason", "label": "原因", "format": "reason"},
    ],
    "sankey_layout": [
        {"key": "path", "label": "桑基节点"},
        {"key": "rank", "label": "层级", "sortable": True},
        {"key": "value", "label": "丰度", "format": "number", "sortable": True},
        {"key": "mergedCount", "label": "合并节点数", "sortable": True},
        {"key": "reason", "label": "原因", "format": "reason"},
    ],
}

PCA_FEATURE_SELECTION_COLUMNS = [
    {"key": "rank", "label": "排序", "sortable": True},
    {"key": "feature", "label": "物种", "labelRole": "feature", "sortable": True},
    {
        "key": "meanRelativeAbundance",
        "label": "平均相对丰度",
        "format": "percent",
        "sortable": True,
    },
    {"key": "status", "label": "计算状态", "format": "status"},
    {"key": "reason", "label": "原因", "format": "reason"},
]


def _projection_for_request(
    run_key: str,
    artifact_key: str,
    kind: str,
    request: ProjectionAuditRequest,
) -> dict[str, Any]:
    if kind == "abundance":
        return project_abundance(
            run_key,
            artifact_key,
            AbundanceProjectionRequest(
                scope=request.scope,
                topN=request.topN,
                ranking=request.ranking,
            ),
        )
    return project_chart(
        run_key,
        artifact_key,
        kind,
        ChartProjectionRequest(
            scope=request.scope,
            topN=request.topN,
            parameters=request.parameters,
            selection=request.selection,
        ),
    )


def _context(run_key: str, artifact_key: str, request: ProjectionAuditRequest):
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
        available = _artifact_samples(conn, int(run["id"]), int(artifact["id"]))
        selected = _select_scope_samples(available, request.scope)
        frame, features = _load_scoped_dataframe(conn, artifact, selected, request.scope)
    return artifact, selected, frame, features


def _ranked_feature_rows(
    frame: pd.DataFrame,
    features: list[str],
    top_n: int,
    section: str,
    scope,
) -> list[dict[str, Any]]:
    if section == "selection":
        _, series_values = _series_values(frame, features, scope)
        scores = pd.Series(0.0, index=features)
        for values in series_values.values():
            scores = scores.add(values.reindex(features, fill_value=0.0), fill_value=0.0)
    else:
        scores = frame[features].sum(axis=0).astype(float)
    ordered = scores.sort_values(ascending=False, kind="stable")
    grand_total = float(ordered.sum()) or 1.0
    cumulative = 0.0
    rows = []
    for rank, (feature, value) in enumerate(ordered.items(), start=1):
        cumulative += float(value)
        rows.append({
            "rank": rank,
            "feature": short_name(str(feature)),
            "fullName": str(feature),
            "_featureKeys": [str(feature)],
            "rankValue": float(value),
            "total": float(value),
            "coverage": cumulative / grand_total,
            "status": "displayed" if rank <= top_n else "excluded",
            "reason": "within_top_n" if rank <= top_n else "outside_top_n",
        })
    return rows


def _composition_rows(frame, features, scope, top_n: int) -> list[dict[str, Any]]:
    series, series_values = _series_values(frame, features, scope)
    buckets: dict[str, dict[str, float]] = {}
    bucket_members: dict[str, list[str]] = {}
    for feature in features:
        label = short_name(feature) if frame.attrs["feature_kind"] == "ko" else taxonomy_chain(feature)["phylum"]
        target = buckets.setdefault(label, {item["key"]: 0.0 for item in series})
        bucket_members.setdefault(label, []).append(feature)
        for item in series:
            target[item["key"]] += float(series_values[item["key"]].get(feature, 0.0))
    for item in series:
        total = sum(bucket[item["key"]] for bucket in buckets.values()) or 1.0
        for bucket in buckets.values():
            bucket[item["key"]] /= total
    ordered = sorted(buckets, key=lambda label: (-sum(buckets[label].values()), label))
    rows = []
    for rank, label in enumerate(ordered, start=1):
        values = buckets[label]
        row = {
            "rank": rank,
            "feature": label,
            "_featureKeys": bucket_members[label],
            "values": values,
            "status": "displayed" if rank <= top_n else "merged",
            "destination": label if rank <= top_n else "Other",
            "reason": "within_top_n" if rank <= top_n else "category_top_n_aggregation",
        }
        for index, item in enumerate(series):
            row[f"series_{index}"] = values.get(item["key"])
        rows.append(row)
    return rows


def _ko_contribution_rows(
    frame,
    features,
    scope,
    top_n: int,
    projection_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    series = [
        {
            "key": str(item["key"]),
            "label": str(item["label"]),
            "group": str(item["group"]),
            "color": item.get("color"),
        }
        for item in projection_payload.get("series") or []
    ]
    series_values, _ = compute_relative_series_values(
        frame,
        features,
        series,
        sample_mode=scope.mode == "sample",
    )
    ordered = rank_relative_contributions(features, series_values)
    cumulative = {item["key"]: 0.0 for item in series}
    rows = []
    for rank, (feature, score) in enumerate(ordered.items(), start=1):
        row = {
            "rank": rank,
            "feature": str(feature),
            "fullName": str(feature),
            "_featureKeys": [str(feature)],
            "rankValue": float(score),
            "status": "displayed" if rank <= top_n else "excluded",
            "reason": "within_top_n" if rank <= top_n else "outside_top_n",
        }
        for index, item in enumerate(series):
            value = float(series_values[item["key"]].get(feature, 0.0))
            cumulative[item["key"]] += value
            row[f"series_{index}"] = value
            row[f"cumulative_{index}"] = cumulative[item["key"]]
        rows.append(row)
    return rows


def _taxonomy_rows(frame, features, tree: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals = frame[features].sum(axis=0).astype(float)

    def find_destination(path: list[str]) -> tuple[str, str]:
        children = tree
        visible_path: list[str] = []
        for label in path:
            exact = next((item for item in children if item.get("name") == label), None)
            if exact is not None:
                visible_path.append(label)
                children = exact.get("children") or []
                continue
            aggregate = next(
                (item for item in children if int(item.get("mergedCount", 0) or 0) > 0),
                None,
            )
            if aggregate is not None:
                return "merged", " > ".join([*visible_path, str(aggregate.get("name"))])
            return "excluded", " > ".join(visible_path) or "未进入非零层级树"
        return "displayed", " > ".join(visible_path)

    rows = []
    for feature in features:
        chain = taxonomy_chain(feature)
        path = [chain[rank] for rank in ("phylum", "class", "genus", "species")]
        status, destination = find_destination(path)
        rows.append({
            "feature": short_name(feature),
            "fullName": feature,
            "_featureKeys": [feature],
            "path": " > ".join(path),
            "total": float(totals.get(feature, 0.0)),
            "status": status,
            "destination": destination,
            "reason": "taxonomy_long_tail_aggregation" if status == "merged" else (
                "nonzero_visible_path" if status == "displayed" else "non_positive_or_unmapped"
            ),
        })
    rows.sort(key=lambda item: (-item["total"], item["feature"]))
    return rows


def _sankey_layout_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for node in payload.get("nodes") or []:
        merged_count = int(node.get("mergedCount", 0) or 0)
        if merged_count <= 0:
            continue
        path = " > ".join(
            part.split(":", 2)[-1]
            for part in str(node.get("name") or "").split("/")
        )
        rows.append({
            "path": path,
            "rank": node.get("rank"),
            "value": float(node.get("value", 0) or 0),
            "mergedCount": merged_count,
            "reason": "sankey_layout_projection",
        })
    rows.sort(key=lambda item: (-item["value"], item["path"]))
    return rows


def _statistical_rows(kind, frame, features, request) -> list[dict[str, Any]]:
    parameters = _resolve_projection_parameters(kind, request.parameters)
    payload = _compute_payload(
        kind,
        frame,
        features,
        request.scope,
        request.topN,
        parameters,
        include_audit=True,
    )
    feature_lookup: dict[str, str] = {}
    for feature in features:
        feature_lookup[feature] = feature
        feature_lookup[short_name(feature)] = feature
        feature_lookup[short_name(feature, max_len=10)] = feature
    rows = []
    for item in payload.get("_auditRows") or []:
        row = dict(item)
        row["feature"] = row.get("koId") or row.get("col") or row.get("fullName") or ""
        feature_key = feature_lookup.get(str(row.get("fullName") or row["feature"]))
        if feature_key:
            row["_featureKeys"] = [feature_key]
        row.pop("idx", None)
        rows.append(row)
    return rows


def _pcoa_filter_rows(frame, features, request) -> list[dict[str, Any]]:
    parameters = _resolve_projection_parameters("pcoa", request.parameters)
    prepared = prepare_pcoa_input(
        frame,
        features,
        str(parameters["filterPreset"]),
    )
    return [dict(row) for row in prepared["auditRows"]]


def _rows_for_section(kind, section, selected, frame, features, projection, request):
    if kind == "abundance":
        return _ranked_feature_rows(frame, features, request.topN, "selection", request.scope)
    if kind == "composition":
        return _composition_rows(frame, features, request.scope, request.topN)
    if kind == "ko_contribution":
        return _ko_contribution_rows(
            frame,
            features,
            request.scope,
            request.topN,
            projection.get("payload") or {},
        )
    if kind == "boxplot":
        rows = _ranked_feature_rows(frame, features, request.topN, "feature_selection", request.scope)
        if request.selection and request.selection.mode == "explicit":
            selected_ids = set(request.selection.featureIds)
            id_by_name = frame.attrs.get("feature_id_by_name") or {}
            for row in rows:
                selected_row = str(id_by_name.get(row["fullName"], row["fullName"])) in selected_ids
                row["status"] = "displayed" if selected_row else "excluded"
                row["reason"] = "explicit_selection" if selected_row else "not_selected"
        elif request.selection and request.selection.mode == "ranked":
            for row in rows:
                selected_row = row["rank"] <= request.selection.limit
                row["status"] = "displayed" if selected_row else "excluded"
                row["reason"] = "within_top_n" if selected_row else "outside_top_n"
        return rows
    if kind == "pca":
        prepared = prepare_pca_input(
            frame, features, request.topN, include_audit=True,
        )
        return [dict(row) for row in prepared["auditRows"]]
    if kind == "pcoa":
        return _pcoa_filter_rows(frame, features, request)
    if kind in {"heatmap", "detection", "differential_ko"}:
        return _statistical_rows(kind, frame, features, request)
    tree = compute_taxonomy_hierarchy(frame, features)
    if section == "sankey_layout":
        return _sankey_layout_rows(projection.get("payload") or {})
    return _taxonomy_rows(frame, features, tree)


def _section_keys(kind: str) -> list[str]:
    keys = [PRIMARY_SECTION[kind]]
    if kind == "taxonomy_sankey":
        keys.append("sankey_layout")
    return keys


def projection_audit_sections(kind: AuditProjectionKind) -> tuple[str, ...]:
    """Return the registered audit sections for one projection family."""

    return tuple(_section_keys(kind))


def _sample_scope_summary(selected: list[dict[str, Any]], request: ProjectionAuditRequest):
    group_counts: dict[str, int] = {}
    for sample in selected:
        group = str(sample.get("phenotype") or "unknown")
        group_counts[group] = group_counts.get(group, 0) + 1
    summary: dict[str, Any] = {
        "mode": request.scope.mode,
        "sampleCount": len(selected),
        "groupCounts": group_counts,
    }
    if request.scope.mode == "group":
        summary["group"] = request.scope.groups[0]
    elif request.scope.mode == "sample":
        summary["sampleCode"] = request.scope.sampleCodes[0]
    elif request.scope.mode == "subset":
        summary["selectedCodeCount"] = len(request.scope.sampleCodes)
    return summary


def _filter_rows(rows: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    needle = query.strip().casefold()
    if not needle:
        return rows
    return [
        row for row in rows
        if needle in " ".join(str(value) for value in row.values()).casefold()
    ]


def _sort_rows(
    rows: list[dict[str, Any]],
    sort_by: str,
    sort_direction: str,
    columns: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    sortable = {column["key"] for column in columns if column.get("sortable")}
    if not sort_by or sort_by not in sortable:
        return rows

    present = [row for row in rows if row.get(sort_by) not in (None, "")]
    missing = [row for row in rows if row.get(sort_by) in (None, "")]

    def sort_key(row: dict[str, Any]):
        value = row.get(sort_by)
        if isinstance(value, (int, float)):
            return (0, float(value))
        return (1, str(value).casefold())

    return sorted(
        present,
        key=sort_key,
        reverse=sort_direction == "desc",
    ) + missing


def _public_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if not key.startswith("_")}


def _columns_for_section(section: str, projection: dict[str, Any]) -> list[dict[str, Any]]:
    projection_kind = str((projection.get("projection") or {}).get("kind") or "")
    source_columns = (
        PCA_FEATURE_SELECTION_COLUMNS
        if section == "feature_selection" and projection_kind == "pca"
        else COMMON_COLUMNS[section]
    )
    columns = [dict(column) for column in source_columns]
    feature_label = str(projection.get("featureLabel") or "物种")
    for column in columns:
        if column.pop("labelRole", None) == "feature":
            column["label"] = feature_label
    if section not in {"aggregation", "contribution_selection"}:
        return columns
    series_columns = [
        {
            "key": f"series_{index}",
            "label": str(item.get("label") or item.get("key") or f"序列 {index + 1}"),
            "format": "percent",
        }
        for index, item in enumerate((projection.get("payload") or {}).get("series") or [])
    ]
    if section == "aggregation":
        return [*columns[:2], *series_columns, *columns[2:]]
    cumulative_columns = [
        {
            "key": f"cumulative_{index}",
            "label": f"{str(item.get('label') or item.get('key') or f'序列 {index + 1}')}累计覆盖",
            "format": "percent",
            "sortable": True,
        }
        for index, item in enumerate((projection.get("payload") or {}).get("series") or [])
    ]
    return [*columns[:3], *series_columns, *cumulative_columns, *columns[3:]]


def _canonical_rows_sha256(rows: list[dict[str, Any]]) -> str:
    payload = json.dumps(
        rows,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=lambda item: item.item() if hasattr(item, "item") else str(item),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _resolve_identity(
    run_key: str,
    artifact_key: str,
    kind: AuditProjectionKind,
    projection_key: str,
    section: str,
) -> AuditArtifactIdentity:
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
    return AuditArtifactIdentity(
        run_id=int(run["id"]),
        source_artifact_id=int(artifact["id"]),
        projection_key=projection_key,
        projection_kind=kind,
        section_key=section,
        source_revision_key=str(artifact["revision_key"]),
        compute_version=COMPUTE_VERSION,
        schema_version=AUDIT_SCHEMA_VERSION,
    )


def _ensure_projection_audit_artifact(
    run_key: str,
    artifact_key: str,
    kind: AuditProjectionKind,
    request: ProjectionAuditRequest,
) -> tuple[dict[str, Any], dict[str, Any]]:
    projection = _projection_for_request(run_key, artifact_key, kind, request)
    if projection["projectionKey"] != request.projectionKey:
        raise ProjectionAuditMismatch(
            "当前图表参数已经变化，请等待图表更新后重新展开筛选与合并明细。"
        )

    section_keys = _section_keys(kind)
    section = request.section if request.section in section_keys else section_keys[0]
    identity = _resolve_identity(
        run_key,
        artifact_key,
        kind,
        request.projectionKey,
        section,
    )
    existing = find_audit_artifact(identity)
    if existing is not None and existing.get("status") == "ready":
        return projection, existing

    with _build_lock(request.projectionKey, section):
        existing = find_audit_artifact(identity)
        if existing is not None and existing.get("status") == "ready":
            return projection, existing

        audit_artifact_id = begin_audit_artifact(identity)
        try:
            _, selected, frame, features = _context(run_key, artifact_key, request)
            rows = _rows_for_section(
                kind,
                section,
                selected,
                frame,
                features,
                projection,
                request,
            )
            projection_metadata = projection.get("projection") or {}
            metadata = {
                "projectionKey": request.projectionKey,
                "kind": kind,
                "section": section,
                "summary": {
                    "sampleCount": projection_metadata.get("sampleCount"),
                    "sourceFeatureCount": projection_metadata.get("sourceFeatureCount"),
                    "returnedFeatureCount": projection_metadata.get("returnedFeatureCount"),
                    "mergedFeatureCount": projection_metadata.get("mergedFeatureCount", 0),
                    "truncatedFeatureCount": projection_metadata.get("truncatedFeatureCount", 0),
                    "filters": projection_metadata.get("filters") or [],
                    "topN": projection_metadata.get("topN", request.topN),
                    "topNRole": projection_metadata.get("topNRole"),
                    "isComplete": bool(projection_metadata.get("isComplete")),
                    "featureSelection": projection_metadata.get("featureSelection"),
                    "preprocessing": projection_metadata.get("preprocessing"),
                    "inference": projection_metadata.get("inference"),
                },
                "sampleScope": _sample_scope_summary(selected, request),
                "sections": [
                    {
                        "key": key,
                        "title": _section_title(key, projection),
                        "total": len(rows) if key == section else None,
                    }
                    for key in section_keys
                ],
                "columns": _columns_for_section(section, projection),
                "provenance": {
                    "sourceRevisionKey": identity.source_revision_key,
                    "computeVersion": identity.compute_version,
                    "schemaVersion": identity.schema_version,
                },
            }
            complete_audit_artifact(
                audit_artifact_id,
                rows=rows,
                metadata=metadata,
                sha256=_canonical_rows_sha256(rows),
            )
        except Exception as exc:
            fail_audit_artifact(audit_artifact_id, exc)
            raise

        built = find_audit_artifact(identity)
        if built is None or built.get("status") != "ready":
            raise RuntimeError("Projection audit artifact did not reach ready state")
        return projection, built


def get_projection_audit_metadata(
    run_key: str,
    artifact_key: str,
    kind: AuditProjectionKind,
    request: ProjectionAuditRequest,
) -> dict[str, Any]:
    _, artifact = _ensure_projection_audit_artifact(
        run_key,
        artifact_key,
        kind,
        request,
    )
    metadata = dict(artifact.get("metadata") or {})
    metadata["artifact"] = {
        "status": artifact.get("status"),
        "rowCount": int(artifact.get("row_count") or 0),
        "sha256": artifact.get("sha256") or "",
        "storageUri": artifact.get("storage_uri") or "",
        "completedAt": artifact.get("completed_at"),
        **(metadata.get("provenance") or {}),
    }
    return metadata


def _selected_samples_for_request(
    run_key: str,
    artifact_key: str,
    request: ProjectionAuditRequest,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
        available = _artifact_samples(conn, int(run["id"]), int(artifact["id"]))
        selected = _select_scope_samples(available, request.scope)
    return dict(artifact), selected


def get_projection_audit_options(
    run_key: str,
    artifact_key: str,
    kind: AuditProjectionKind,
    request: ProjectionAuditRequest,
    field: str,
    *,
    query: str = "",
    limit: int = 200,
    offset: int = 0,
    recommend_displayed: bool = True,
) -> dict[str, Any]:
    _, audit_artifact = _ensure_projection_audit_artifact(
        run_key,
        artifact_key,
        kind,
        request,
    )
    normalized_query = query.strip()
    safe_limit = max(1, min(500, int(limit)))
    safe_offset = max(0, int(offset))
    is_feature_recommendation = False
    if field == "sample":
        _, selected = _selected_samples_for_request(run_key, artifact_key, request)
        options = [
            {
                "value": str(sample.get("sample_code") or ""),
                "label": str(sample.get("sample_code") or ""),
                "group": str(sample.get("phenotype") or ""),
            }
            for sample in selected
            if sample.get("sample_code")
        ]
        if normalized_query:
            needle = normalized_query.casefold()
            options = [
                option
                for option in options
                if needle in option["label"].casefold()
                or needle in option["group"].casefold()
            ]
        total = len(options)
        options = options[safe_offset:safe_offset + safe_limit]
        mode = "search_results" if normalized_query else "options"
    else:
        is_feature_recommendation = (
            recommend_displayed and field == "feature" and not normalized_query
        )
        values, total = query_distinct_row_values(
            int(audit_artifact["id"]),
            field,
            query=query,
            limit=safe_limit,
            offset=safe_offset,
            # The unopened feature chooser recommends only values that are
            # genuinely present in the visible chart. A typed search always
            # ranges across the complete audit source.
            prioritize_displayed=is_feature_recommendation,
            displayed_only=is_feature_recommendation,
        )
        options = [{"value": value, "label": value} for value in values]
        mode = "recommended" if is_feature_recommendation else (
            "search_results" if normalized_query else "options"
        )
    summary = (audit_artifact.get("metadata") or {}).get("summary") or {}
    return {
        "projectionKey": request.projectionKey,
        "section": (audit_artifact.get("metadata") or {}).get("section"),
        "field": field,
        "items": options,
        "limit": safe_limit,
        "offset": safe_offset,
        "query": normalized_query,
        "total": total,
        "hasMore": safe_offset + len(options) < total,
        "mode": mode,
        "initialOrder": (
            "displayed_then_rank"
            if is_feature_recommendation
            else "search_results"
        ),
        "sourceFeatureCount": summary.get("sourceFeatureCount"),
    }


def _sample_nonzero_features(
    run_key: str,
    artifact_key: str,
    request: ProjectionAuditRequest,
    sample_code: str,
) -> set[str]:
    artifact, selected = _selected_samples_for_request(run_key, artifact_key, request)
    if sample_code not in {str(sample.get("sample_code")) for sample in selected}:
        return set()
    with connect() as conn:
        sample = conn.execute(
            """
            SELECT sample_id FROM revision_sample_info
            WHERE revision_id = ? AND sample_code = ?
            """,
            (artifact["dataset_revision_id"], sample_code),
        ).fetchone()
        if sample is None:
            return set()
        if artifact["feature_kind"] == "taxonomy":
            rows = conn.execute(
                """
                SELECT taxon_anno.full_taxonomy AS feature
                FROM revision_species_abundance
                JOIN taxon_anno
                  ON taxon_anno.taxon_id = revision_species_abundance.taxon_id
                WHERE revision_species_abundance.revision_id = ?
                  AND revision_species_abundance.sample_id = ?
                  AND revision_species_abundance.abundance > 0
                """,
                (artifact["dataset_revision_id"], sample["sample_id"]),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT ko_id AS feature
                FROM revision_ko_abundance
                WHERE revision_id = ? AND sample_id = ? AND abundance > 0
                """,
                (artifact["dataset_revision_id"], sample["sample_id"]),
            ).fetchall()
    return {str(row["feature"]) for row in rows}


def query_projection_audit_rows(
    run_key: str,
    artifact_key: str,
    kind: AuditProjectionKind,
    request: ProjectionAuditRequest,
) -> dict[str, Any]:
    _, audit_artifact = _ensure_projection_audit_artifact(
        run_key,
        artifact_key,
        kind,
        request,
    )
    metadata = audit_artifact.get("metadata") or {}
    repository_filters = {
        key: value
        for key, value in request.filters.items()
        if key in {"feature", "status", "reason"}
    }
    sample_code = str(request.filters.get("sample") or "").strip()
    repository_page = None
    if not sample_code and not request.query.strip():
        repository_page = query_audit_rows_page(
            int(audit_artifact["id"]),
            filters=repository_filters,
            sort_by=request.sortBy,
            sort_direction=request.sortDirection,
            limit=request.limit,
            offset=request.offset,
        )

    if repository_page is not None:
        page_rows, total = repository_page
        page = [_public_row(row) for row in page_rows]
    else:
        rows = load_audit_rows(
            int(audit_artifact["id"]),
            filters=repository_filters,
        )
        rows = _filter_rows(rows, request.query)
    if sample_code and repository_page is None:
        nonzero = _sample_nonzero_features(
            run_key,
            artifact_key,
            request,
            sample_code,
        )
        rows = [
            row
            for row in rows
            if any(feature in nonzero for feature in row.get("_featureKeys") or [])
        ]
    columns = metadata.get("columns") or []
    if repository_page is None:
        rows = _sort_rows(rows, request.sortBy, request.sortDirection, columns)
        total = len(rows)
        page = [
            _public_row(row)
            for row in rows[request.offset: request.offset + request.limit]
        ]
    return {
        "projectionKey": request.projectionKey,
        "kind": kind,
        "section": metadata.get("section"),
        "columns": columns,
        "items": page,
        "total": total,
        "limit": request.limit,
        "offset": request.offset,
    }


def get_projection_audit(
    run_key: str,
    artifact_key: str,
    kind: AuditProjectionKind,
    request: ProjectionAuditRequest,
) -> dict[str, Any]:
    """Compatibility response assembled from the versioned read model APIs."""

    metadata = get_projection_audit_metadata(
        run_key,
        artifact_key,
        kind,
        request,
    )
    page = query_projection_audit_rows(
        run_key,
        artifact_key,
        kind,
        request,
    )
    filter_options = {
        field: get_projection_audit_options(
            run_key,
            artifact_key,
            kind,
            request,
            field,
            limit=500,
            recommend_displayed=False,
        )["items"]
        for field in ("feature", "sample", "status", "reason")
    }
    return {
        **metadata,
        **page,
        "filterOptions": filter_options,
    }


__all__ = [
    "ProjectionAuditMismatch",
    "get_projection_audit",
    "get_projection_audit_metadata",
    "get_projection_audit_options",
    "projection_audit_sections",
    "query_projection_audit_rows",
]
