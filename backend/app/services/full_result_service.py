"""Query and export immutable, artifact-scoped analysis results.

This module deliberately reads revision tables directly.  It must not call a
chart projection, because chart projections may rank, aggregate, or otherwise
reduce data for interactive rendering.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Iterator
from typing import Any

from app.core.database import connect
from app.services.analysis_projection_service import (
    _resolve_artifact,
    _resolve_run,
)


class FullResultError(ValueError):
    pass


SUPPORTED_ARTIFACT_TYPES = {
    "species_abundance": "species",
    "ko_abundance": "ko",
}

SORT_DIRECTIONS = {"asc": "ASC", "desc": "DESC"}


def _escape_like(value: str) -> str:
    return value.replace("!", "!!").replace("%", "!%").replace("_", "!_")


def _result_definition(artifact_type: str) -> dict[str, Any]:
    kind = SUPPORTED_ARTIFACT_TYPES.get(artifact_type)
    if kind == "species":
        return {
            "kind": kind,
            "from": """
                revision_species_abundance abundance
                JOIN revision_sample_info sample_info
                  ON sample_info.sample_id = abundance.sample_id
                 AND sample_info.revision_id = abundance.revision_id
                JOIN analysis_run_samples run_sample
                  ON run_sample.analysis_run_id = ?
                 AND run_sample.sample_code = sample_info.sample_code
                JOIN analysis_artifact_samples artifact_sample
                  ON artifact_sample.artifact_id = ?
                 AND artifact_sample.run_sample_id = run_sample.id
                LEFT JOIN taxon_anno annotation
                  ON annotation.taxon_id = abundance.taxon_id
            """,
            "revision_column": "abundance.revision_id",
            "feature_id": "abundance.taxon_id",
            "feature_name": "annotation.canonical_name",
            "search_columns": (
                "sample_info.sample_code",
                "sample_info.phenotype",
                "abundance.taxon_id",
                "annotation.canonical_name",
                "annotation.full_taxonomy",
                "annotation.kingdom",
                "annotation.phylum",
                "annotation.class",
                "annotation.tax_order",
                "annotation.family",
                "annotation.genus",
                "annotation.species",
            ),
            "select": """
                sample_info.sample_code AS sampleCode,
                sample_info.phenotype AS phenotype,
                abundance.taxon_id AS featureId,
                COALESCE(annotation.canonical_name, '') AS featureName,
                COALESCE(annotation.taxon_rank, '') AS taxonRank,
                COALESCE(annotation.kingdom, '') AS kingdom,
                COALESCE(annotation.phylum, '') AS phylum,
                COALESCE(annotation.class, '') AS class,
                COALESCE(annotation.tax_order, '') AS taxOrder,
                COALESCE(annotation.family, '') AS family,
                COALESCE(annotation.genus, '') AS genus,
                COALESCE(annotation.species, '') AS species,
                COALESCE(annotation.full_taxonomy, '') AS fullTaxonomy,
                abundance.abundance AS abundance
            """,
            "columns": [
                "sampleCode", "phenotype", "featureId", "featureName",
                "taxonRank", "kingdom", "phylum", "class", "taxOrder",
                "family", "genus", "species", "fullTaxonomy", "abundance",
            ],
        }
    if kind == "ko":
        return {
            "kind": kind,
            "from": """
                revision_ko_abundance abundance
                JOIN revision_sample_info sample_info
                  ON sample_info.sample_id = abundance.sample_id
                 AND sample_info.revision_id = abundance.revision_id
                JOIN analysis_run_samples run_sample
                  ON run_sample.analysis_run_id = ?
                 AND run_sample.sample_code = sample_info.sample_code
                JOIN analysis_artifact_samples artifact_sample
                  ON artifact_sample.artifact_id = ?
                 AND artifact_sample.run_sample_id = run_sample.id
                LEFT JOIN ko_anno annotation ON annotation.ko_id = abundance.ko_id
            """,
            "revision_column": "abundance.revision_id",
            "feature_id": "abundance.ko_id",
            "feature_name": "annotation.ko_name",
            "search_columns": (
                "sample_info.sample_code",
                "sample_info.phenotype",
                "abundance.ko_id",
                "annotation.ko_name",
                "annotation.pathway",
                "annotation.module",
            ),
            "select": """
                sample_info.sample_code AS sampleCode,
                sample_info.phenotype AS phenotype,
                abundance.ko_id AS featureId,
                COALESCE(annotation.ko_name, '') AS featureName,
                COALESCE(annotation.pathway, '') AS pathway,
                COALESCE(annotation.module, '') AS module,
                abundance.abundance AS abundance
            """,
            "columns": [
                "sampleCode", "phenotype", "featureId", "featureName",
                "pathway", "module", "abundance",
            ],
        }
    raise FullResultError(
        "The selected artifact does not expose a complete abundance result."
    )


def _build_query(
    *,
    run_id: int,
    artifact_id: int,
    revision_id: int,
    definition: dict[str, Any],
    query: str = "",
    sample_code: str = "",
    phenotype: str = "",
    feature_id: str = "",
) -> tuple[str, list[Any]]:
    where = [f"{definition['revision_column']} = ?"]
    params: list[Any] = [run_id, artifact_id, revision_id]
    if sample_code.strip():
        where.append("sample_info.sample_code = ?")
        params.append(sample_code.strip())
    if phenotype.strip():
        where.append("sample_info.phenotype = ?")
        params.append(phenotype.strip())
    if feature_id.strip():
        where.append(f"CAST({definition['feature_id']} AS CHAR) = ?")
        params.append(feature_id.strip())
    if query.strip():
        pattern = f"%{_escape_like(query.strip().casefold())}%"
        expressions = [
            f"LOWER(COALESCE(CAST({column} AS CHAR), '')) LIKE ? ESCAPE '!'"
            for column in definition["search_columns"]
        ]
        where.append(f"({' OR '.join(expressions)})")
        params.extend([pattern] * len(expressions))
    return " AND ".join(where), params


def _order_by(definition: dict[str, Any], sort_by: str, direction: str) -> str:
    sort_columns = {
        "sampleCode": "sample_info.sample_code",
        "phenotype": "sample_info.phenotype",
        "featureId": definition["feature_id"],
        "featureName": definition["feature_name"],
        "abundance": "abundance.abundance",
    }
    column = sort_columns.get(sort_by or "sampleCode")
    if column is None:
        raise FullResultError(f"Unsupported sort field: {sort_by}")
    sql_direction = SORT_DIRECTIONS.get(direction.casefold())
    if sql_direction is None:
        raise FullResultError(f"Unsupported sort direction: {direction}")
    return (
        f"{column} {sql_direction}, sample_info.sample_code ASC, "
        f"{definition['feature_id']} ASC"
    )


def _resolve_context(conn, run_key: str, artifact_key: str):
    run = _resolve_run(conn, run_key)
    artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
    definition = _result_definition(str(artifact["artifact_type"]))
    if artifact["dataset_revision_id"] is None:
        raise FullResultError("The selected artifact has no immutable dataset revision.")
    return run, artifact, definition


def query_complete_results(
    run_key: str,
    artifact_key: str,
    *,
    query: str = "",
    sample_code: str = "",
    phenotype: str = "",
    feature_id: str = "",
    sort_by: str = "sampleCode",
    sort_direction: str = "asc",
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    safe_limit = max(1, min(500, int(limit)))
    safe_offset = max(0, int(offset))
    with connect() as conn:
        run, artifact, definition = _resolve_context(conn, run_key, artifact_key)
        where, params = _build_query(
            run_id=int(run["id"]),
            artifact_id=int(artifact["id"]),
            revision_id=int(artifact["dataset_revision_id"]),
            definition=definition,
            query=query,
            sample_code=sample_code,
            phenotype=phenotype,
            feature_id=feature_id,
        )
        count = conn.execute(
            f"SELECT COUNT(*) AS value FROM {definition['from']} WHERE {where}",
            params,
        ).fetchone()
        order_by = _order_by(definition, sort_by, sort_direction)
        rows = conn.execute(
            f"""
            SELECT {definition['select']}
            FROM {definition['from']}
            WHERE {where}
            ORDER BY {order_by}
            LIMIT ? OFFSET ?
            """,
            [*params, safe_limit, safe_offset],
        ).fetchall()
    return {
        "runKey": run_key,
        "artifactKey": artifact_key,
        "datasetSlug": artifact["dataset_slug"],
        "datasetRevision": artifact["revision_key"],
        "featureKind": definition["kind"],
        "featureLabel": artifact["feature_label"],
        "abundanceScale": artifact["abundance_scale"],
        "normalization": artifact["normalization"],
        "columns": definition["columns"],
        "items": [dict(row) for row in rows],
        "total": int(count["value"] or 0),
        "limit": safe_limit,
        "offset": safe_offset,
        "filters": {
            "query": query,
            "sampleCode": sample_code,
            "phenotype": phenotype,
            "featureId": feature_id,
        },
        "sort": {"by": sort_by, "direction": sort_direction},
        "storageSemantics": {
            "matrix": "sparse",
            "storedRowsOnly": True,
            "absentPairsSynthesized": False,
            "projectionApplied": False,
        },
    }


def stream_complete_results_csv(
    run_key: str,
    artifact_key: str,
    **filters: Any,
) -> Iterator[bytes]:
    """Stream the same filtered result set used by the paginated endpoint."""

    with connect() as conn:
        run, artifact, definition = _resolve_context(conn, run_key, artifact_key)
        where, params = _build_query(
            run_id=int(run["id"]),
            artifact_id=int(artifact["id"]),
            revision_id=int(artifact["dataset_revision_id"]),
            definition=definition,
            query=str(filters.get("query") or ""),
            sample_code=str(filters.get("sample_code") or ""),
            phenotype=str(filters.get("phenotype") or ""),
            feature_id=str(filters.get("feature_id") or ""),
        )
        order_by = _order_by(
            definition,
            str(filters.get("sort_by") or "sampleCode"),
            str(filters.get("sort_direction") or "asc"),
        )
        cursor = conn.execute(
            f"""
            SELECT {definition['select']}
            FROM {definition['from']}
            WHERE {where}
            ORDER BY {order_by}
            """,
            params,
        )
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=definition["columns"])
        writer.writeheader()
        yield ("\ufeff" + buffer.getvalue()).encode("utf-8")
        while True:
            rows = cursor.fetchmany(1000)
            if not rows:
                break
            buffer.seek(0)
            buffer.truncate(0)
            for row in rows:
                writer.writerow(dict(row))
            yield buffer.getvalue().encode("utf-8")
