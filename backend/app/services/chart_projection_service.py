from __future__ import annotations

import hashlib
import json
import uuid
from collections import Counter, OrderedDict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from threading import Lock, RLock
from typing import Any

import numpy as np
import pandas as pd

from app.compute.charts.boxplot import _box_summary, _log10_abundance
from app.compute.charts.detection import compute_detection_heatmap
from app.compute.charts.heatmap import compute_heatmap
from app.compute.charts.lda import compute_ko_differential
from app.compute.charts.ko_contribution import compute_ko_contribution
from app.compute.charts.ordination import compute_pca, compute_pcoa
from app.compute.charts.taxonomy.hierarchy import compute_taxonomy_hierarchy
from app.compute.charts.taxonomy.pruning import TAXONOMY_TREE_PRUNE_RULES
from app.compute.charts.taxonomy.projections import compute_taxonomy_sankey_projection
from app.compute.taxonomy import get_level, short_name
from app.core import database
from app.core.config import CACHE_ROOT, COMPUTE_VERSION
from app.core.database import connect
from app.domain.analysis_scope import AnalysisScope, ChartProjectionRequest, ProjectionKind
from app.domain.projection_policy import PROJECTION_POLICIES, ProjectionPolicy
from app.services.analysis_projection_service import (
    AnalysisScopeError,
    SERIES_COLORS,
    _artifact_samples,
    _resolve_artifact,
    _resolve_run,
    _revision_series_sample_ids,
    _select_scope_samples,
)


# Kept as a read-only compatibility view for callers that still inspect the old
# dictionary shape.  Validation below uses the typed policy objects.
PROJECTION_RULES: dict[str, dict[str, Any]] = {
    key: policy.as_legacy_rule() for key, policy in PROJECTION_POLICIES.items()
}

CHART_PROJECTION_CACHE_SCHEMA = "1.1"
REVISION_MATRIX_CACHE_SCHEMA = "1.0"
REVISION_MATRIX_CACHE_SIZE = 4


@dataclass(frozen=True)
class RevisionMatrixSnapshot:
    matrix: pd.DataFrame
    sample_by_id: dict[int, tuple[str, str]]
    features: tuple[str, ...]


_revision_matrix_cache: OrderedDict[tuple[int, str, str], RevisionMatrixSnapshot] = OrderedDict()
_revision_matrix_cache_lock = RLock()


@lru_cache(maxsize=128)
def _revision_matrix_build_lock(cache_key: tuple[int, str, str]) -> Lock:
    return Lock()


@lru_cache(maxsize=256)
def _projection_build_lock(cache_key: tuple[Any, ...]) -> Lock:
    return Lock()


def _projection_cache_path(identity: dict[str, Any]) -> Path | None:
    if database.DB_ENGINE != "mysql":
        return None
    digest = hashlib.sha256(
        json.dumps(identity, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return CACHE_ROOT / "projections" / "charts" / f"{digest}.json"


def _revision_matrix_cache_path(cache_key: tuple[int, str, str]) -> Path | None:
    if database.DB_ENGINE != "mysql":
        return None
    identity = {
        "schemaVersion": REVISION_MATRIX_CACHE_SCHEMA,
        "revisionId": cache_key[0],
        "revisionKey": cache_key[1],
        "featureKind": cache_key[2],
    }
    digest = hashlib.sha256(
        json.dumps(identity, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return CACHE_ROOT / "projections" / "matrices" / f"{digest}.npz"


def _read_revision_matrix_cache(path: Path | None) -> RevisionMatrixSnapshot | None:
    if path is None:
        return None
    try:
        with np.load(path, allow_pickle=False) as payload:
            sample_ids = payload["sample_ids"].astype(np.int64).tolist()
            sample_codes = payload["sample_codes"].astype(str).tolist()
            phenotypes = payload["phenotypes"].astype(str).tolist()
            features = tuple(payload["features"].astype(str).tolist())
            values = payload["values"].astype(float, copy=False)
    except (FileNotFoundError, OSError, ValueError, KeyError):
        return None
    if values.shape != (len(sample_ids), len(features)):
        return None
    matrix = pd.DataFrame(values, index=sample_ids, columns=list(features))
    return RevisionMatrixSnapshot(
        matrix=matrix,
        sample_by_id={
            int(sample_id): (str(sample_code), str(phenotype))
            for sample_id, sample_code, phenotype in zip(
                sample_ids, sample_codes, phenotypes, strict=True
            )
        },
        features=features,
    )


def _write_revision_matrix_cache(
    path: Path | None,
    snapshot: RevisionMatrixSnapshot,
) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.stem}.{uuid.uuid4().hex}.tmp.npz")
    sample_ids = np.asarray(snapshot.matrix.index, dtype=np.int64)
    try:
        with temporary.open("wb") as handle:
            np.savez(
                handle,
                sample_ids=sample_ids,
                sample_codes=np.asarray(
                    [snapshot.sample_by_id[int(sample_id)][0] for sample_id in sample_ids]
                ),
                phenotypes=np.asarray(
                    [snapshot.sample_by_id[int(sample_id)][1] for sample_id in sample_ids]
                ),
                features=np.asarray(snapshot.features),
                values=snapshot.matrix.to_numpy(dtype=float, copy=False),
            )
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _read_projection_cache(path: Path | None) -> dict[str, Any] | None:
    if path is None:
        return None
    try:
        cached = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None
    if not isinstance(cached, dict):
        return None
    if cached.get("schemaVersion") != CHART_PROJECTION_CACHE_SCHEMA:
        return None
    payload = cached.get("projection")
    return payload if isinstance(payload, dict) else None


def _write_projection_cache(path: Path | None, payload: dict[str, Any]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(
            json.dumps(
                {
                    "schemaVersion": CHART_PROJECTION_CACHE_SCHEMA,
                    "projection": payload,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _validate_projection(
    projection_kind: str,
    feature_kind: str,
    selected: list[dict[str, Any]],
    scope: AnalysisScope,
) -> dict[str, int]:
    policy = PROJECTION_POLICIES[projection_kind]
    if scope.mode not in policy.scopes:
        allowed = ", ".join(sorted(policy.scopes))
        raise AnalysisScopeError(
            f"{projection_kind} does not support {scope.mode} scope; allowed scopes: {allowed}"
        )
    expected_kind = policy.feature_kind
    if expected_kind and feature_kind != expected_kind:
        raise AnalysisScopeError(
            f"{projection_kind} requires a {expected_kind} artifact"
        )
    group_counts = Counter(str(sample["phenotype"]) for sample in selected)
    minimum = policy.min_per_group
    if minimum:
        missing = [group for group in ("AD", "NC") if group_counts.get(group, 0) < minimum]
        if missing:
            raise AnalysisScopeError(
                f"{projection_kind} requires at least {minimum} AD and {minimum} NC samples"
            )
    if len(selected) < policy.min_samples:
        raise AnalysisScopeError(
            f"{projection_kind} requires at least {policy.min_samples} samples"
        )
    return dict(sorted(group_counts.items()))


def _build_revision_matrix(artifact) -> RevisionMatrixSnapshot:
    revision_id = int(artifact["dataset_revision_id"])
    feature_kind = str(artifact["feature_kind"])
    with connect() as conn:
        if feature_kind == "taxonomy":
            rows = conn.execute(
                """
                SELECT revision_species_abundance.sample_id,
                       taxon_anno.full_taxonomy AS feature,
                       revision_species_abundance.abundance
                FROM revision_species_abundance
                JOIN taxon_anno ON taxon_anno.taxon_id = revision_species_abundance.taxon_id
                WHERE revision_species_abundance.revision_id = ?
                """,
                (revision_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT sample_id, ko_id AS feature, abundance
                FROM revision_ko_abundance
                WHERE revision_id = ?
                """,
                (revision_id,),
            ).fetchall()

        revision_rows = conn.execute(
            """
            SELECT sample_id, sample_code, phenotype
            FROM revision_sample_info
            WHERE revision_id = ?
            ORDER BY sample_id
            """,
            (revision_id,),
        ).fetchall()

    sample_by_id = {
        int(row["sample_id"]): (str(row["sample_code"]), str(row["phenotype"]))
        for row in revision_rows
    }
    all_sample_ids = list(sample_by_id)
    if rows:
        long_frame = pd.DataFrame(
            [
                (int(row["sample_id"]), str(row["feature"]), float(row["abundance"]))
                for row in rows
            ],
            columns=["sample_id", "feature", "abundance"],
        )
        matrix = long_frame.pivot_table(
            index="sample_id",
            columns="feature",
            values="abundance",
            aggfunc="sum",
            fill_value=0.0,
        )
    else:
        matrix = pd.DataFrame(index=all_sample_ids)
    matrix = matrix.reindex(all_sample_ids, fill_value=0.0)
    return RevisionMatrixSnapshot(
        matrix=matrix,
        sample_by_id=sample_by_id,
        features=tuple(str(column) for column in matrix.columns),
    )


def _revision_matrix(artifact) -> RevisionMatrixSnapshot:
    cache_key = (
        int(artifact["dataset_revision_id"]),
        str(artifact["revision_key"]),
        str(artifact["feature_kind"]),
    )
    with _revision_matrix_cache_lock:
        cached = _revision_matrix_cache.get(cache_key)
        if cached is not None:
            _revision_matrix_cache.move_to_end(cache_key)
            return cached

    # Revision matrices are immutable. Serializing only identical cold builds
    # prevents duplicate multi-million-row reads without blocking other revisions.
    with _revision_matrix_build_lock(cache_key):
        with _revision_matrix_cache_lock:
            cached = _revision_matrix_cache.get(cache_key)
            if cached is not None:
                _revision_matrix_cache.move_to_end(cache_key)
                return cached
        cache_path = _revision_matrix_cache_path(cache_key)
        snapshot = _read_revision_matrix_cache(cache_path)
        if snapshot is None:
            snapshot = _build_revision_matrix(artifact)
            _write_revision_matrix_cache(cache_path, snapshot)
        with _revision_matrix_cache_lock:
            _revision_matrix_cache[cache_key] = snapshot
            _revision_matrix_cache.move_to_end(cache_key)
            while len(_revision_matrix_cache) > REVISION_MATRIX_CACHE_SIZE:
                _revision_matrix_cache.popitem(last=False)
        return snapshot


def _clear_revision_matrix_cache() -> None:
    with _revision_matrix_cache_lock:
        _revision_matrix_cache.clear()
    _revision_matrix_build_lock.cache_clear()


def warm_revision_matrix_cache(run_key: str, artifact_key: str) -> dict[str, int | str]:
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
    snapshot = _revision_matrix(artifact)
    return {
        "runKey": run_key,
        "artifactKey": artifact_key,
        "sampleCount": len(snapshot.matrix.index),
        "featureCount": len(snapshot.features),
    }


def _load_scoped_dataframe(conn, artifact, selected, scope: AnalysisScope) -> tuple[pd.DataFrame, list[str]]:
    series_sample_ids = _revision_series_sample_ids(conn, artifact, selected, scope)
    sample_ids = [sample_id for ids in series_sample_ids.values() for sample_id in ids]
    snapshot = _revision_matrix(artifact)
    missing = [sample_id for sample_id in sample_ids if sample_id not in snapshot.sample_by_id]
    if missing:
        raise AnalysisScopeError("Selected samples are missing from the dataset revision matrix")
    matrix = snapshot.matrix.reindex(sample_ids, fill_value=0.0)
    features = list(snapshot.features)
    frame = matrix.reset_index(drop=True)
    frame.insert(0, "Group", [snapshot.sample_by_id[sample_id][1] for sample_id in sample_ids])
    frame.insert(0, "Sample", [snapshot.sample_by_id[sample_id][0] for sample_id in sample_ids])
    frame.attrs["feature_kind"] = str(artifact["feature_kind"])
    frame.attrs["feature_label"] = str(artifact["feature_label"])
    frame.attrs["abundance_scale"] = str(artifact["abundance_scale"] or "unknown")
    frame.attrs["normalization"] = str(artifact["normalization"] or "unknown")
    return frame, features


def _scope_series(df: pd.DataFrame, scope: AnalysisScope) -> list[dict[str, Any]]:
    if scope.mode == "sample":
        sample = str(df.iloc[0]["Sample"])
        group = str(df.iloc[0]["Group"])
        return [{"key": sample, "label": sample, "group": group, "color": SERIES_COLORS[group]}]
    return [
        {"key": group, "label": f"{group} 均值", "group": group, "color": SERIES_COLORS[group]}
        for group in ("AD", "NC")
        if bool((df["Group"] == group).any())
    ]


def _series_values(df: pd.DataFrame, features: list[str], scope: AnalysisScope) -> tuple[list[dict[str, Any]], dict[str, pd.Series]]:
    series = _scope_series(df, scope)
    values: dict[str, pd.Series] = {}
    for item in series:
        if scope.mode == "sample":
            values[item["key"]] = df.iloc[0][features].astype(float)
        else:
            values[item["key"]] = df.loc[df["Group"] == item["group"], features].mean(axis=0)
    return series, values


def _compute_composition(df: pd.DataFrame, features: list[str], scope: AnalysisScope, top_n: int) -> dict[str, Any]:
    series, series_values = _series_values(df, features, scope)
    buckets: dict[str, dict[str, float]] = {}
    for feature in features:
        label = short_name(feature) if df.attrs["feature_kind"] == "ko" else (get_level(feature, "p") or "Unclassified").replace("_", " ")
        target = buckets.setdefault(label, {item["key"]: 0.0 for item in series})
        for item in series:
            target[item["key"]] += float(series_values[item["key"]].get(feature, 0.0))

    for item in series:
        total = sum(bucket[item["key"]] for bucket in buckets.values()) or 1.0
        for bucket in buckets.values():
            bucket[item["key"]] /= total
    ordered = sorted(buckets, key=lambda label: (-sum(buckets[label].values()), label))
    keep_count = min(top_n, len(ordered))
    kept = ordered[:keep_count]
    rows = [{"feature": label, "values": buckets[label]} for label in kept]
    if len(ordered) > keep_count:
        rows.append({
            "feature": "Other",
            "values": {item["key"]: sum(buckets[label][item["key"]] for label in ordered[keep_count:]) for item in series},
            "mergedCount": len(ordered) - keep_count,
        })
    return {
        "series": series,
        "items": rows,
        "sourceCategoryCount": len(ordered),
        "displayedCategoryCount": len(rows),
        "mergedCategoryCount": max(0, len(ordered) - keep_count),
    }


def _compute_boxplot(df: pd.DataFrame, features: list[str], scope: AnalysisScope, top_n: int) -> dict[str, Any]:
    totals = df[features].sum(axis=0).sort_values(ascending=False)
    selected_features = totals.head(top_n).index.tolist()
    series = _scope_series(df, scope)
    items = []
    for feature in selected_features:
        values_by_series = {}
        for series_item in series:
            rows = df if scope.mode == "sample" else df.loc[df["Group"] == series_item["group"]]
            values = rows[feature].to_numpy(dtype=float)
            samples = rows["Sample"].astype(str).to_numpy()
            raw = _box_summary(values, samples)
            logged = _box_summary(_log10_abundance(values), samples)
            values_by_series[series_item["key"]] = {"raw": raw, "log": logged}
        items.append({
            "fullName": feature,
            "shortName": short_name(feature),
            "total": float(totals[feature]),
            "values": values_by_series,
        })
    return {"series": series, "items": items}


def _tree_stats(items: list[dict[str, Any]]) -> dict[str, int]:
    nodes = 0
    terminal_nodes = 0
    aggregate_nodes = 0
    merged_categories = 0
    stack = list(items)
    while stack:
        item = stack.pop()
        nodes += 1
        children = item.get("children") or []
        if not children:
            terminal_nodes += 1
        merged_count = int(item.get("mergedCount", 0) or 0)
        if merged_count:
            aggregate_nodes += 1
            merged_categories += merged_count
        stack.extend(children)
    return {
        "displayedNodeCount": nodes,
        "terminalNodeCount": terminal_nodes,
        "aggregateNodeCount": aggregate_nodes,
        "mergedCategoryCount": merged_categories,
    }


def _policy_parameter(
    policy: ProjectionPolicy,
    parameters: dict[str, Any],
    key: str,
) -> Any:
    try:
        return policy.resolve_parameter(parameters, key)
    except ValueError as exc:
        raise AnalysisScopeError(str(exc)) from exc


def _validate_projection_parameters(
    projection_kind: str,
    top_n: int,
    parameters: dict[str, Any],
) -> None:
    policy = PROJECTION_POLICIES[projection_kind]
    if not policy.top_n_minimum <= top_n <= policy.top_n_maximum:
        raise AnalysisScopeError(
            f"topN must be between {policy.top_n_minimum} and {policy.top_n_maximum} "
            f"for {projection_kind}"
        )
    unknown = sorted(set(parameters) - set(policy.parameters))
    if unknown:
        raise AnalysisScopeError(
            f"Unsupported parameters for {projection_kind}: {', '.join(unknown)}"
        )
    for key in policy.parameters:
        _policy_parameter(policy, parameters, key)


def _resolve_projection_parameters(
    projection_kind: str,
    parameters: dict[str, Any],
) -> dict[str, Any]:
    policy = PROJECTION_POLICIES[projection_kind]
    try:
        return policy.resolve_parameters(parameters)
    except ValueError as exc:
        raise AnalysisScopeError(str(exc)) from exc


def _compute_payload(
    kind: str,
    df: pd.DataFrame,
    features: list[str],
    scope: AnalysisScope,
    top_n: int,
    parameters: dict[str, Any],
    include_audit: bool = False,
):
    policy = PROJECTION_POLICIES[kind]
    if kind == "composition":
        return _compute_composition(df, features, scope, top_n)
    if kind == "ko_contribution":
        return compute_ko_contribution(
            df,
            features,
            _scope_series(df, scope),
            sample_mode=scope.mode == "sample",
            top_n=top_n,
        )
    if kind == "boxplot":
        return _compute_boxplot(df, features, scope, top_n)
    if kind == "taxonomy":
        return compute_taxonomy_hierarchy(df, features)
    if kind == "taxonomy_sankey":
        return compute_taxonomy_sankey_projection(compute_taxonomy_hierarchy(df, features))
    if kind == "pca":
        return compute_pca(df, features, top_n=top_n)
    if kind == "pcoa":
        return compute_pcoa(
            df,
            features,
            filter_preset=str(_policy_parameter(policy, parameters, "filterPreset")),
            inference_min_per_group=policy.inference_min_per_group,
            include_audit=include_audit,
        )
    if kind == "heatmap":
        return compute_heatmap(
            df,
            features,
            top_n=top_n,
            q_value_max=_policy_parameter(policy, parameters, "qValueMax"),
            log2_fc_min_abs=_policy_parameter(policy, parameters, "log2FcMinAbs"),
            include_audit=include_audit,
        )
    if kind == "detection":
        return compute_detection_heatmap(
            df,
            features,
            top_n=top_n,
            abundance_threshold=_policy_parameter(policy, parameters, "abundanceThreshold"),
            include_audit=include_audit,
        )
    if kind == "differential_ko":
        return compute_ko_differential(
            df,
            features,
            top_n=top_n,
            q_value_max=_policy_parameter(policy, parameters, "qValueMax"),
            prevalence_min=_policy_parameter(policy, parameters, "prevalenceMin"),
            include_audit=include_audit,
        )
    raise AnalysisScopeError(f"Unsupported projection kind: {kind}")


def _payload_filter_entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    filter_payload = payload.get("filter")
    if not isinstance(filter_payload, dict):
        return []
    return [
        {"type": key, "value": value}
        for key, value in filter_payload.items()
        if value is not None
    ]


def _projection_metadata(
    projection_kind: str,
    payload: Any,
    source_feature_count: int,
    top_n: int,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "sourceFeatureCount": source_feature_count,
        "returnedFeatureCount": 0,
        "truncatedFeatureCount": 0,
        "mergedFeatureCount": 0,
        "filters": [],
        "topN": top_n,
        "isComplete": False,
        "projectionUnit": "features",
    }

    if projection_kind == "composition":
        source_categories = int(payload.get("sourceCategoryCount", 0))
        displayed_categories = int(payload.get("displayedCategoryCount", 0))
        merged_categories = int(payload.get("mergedCategoryCount", 0))
        metadata.update({
            "returnedFeatureCount": displayed_categories,
            "truncatedFeatureCount": 0,
            "mergedFeatureCount": merged_categories,
            "sourceCategoryCount": source_categories,
            "displayedCategoryCount": displayed_categories,
            "projectionUnit": "categories",
            "filters": [{"type": "category_top_n", "value": top_n}],
            "isComplete": merged_categories == 0,
        })
        return metadata

    if projection_kind == "ko_contribution":
        displayed = int(payload.get("displayedFeatureCount", 0))
        omitted = int(payload.get("omittedFeatureCount", 0))
        metadata.update({
            "returnedFeatureCount": displayed,
            "truncatedFeatureCount": omitted,
            "mergedFeatureCount": 0,
            "projectionUnit": "ko_features",
            "filters": [{"type": "shared_top_n_display_cap", "value": top_n}],
            "isComplete": omitted == 0,
            "coverageBySeries": payload.get("coverageBySeries") or {},
            "zeroTotalSampleCount": int(payload.get("zeroTotalSampleCount", 0)),
            "normalizationMethod": payload.get("normalizationMethod"),
            "aggregationMethod": payload.get("aggregationMethod"),
            "rankingMethod": payload.get("rankingMethod"),
        })
        return metadata

    if projection_kind == "taxonomy":
        stats = _tree_stats(payload)
        metadata.update({
            **stats,
            "returnedFeatureCount": stats["terminalNodeCount"],
            "mergedFeatureCount": stats["mergedCategoryCount"],
            "projectionUnit": "taxonomy_nodes",
            "filters": [{
                "type": "taxonomy_long_tail_aggregation",
                "value": TAXONOMY_TREE_PRUNE_RULES,
            }],
            "isComplete": stats["mergedCategoryCount"] == 0,
        })
        return metadata

    if projection_kind == "taxonomy_sankey":
        nodes = payload.get("nodes") or []
        source_ids = {link.get("source") for link in payload.get("links") or []}
        terminal_count = sum(
            1
            for node in nodes
            if (node.get("id") or node.get("name")) not in source_ids
        )
        merged_categories = sum(int(node.get("mergedCount", 0) or 0) for node in nodes)
        metadata.update({
            "returnedFeatureCount": terminal_count,
            "displayedNodeCount": len(nodes),
            "terminalNodeCount": terminal_count,
            "mergedFeatureCount": merged_categories,
            "mergedCategoryCount": merged_categories,
            "projectionUnit": "taxonomy_nodes",
            "filters": [
                {"type": "taxonomy_long_tail_aggregation", "value": TAXONOMY_TREE_PRUNE_RULES},
                {"type": "sankey_layout_projection", "value": "bounded_columns"},
            ],
            "isComplete": merged_categories == 0,
        })
        return metadata

    if projection_kind == "pca":
        returned = int(payload.get("featureCount", 0))
        metadata.update({
            "returnedFeatureCount": returned,
            "truncatedFeatureCount": max(0, source_feature_count - returned),
            "samplePointCount": len(payload.get("points") or []),
            "filters": [{"type": "top_n_by_total_abundance", "value": top_n}],
            "isComplete": returned >= source_feature_count,
        })
        return metadata

    if projection_kind == "pcoa":
        selection = payload.get("featureSelection") or {}
        returned = int(selection.get("selectedCount", payload.get("featureCount", 0)) or 0)
        excluded = int(selection.get("excludedCount", max(0, source_feature_count - returned)) or 0)
        metadata.update({
            "returnedFeatureCount": returned,
            "truncatedFeatureCount": excluded,
            "samplePointCount": len(payload.get("points") or []),
            "filters": [{
                "type": "relative_abundance_prevalence_filter",
                "value": {
                    "preset": selection.get("preset"),
                    "minimumRelativeAbundance": selection.get("minimumRelativeAbundance"),
                    "minimumPrevalence": selection.get("minimumPrevalence"),
                },
            }],
            "isComplete": excluded == 0,
            "retainedMass": selection.get("retainedMass"),
            "distanceFingerprint": payload.get("distanceFingerprint"),
        })
        return metadata

    if projection_kind == "heatmap":
        filter_payload = payload.get("filter") or {}
        significant = int(filter_payload.get("significantCount", 0) or 0)
        displayed = int(filter_payload.get("displayedCount", 0) or 0)
        metadata.update({
            "returnedFeatureCount": displayed,
            "truncatedFeatureCount": max(0, significant - displayed),
            "eligibleFeatureCount": significant,
            "selectionMode": "fdr_effect_filter_then_ranked_display_cap",
            "filters": _payload_filter_entries(payload),
            "isComplete": displayed >= significant,
        })
        return metadata

    if projection_kind == "detection":
        summary = payload.get("summary") or {}
        eligible = int(summary.get("detectedFeatureCount", 0) or 0)
        displayed = int(summary.get("displayedCount", 0) or 0)
        metadata.update({
            "returnedFeatureCount": displayed,
            "truncatedFeatureCount": max(0, eligible - displayed),
            "eligibleFeatureCount": eligible,
            "selectionMode": "largest_detection_rate_gap",
            "filters": _payload_filter_entries(payload),
            "isComplete": displayed >= eligible,
        })
        return metadata

    if projection_kind == "differential_ko":
        summary = payload.get("summary") or {}
        significant = int(summary.get("significantCount", 0) or 0)
        displayed = int(summary.get("displayedCount", 0) or 0)
        metadata.update({
            "returnedFeatureCount": displayed,
            "truncatedFeatureCount": max(0, significant - displayed),
            "testedFeatureCount": int(summary.get("testedCount", 0) or 0),
            "eligibleFeatureCount": significant,
            "selectionMode": "balanced_fdr_significant_by_group",
            "filters": _payload_filter_entries(payload),
            "isComplete": displayed >= significant,
        })
        return metadata

    returned = len(payload.get("items") or payload.get("colLabels") or [])
    metadata.update({
        "returnedFeatureCount": returned,
        "truncatedFeatureCount": max(0, source_feature_count - returned),
        "filters": _payload_filter_entries(payload)
        or [{"type": "top_n", "value": top_n}],
        "isComplete": returned >= source_feature_count,
    })
    return metadata


@lru_cache(maxsize=32)
def _compute_chart_projection(
    run_key: str,
    artifact_key: str,
    projection_kind: str,
    mode: str,
    groups: tuple[str, ...],
    sample_codes: tuple[str, ...],
    top_n: int,
    parameters_json: str,
) -> dict[str, Any]:
    policy = PROJECTION_POLICIES[projection_kind]
    scope = AnalysisScope(mode=mode, groups=list(groups), sampleCodes=list(sample_codes))
    parameters = json.loads(parameters_json)
    _validate_projection_parameters(projection_kind, top_n, parameters)
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
        available = _artifact_samples(conn, int(run["id"]), int(artifact["id"]))
        selected = _select_scope_samples(available, scope)
        group_counts = _validate_projection(projection_kind, str(artifact["feature_kind"]), selected, scope)
        identity = {
            "cacheSchema": CHART_PROJECTION_CACHE_SCHEMA,
            "computeVersion": COMPUTE_VERSION,
            "runKey": run_key,
            "artifactKey": artifact_key,
            "revision": artifact["revision_key"],
            "kind": projection_kind,
            "scope": scope.model_dump(),
            "topN": top_n,
            "parameters": parameters,
        }
        cache_path = _projection_cache_path(identity)
        cached = _read_projection_cache(cache_path)
        if cached is not None:
            return cached
        frame, features = _load_scoped_dataframe(conn, artifact, selected, scope)

    payload = _compute_payload(
        projection_kind,
        frame,
        features,
        scope,
        top_n,
        parameters,
    )
    projection_metadata = _projection_metadata(
        projection_kind,
        payload,
        len(features),
        top_n,
    )
    payload_metadata = payload if isinstance(payload, dict) else {}

    projection_key = hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    result = {
        "projectionKey": projection_key,
        "runKey": run_key,
        "artifactKey": artifact_key,
        "datasetSlug": artifact["dataset_slug"],
        "datasetRevision": artifact["revision_key"],
        "featureKind": artifact["feature_kind"],
        "featureLabel": artifact["feature_label"],
        "dataSemantics": {
            "abundanceScale": artifact["abundance_scale"] or "unknown",
            "normalization": artifact["normalization"] or "unknown",
        },
        "scope": scope.model_dump(),
        "payload": payload,
        "projection": {
            "kind": projection_kind,
            "analysisFamily": policy.analysis_family,
            "sampleCount": len(selected),
            "groupCounts": group_counts,
            "parameters": parameters,
            "topNRole": policy.top_n_role,
            **projection_metadata,
            "featureSelection": payload_metadata.get("featureSelection"),
            "preprocessing": payload_metadata.get("preprocessing"),
            "inference": {
                "permanovaStatus": payload_metadata.get("permanovaStatus"),
                "permdispStatus": payload_metadata.get("permdispStatus"),
                "minimumPerGroup": payload_metadata.get("inferenceMinimumPerGroup"),
                "context": payload_metadata.get("inferenceContext"),
                "distanceFingerprint": payload_metadata.get("distanceFingerprint"),
            } if projection_kind == "pcoa" else None,
        },
    }
    _write_projection_cache(cache_path, result)
    return result


def project_chart(
    run_key: str,
    artifact_key: str,
    projection_kind: ProjectionKind,
    request: ChartProjectionRequest,
) -> dict[str, Any]:
    scope = request.scope
    policy = PROJECTION_POLICIES[projection_kind]
    top_n = (
        policy.top_n_default
        if policy.top_n_role == "not_applicable"
        else request.topN if "topN" in request.model_fields_set else policy.top_n_default
    )
    _validate_projection_parameters(projection_kind, top_n, request.parameters)
    parameters = _resolve_projection_parameters(projection_kind, request.parameters)
    cache_key = (
        run_key,
        artifact_key,
        projection_kind,
        scope.mode,
        tuple(scope.groups),
        tuple(scope.sampleCodes),
        top_n,
        json.dumps(parameters, sort_keys=True, ensure_ascii=False),
    )
    with _projection_build_lock(cache_key):
        return _compute_chart_projection(*cache_key)


__all__ = ["PROJECTION_RULES", "project_chart", "warm_revision_matrix_cache"]
