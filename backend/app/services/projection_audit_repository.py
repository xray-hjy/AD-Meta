"""Persistent read model for projection audit details.

The repository owns storage and retrieval only. Scientific row construction
stays in ``projection_audit_service`` so storage can later move from SQL rows
to Parquet/DuckDB without changing the API contract or chart policies.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.core.database import connect, utcnow

# Increment this whenever persisted audit metadata or its public semantics change.
# Existing rows remain reproducible, while new requests build a compatible read model.
AUDIT_SCHEMA_VERSION = "1.2"


def _loads(value: Any, fallback):
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=lambda item: item.item() if hasattr(item, "item") else str(item),
    )


@dataclass(frozen=True)
class AuditArtifactIdentity:
    run_id: int
    source_artifact_id: int
    projection_key: str
    projection_kind: str
    section_key: str
    source_revision_key: str
    compute_version: str
    schema_version: str = AUDIT_SCHEMA_VERSION


def _artifact_where(identity: AuditArtifactIdentity) -> tuple[str, tuple[Any, ...]]:
    return (
        """
        source_artifact_id = ? AND projection_key = ? AND section_key = ?
        AND source_revision_key = ? AND compute_version = ? AND schema_version = ?
        """,
        (
            identity.source_artifact_id,
            identity.projection_key,
            identity.section_key,
            identity.source_revision_key,
            identity.compute_version,
            identity.schema_version,
        ),
    )


def find_audit_artifact(identity: AuditArtifactIdentity) -> dict[str, Any] | None:
    where, params = _artifact_where(identity)
    with connect() as conn:
        row = conn.execute(
            f"SELECT * FROM projection_audit_artifacts WHERE {where}",
            params,
        ).fetchone()
    if row is None:
        return None
    result = dict(row)
    result["metadata"] = _loads(result.pop("metadata_json", None), {})
    return result


def begin_audit_artifact(identity: AuditArtifactIdentity) -> int:
    now = utcnow()
    where, params = _artifact_where(identity)
    with connect() as conn:
        row = conn.execute(
            f"SELECT id FROM projection_audit_artifacts WHERE {where}",
            params,
        ).fetchone()
        if row is not None:
            artifact_id = int(row["id"])
            conn.execute(
                """
                UPDATE projection_audit_artifacts
                SET status = 'building', error_message = '', updated_at = ?,
                    completed_at = NULL
                WHERE id = ?
                """,
                (now, artifact_id),
            )
            return artifact_id
        cursor = conn.execute(
            """
            INSERT INTO projection_audit_artifacts (
              analysis_run_id, source_artifact_id, projection_key,
              projection_kind, section_key, source_revision_key,
              compute_version, schema_version, status, storage_uri,
              sha256, row_count, metadata_json, error_message,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'building', '', '', 0, '{}', '', ?, ?)
            """,
            (
                identity.run_id,
                identity.source_artifact_id,
                identity.projection_key,
                identity.projection_kind,
                identity.section_key,
                identity.source_revision_key,
                identity.compute_version,
                identity.schema_version,
                now,
                now,
            ),
        )
        return int(cursor.lastrowid)


def complete_audit_artifact(
    artifact_id: int,
    *,
    rows: list[dict[str, Any]],
    metadata: dict[str, Any],
    sha256: str,
) -> None:
    now = utcnow()
    values = [
        (
            artifact_id,
            index,
            str(row.get("feature") or row.get("path") or ""),
            str(row.get("status") or ""),
            str(row.get("reason") or ""),
            _json(row),
        )
        for index, row in enumerate(rows)
    ]
    with connect() as conn:
        conn.execute(
            "DELETE FROM projection_audit_rows WHERE audit_artifact_id = ?",
            (artifact_id,),
        )
        if values:
            conn.executemany(
                """
                INSERT INTO projection_audit_rows (
                  audit_artifact_id, row_index, feature, status_code,
                  reason_code, row_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                values,
            )
        conn.execute(
            """
            UPDATE projection_audit_artifacts
            SET status = 'ready', storage_uri = ?, sha256 = ?, row_count = ?,
                metadata_json = ?, error_message = '', updated_at = ?, completed_at = ?
            WHERE id = ?
            """,
            (
                f"database://projection-audits/{artifact_id}",
                sha256,
                len(rows),
                _json(metadata),
                now,
                now,
                artifact_id,
            ),
        )


def fail_audit_artifact(artifact_id: int, error: Exception) -> None:
    now = utcnow()
    with connect() as conn:
        conn.execute(
            """
            UPDATE projection_audit_artifacts
            SET status = 'failed', error_message = ?, updated_at = ?
            WHERE id = ?
            """,
            (str(error)[:4000], now, artifact_id),
        )


def load_audit_rows(
    artifact_id: int,
    *,
    filters: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    where = ["audit_artifact_id = ?"]
    params: list[Any] = [artifact_id]
    normalized = {
        key: str(value).strip()
        for key, value in (filters or {}).items()
        if str(value).strip()
    }
    for field, column in (
        ("feature", "feature"),
        ("status", "status_code"),
        ("reason", "reason_code"),
    ):
        if normalized.get(field):
            where.append(f"{column} = ?")
            params.append(normalized[field])
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT row_json
            FROM projection_audit_rows
            WHERE {' AND '.join(where)}
            ORDER BY row_index
            """,
            params,
        ).fetchall()
    return [_loads(row["row_json"], {}) for row in rows]


def query_audit_rows_page(
    artifact_id: int,
    *,
    filters: dict[str, str] | None = None,
    sort_by: str = "",
    sort_direction: str = "asc",
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int] | None:
    """Return an indexed page when the requested order has a SQL representation.

    Numeric scientific columns remain in the immutable row payload and use the
    service fallback. Default order and categorical columns stay fully inside
    the read model, which is the common browsing path.
    """

    sort_column = {
        "": "row_index",
        "rank": "row_index",
        "feature": "feature",
        "status": "status_code",
        "reason": "reason_code",
    }.get(sort_by)
    if sort_column is None:
        return None

    where = ["audit_artifact_id = ?"]
    params: list[Any] = [artifact_id]
    normalized = {
        key: str(value).strip()
        for key, value in (filters or {}).items()
        if str(value).strip()
    }
    for field, column in (
        ("feature", "feature"),
        ("status", "status_code"),
        ("reason", "reason_code"),
    ):
        if normalized.get(field):
            where.append(f"{column} = ?")
            params.append(normalized[field])

    direction = "DESC" if sort_direction == "desc" else "ASC"
    where_sql = " AND ".join(where)
    with connect() as conn:
        count_row = conn.execute(
            f"SELECT COUNT(*) AS value FROM projection_audit_rows WHERE {where_sql}",
            params,
        ).fetchone()
        page_params = [*params, max(1, int(limit)), max(0, int(offset))]
        rows = conn.execute(
            f"""
            SELECT row_json
            FROM projection_audit_rows
            WHERE {where_sql}
            ORDER BY {sort_column} {direction}, row_index ASC
            LIMIT ? OFFSET ?
            """,
            page_params,
        ).fetchall()
    return (
        [_loads(row["row_json"], {}) for row in rows],
        int(count_row["value"] or 0),
    )


def list_distinct_row_values(
    artifact_id: int,
    field: str,
    *,
    query: str = "",
    limit: int = 200,
    prioritize_displayed: bool = False,
) -> list[str]:
    """Compatibility wrapper for callers that only need option values."""

    values, _ = query_distinct_row_values(
        artifact_id,
        field,
        query=query,
        limit=limit,
        prioritize_displayed=prioritize_displayed,
    )
    return values


def _escape_like(value: str) -> str:
    """Escape a user value for the SQL LIKE expressions below."""

    return value.replace("!", "!!").replace("%", "!%").replace("_", "!_")


def query_distinct_row_values(
    artifact_id: int,
    field: str,
    *,
    query: str = "",
    limit: int = 200,
    offset: int = 0,
    prioritize_displayed: bool = False,
    displayed_only: bool = False,
) -> tuple[list[str], int]:
    """Return a page of distinct audit values and the exact match count.

    The audit read model remains the source of truth.  This function only
    projects its categorical fields for a combobox: an empty feature search can
    expose the chart's displayed values as recommendations, while a named
    search always ranges across every auditable source feature.
    """

    column = {
        "feature": "feature",
        "status": "status_code",
        "reason": "reason_code",
    }.get(field)
    if column is None:
        return [], 0

    normalized_query = query.strip().casefold()
    where = ["audit_artifact_id = ?", f"{column} <> ''"]
    params: list[Any] = [artifact_id]
    if displayed_only:
        where.append("status_code = 'displayed'")
    if normalized_query:
        where.append(f"LOWER({column}) LIKE ? ESCAPE '!'")
        params.append(f"%{_escape_like(normalized_query)}%")

    where_sql = " AND ".join(where)
    safe_limit = max(1, min(500, int(limit)))
    safe_offset = max(0, int(offset))
    with connect() as conn:
        count_row = conn.execute(
            f"SELECT COUNT(DISTINCT {column}) AS value "
            f"FROM projection_audit_rows WHERE {where_sql}",
            params,
        ).fetchone()
        if prioritize_displayed and field == "feature" and not normalized_query:
            rows = conn.execute(
                f"""
                SELECT
                  feature AS value,
                  MIN(row_index) AS first_row_index
                FROM projection_audit_rows
                WHERE {where_sql}
                GROUP BY feature
                ORDER BY first_row_index ASC, feature ASC
                LIMIT ? OFFSET ?
                """,
                [*params, safe_limit, safe_offset],
            ).fetchall()
        elif normalized_query and field == "feature":
            escaped = _escape_like(normalized_query)
            word_prefix = f"% {escaped}%"
            rows = conn.execute(
                f"""
                SELECT feature AS value
                FROM projection_audit_rows
                WHERE {where_sql}
                GROUP BY feature
                ORDER BY
                  CASE
                    WHEN LOWER(feature) = ? THEN 0
                    WHEN LOWER(feature) LIKE ? ESCAPE '!' THEN 1
                    WHEN LOWER(REPLACE(REPLACE(REPLACE(feature, '_', ' '), '-', ' '), '|', ' '))
                      LIKE ? ESCAPE '!' THEN 2
                    ELSE 3
                  END ASC,
                  feature ASC
                LIMIT ? OFFSET ?
                """,
                [
                    *params,
                    normalized_query,
                    f"{escaped}%",
                    word_prefix,
                    safe_limit,
                    safe_offset,
                ],
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                SELECT {column} AS value
                FROM projection_audit_rows
                WHERE {where_sql}
                GROUP BY {column}
                ORDER BY {column} ASC
                LIMIT ? OFFSET ?
                """,
                [*params, safe_limit, safe_offset],
            ).fetchall()
    return [str(row["value"]) for row in rows], int(count_row["value"] or 0)


def delete_audit_artifacts_for_source(source_artifact_id: int) -> int:
    """Explicit invalidation hook for source artifact replacement workflows."""

    with connect() as conn:
        cursor = conn.execute(
            "DELETE FROM projection_audit_artifacts WHERE source_artifact_id = ?",
            (source_artifact_id,),
        )
        return int(cursor.rowcount or 0)


__all__ = [
    "AUDIT_SCHEMA_VERSION",
    "AuditArtifactIdentity",
    "begin_audit_artifact",
    "complete_audit_artifact",
    "delete_audit_artifacts_for_source",
    "fail_audit_artifact",
    "find_audit_artifact",
    "list_distinct_row_values",
    "load_audit_rows",
    "query_distinct_row_values",
    "query_audit_rows_page",
]
