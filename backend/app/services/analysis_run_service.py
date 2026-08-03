from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.core.database import connect, utcnow
from app.domain.analysis_manifest import AnalysisRunManifest, canonical_manifest_json, load_analysis_manifest


class AnalysisManifestConflict(ValueError):
    pass


def _loads(value: Any, fallback):
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _resolve_artifacts(conn, run: AnalysisRunManifest) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for declaration in run.artifacts:
        dataset = conn.execute(
            """
            SELECT datasets.id AS dataset_id, datasets.slug, datasets.name,
                   datasets.feature_kind, datasets.feature_label,
                   dataset_revisions.id AS revision_id,
                   dataset_revisions.revision_key,
                   dataset_revisions.source_sha256,
                   dataset_revisions.source_file_size,
                   dataset_revisions.source_json
            FROM datasets
            JOIN dataset_revisions ON dataset_revisions.id = datasets.current_revision_id
            WHERE datasets.slug = ? AND datasets.status = 'published'
              AND dataset_revisions.status = 'published'
            """,
            (declaration.dataset_slug,),
        ).fetchone()
        if dataset is None:
            raise ValueError(
                f"Artifact '{declaration.key}' references an unavailable published dataset: "
                f"{declaration.dataset_slug}"
            )
        sample_rows = conn.execute(
            """
            SELECT sample_code, phenotype, seq_platform, batch_id, data_source
            FROM revision_sample_info
            WHERE revision_id = ?
            ORDER BY sample_code
            """,
            (dataset["revision_id"],),
        ).fetchall()
        if not sample_rows:
            raise ValueError(f"Dataset '{declaration.dataset_slug}' has no revision sample index")
        samples = [dict(row) for row in sample_rows]
        resolved.append(
            {
                "declaration": declaration,
                "dataset": dataset,
                "samples": samples,
            }
        )
    return resolved


def _resolved_revision_map(resolved_artifacts: list[dict[str, Any]]) -> dict[str, str]:
    return {
        item["declaration"].key: item["dataset"]["revision_key"]
        for item in resolved_artifacts
    }


def _identity_run_payload(run: AnalysisRunManifest) -> dict[str, Any]:
    payload = run.model_dump(by_alias=True, mode="json")
    # Display copy can be refined without changing which scientific result this run identifies.
    payload.pop("name", None)
    payload.pop("description", None)
    return payload


def _effective_hash(
    manifest_version: str,
    run: AnalysisRunManifest,
    resolved_artifacts: list[dict[str, Any]],
) -> str:
    payload = {
        "manifestVersion": manifest_version,
        "run": _identity_run_payload(run),
        "resolvedRevisions": _resolved_revision_map(resolved_artifacts),
    }
    return hashlib.sha256(canonical_manifest_json(payload).encode("utf-8")).hexdigest()


def _legacy_effective_hash(
    manifest_version: str,
    run: AnalysisRunManifest,
    resolved_artifacts: list[dict[str, Any]],
) -> str:
    payload = {
        "manifestVersion": manifest_version,
        "run": run.model_dump(by_alias=True, mode="json"),
        "resolvedRevisions": _resolved_revision_map(resolved_artifacts),
    }
    return hashlib.sha256(canonical_manifest_json(payload).encode("utf-8")).hexdigest()


def _insert_run(
    conn,
    manifest_version: str,
    run: AnalysisRunManifest,
    resolved_artifacts: list[dict[str, Any]],
    manifest_sha256: str,
) -> int:
    sample_index: dict[str, dict[str, Any]] = {}
    for artifact in resolved_artifacts:
        for sample in artifact["samples"]:
            code = str(sample["sample_code"])
            phenotype = str(sample["phenotype"])
            current = sample_index.get(code)
            if current is not None and current["phenotype"] != phenotype:
                raise ValueError(
                    f"Sample phenotype conflict for '{code}': "
                    f"{current['phenotype']} vs {phenotype}"
                )
            sample_index.setdefault(code, sample)

    now = utcnow()
    run_cursor = conn.execute(
        """
        INSERT INTO analysis_runs (
          run_key, name, description, status, manifest_version, manifest_sha256,
          pipeline_json, parameters_json, reference_databases_json,
          provenance_json, created_at, completed_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run.key,
            run.name,
            run.description,
            run.status,
            manifest_version,
            manifest_sha256,
            _json(run.pipeline.model_dump()),
            _json(run.parameters),
            _json(run.reference_databases),
            _json(run.provenance),
            now,
            now,
            now if run.status == "published" else None,
        ),
    )
    run_id = int(run_cursor.lastrowid)

    sample_ids: dict[str, int] = {}
    for code, sample in sorted(sample_index.items()):
        cursor = conn.execute(
            """
            INSERT INTO analysis_run_samples (
              analysis_run_id, sample_code, phenotype, metadata_json
            ) VALUES (?, ?, ?, ?)
            """,
            (
                run_id,
                code,
                sample["phenotype"],
                _json(
                    {
                        "seqPlatform": sample.get("seq_platform") or "",
                        "batchId": sample.get("batch_id") or "",
                        "dataSource": sample.get("data_source") or "",
                    }
                ),
            ),
        )
        sample_ids[code] = int(cursor.lastrowid)

    for item in resolved_artifacts:
        declaration = item["declaration"]
        dataset = item["dataset"]
        source = _loads(dataset["source_json"], {})
        metadata = {
            "datasetSlug": dataset["slug"],
            "datasetName": dataset["name"],
            "revisionKey": dataset["revision_key"],
            "featureKind": dataset["feature_kind"],
            "featureLabel": dataset["feature_label"],
            "source": source,
        }
        cursor = conn.execute(
            """
            INSERT INTO analysis_artifacts (
              analysis_run_id, artifact_key, artifact_type, dataset_id,
              dataset_revision_id, uri, sha256, size_bytes, schema_version,
              metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                declaration.key,
                declaration.type,
                dataset["dataset_id"],
                dataset["revision_id"],
                f"dataset://{dataset['slug']}/revisions/{dataset['revision_key']}",
                dataset["source_sha256"],
                dataset["source_file_size"],
                declaration.schema_version,
                _json(metadata),
                now,
            ),
        )
        artifact_id = int(cursor.lastrowid)
        conn.executemany(
            "INSERT INTO analysis_artifact_samples (artifact_id, run_sample_id) VALUES (?, ?)",
            [(artifact_id, sample_ids[str(sample["sample_code"])]) for sample in item["samples"]],
        )
    return run_id


def sync_analysis_runs_from_manifest(manifest_path: Path) -> list[dict[str, Any]]:
    manifest = load_analysis_manifest(manifest_path)
    results: list[dict[str, Any]] = []
    with connect() as conn:
        for run in manifest.analysis_runs:
            resolved = _resolve_artifacts(conn, run)
            effective_hash = _effective_hash(manifest.manifest_version, run, resolved)
            existing = conn.execute(
                "SELECT id, name, description, manifest_sha256 FROM analysis_runs WHERE run_key = ?",
                (run.key,),
            ).fetchone()
            if existing is not None:
                if existing["manifest_sha256"] != effective_hash:
                    legacy_run = run.model_copy(
                        update={
                            "name": existing["name"],
                            "description": existing["description"],
                        }
                    )
                    legacy_hash = _legacy_effective_hash(
                        manifest.manifest_version,
                        legacy_run,
                        resolved,
                    )
                    if existing["manifest_sha256"] != legacy_hash:
                        raise AnalysisManifestConflict(
                            f"Analysis run '{run.key}' is immutable and already points to different "
                            "manifest content or dataset revisions. Register a new run key."
                        )
                run_id = int(existing["id"])
                metadata_changed = (
                    existing["name"] != run.name
                    or existing["description"] != run.description
                    or existing["manifest_sha256"] != effective_hash
                )
                if metadata_changed:
                    conn.execute(
                        """
                        UPDATE analysis_runs
                        SET name = ?, description = ?, manifest_sha256 = ?
                        WHERE id = ?
                        """,
                        (run.name, run.description, effective_hash, run_id),
                    )
                    action = "updated_metadata"
                else:
                    action = "unchanged"
            else:
                run_id = _insert_run(conn, manifest.manifest_version, run, resolved, effective_hash)
                action = "created"
            results.append({"key": run.key, "id": run_id, "action": action})
    return results


def _artifact_payload(row, run_sample_count: int) -> dict[str, Any]:
    metadata = _loads(row["metadata_json"], {})
    sample_count = int(row["sample_count"] or 0)
    return {
        "key": row["artifact_key"],
        "type": row["artifact_type"],
        "datasetSlug": row["dataset_slug"] or metadata.get("datasetSlug"),
        "datasetRevision": row["revision_key"] or metadata.get("revisionKey"),
        "featureKind": row["feature_kind"] or metadata.get("featureKind"),
        "featureLabel": row["feature_label"] or metadata.get("featureLabel"),
        "abundanceScale": row["abundance_scale"] or metadata.get("abundanceScale") or "unknown",
        "normalization": row["normalization"] or metadata.get("normalization") or "unknown",
        "sampleCount": sample_count,
        "groupCounts": _loads(row["group_counts_json"], {}),
        "coverageFraction": round(sample_count / run_sample_count, 6) if run_sample_count else 0,
        "schemaVersion": row["schema_version"],
        "uri": row["uri"],
    }


def list_analysis_runs() -> list[dict[str, Any]]:
    with connect() as conn:
        runs = conn.execute(
            """
            SELECT analysis_runs.*
            FROM analysis_runs
            ORDER BY analysis_runs.published_at DESC, analysis_runs.id DESC
            """
        ).fetchall()
        payloads = []
        for run in runs:
            group_rows = conn.execute(
                """
                SELECT phenotype, COUNT(*) AS value
                FROM analysis_run_samples WHERE analysis_run_id = ?
                GROUP BY phenotype ORDER BY phenotype
                """,
                (run["id"],),
            ).fetchall()
            sample_count = sum(int(row["value"]) for row in group_rows)
            artifact_rows = conn.execute(
                """
                SELECT analysis_artifacts.*, datasets.slug AS dataset_slug,
                       datasets.feature_kind, datasets.feature_label,
                       dataset_revisions.revision_key,
                       dataset_revisions.abundance_scale,
                       dataset_revisions.normalization
                FROM analysis_artifacts
                LEFT JOIN datasets ON datasets.id = analysis_artifacts.dataset_id
                LEFT JOIN dataset_revisions ON dataset_revisions.id = analysis_artifacts.dataset_revision_id
                WHERE analysis_artifacts.analysis_run_id = ?
                ORDER BY analysis_artifacts.id
                """,
                (run["id"],),
            ).fetchall()
            artifacts = []
            for artifact in artifact_rows:
                artifact_groups = conn.execute(
                    """
                    SELECT analysis_run_samples.phenotype, COUNT(*) AS value
                    FROM analysis_artifact_samples
                    JOIN analysis_run_samples
                      ON analysis_run_samples.id = analysis_artifact_samples.run_sample_id
                    WHERE analysis_artifact_samples.artifact_id = ?
                    GROUP BY analysis_run_samples.phenotype
                    """,
                    (artifact["id"],),
                ).fetchall()
                artifact_dict = dict(artifact)
                artifact_dict["sample_count"] = sum(
                    int(row["value"]) for row in artifact_groups
                )
                artifact_dict["group_counts_json"] = _json(
                    {str(row["phenotype"]): int(row["value"]) for row in artifact_groups}
                )
                artifacts.append(_artifact_payload(artifact_dict, sample_count))
            payloads.append(
                {
                    "id": run["id"],
                    "key": run["run_key"],
                    "name": run["name"],
                    "description": run["description"],
                    "status": run["status"],
                    "manifestVersion": run["manifest_version"],
                    "sampleCount": sample_count,
                    "groupCounts": {str(row["phenotype"]): int(row["value"]) for row in group_rows},
                    "pipeline": _loads(run["pipeline_json"], {}),
                    "parameters": _loads(run["parameters_json"], {}),
                    "referenceDatabases": _loads(run["reference_databases_json"], []),
                    "provenance": _loads(run["provenance_json"], {}),
                    "artifacts": artifacts,
                    "createdAt": run["created_at"],
                    "completedAt": run["completed_at"],
                    "publishedAt": run["published_at"],
                }
            )
    return payloads


def get_analysis_run(run_key: str) -> dict[str, Any] | None:
    return next((run for run in list_analysis_runs() if run["key"] == run_key), None)
