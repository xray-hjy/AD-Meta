from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from app.compute.precompute import precompute_all, prepare_dataframe, write_json
from app.compute.table import InputValidationError, validate_covariates
from app.core.config import CACHE_ROOT, COMPUTE_VERSION
from app.core.database import connect, is_mysql, utcnow
from app.core.migrations import upgrade_database
from app.services.normalized_import import replace_normalized_dataset
from app.services.statistics_worker import run_formal_differential

RETAIN_SUCCESSFUL_REVISIONS = 3
logger = logging.getLogger("ad_meta.import")


def _log_import_event(
    *,
    slug: str,
    revision: str,
    stage: str,
    status: str,
    started: float,
    artifact_bytes: int | None = None,
    exception_type: str | None = None,
) -> None:
    logger.info(
        json.dumps(
            {
                "event": "dataset_import",
                "dataset": slug,
                "revision": revision,
                "jobStage": stage,
                "status": status,
                "durationMs": round((time.perf_counter() - started) * 1000, 2),
                "artifactBytes": artifact_bytes,
                "exceptionType": exception_type,
            },
            ensure_ascii=False,
        )
    )


def _relative_to_backend(path: Path) -> str:
    backend_root = Path(__file__).resolve().parents[2]
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(backend_root.resolve()))
    except ValueError:
        # Docker volumes and operator-configured storage roots may live outside
        # the application directory. Absolute paths remain confined by the
        # dataset service to the configured revision cache root before reads.
        return str(resolved)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stable_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _upsert_chart_artifact(
    conn,
    dataset_id: int,
    chart_type: str,
    cache_path: Path,
    timestamp: str,
) -> None:
    params = (
        dataset_id,
        chart_type,
        _relative_to_backend(cache_path),
        COMPUTE_VERSION,
        timestamp,
        timestamp,
    )
    if is_mysql():
        conn.execute(
            """
            INSERT INTO chart_artifacts (
              dataset_id, chart_type, cache_path, params_hash,
              compute_version, created_at, updated_at
            )
            VALUES (?, ?, ?, '', ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              cache_path = VALUES(cache_path),
              compute_version = VALUES(compute_version),
              updated_at = VALUES(updated_at)
            """,
            params,
        )
        return

    conn.execute(
        """
        INSERT INTO chart_artifacts (
          dataset_id, chart_type, cache_path, params_hash,
          compute_version, created_at, updated_at
        )
        VALUES (?, ?, ?, '', ?, ?, ?)
        ON CONFLICT(dataset_id, chart_type) DO UPDATE SET
          cache_path = excluded.cache_path,
          compute_version = excluded.compute_version,
          updated_at = excluded.updated_at
        """,
        params,
    )


def _insert_revision_artifact(
    conn,
    revision_id: int,
    chart_type: str,
    cache_path: Path,
    sha256: str,
    size_bytes: int,
    timestamp: str,
) -> None:
    conn.execute(
        """
        INSERT INTO revision_chart_artifacts (
          revision_id, chart_type, cache_path, sha256, size_bytes, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            revision_id,
            chart_type,
            _relative_to_backend(cache_path),
            sha256,
            size_bytes,
            timestamp,
        ),
    )


def _json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _validation_error_text(exc: Exception) -> str:
    if isinstance(exc, InputValidationError):
        return _json_text(exc.as_dict())
    return str(exc)


def _prune_old_revisions(dataset_id: int, current_revision_id: int) -> None:
    """Keep the newest successful immutable revisions and their cache trees."""

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, revision_key FROM dataset_revisions
            WHERE dataset_id = ? AND status = 'published'
            ORDER BY published_at DESC, id DESC
            """,
            (dataset_id,),
        ).fetchall()
        obsolete = [row for row in rows if int(row["id"]) != current_revision_id][RETAIN_SUCCESSFUL_REVISIONS - 1 :]
        for row in obsolete:
            artifact = conn.execute(
                "SELECT cache_path FROM revision_chart_artifacts WHERE revision_id = ? LIMIT 1",
                (row["id"],),
            ).fetchone()
            if artifact:
                path = Path(artifact["cache_path"])
                if not path.is_absolute():
                    path = Path(__file__).resolve().parents[2] / path
                try:
                    shutil.rmtree(path.parent)
                except FileNotFoundError:
                    pass
            conn.execute("DELETE FROM dataset_revisions WHERE id = ?", (row["id"],))


def import_dataset(
    file_path: Path,
    slug: str,
    name: str,
    description: str = "",
    *,
    abundance_scale: str = "unknown",
    normalization: str = "unknown",
    missing_value_policy: str = "error",
    covariates: list[str] | None = None,
    source_metadata: dict[str, Any] | None = None,
    group_mapping: dict[str, str] | None = None,
) -> int:
    """Validate, compute and atomically publish an immutable dataset revision."""

    upgrade_database()
    source = file_path.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if source.suffix.lower() not in {".xlsx", ".xls", ".csv", ".tsv"}:
        raise InputValidationError("unsupported_file_type", f"Unsupported file type: {source.suffix.lower()}")

    covariates = list(covariates or [])
    source_metadata = dict(source_metadata or {})
    group_mapping = dict(group_mapping or {})
    now = utcnow()
    started = time.perf_counter()
    revision_key = uuid.uuid4().hex
    file_type = source.suffix.lower().lstrip(".")
    source_sha256 = _sha256_file(source)
    source_size = source.stat().st_size
    parameters = {
        "computeVersion": COMPUTE_VERSION,
        "abundanceScale": abundance_scale,
        "normalization": normalization,
        "missingValuePolicy": missing_value_policy,
        "covariates": covariates,
        "sourceSha256": source_sha256,
        "groupMapping": group_mapping,
    }
    params_hash = _stable_hash(parameters)

    staging_root = CACHE_ROOT.parent / "staging"
    stage_dir = staging_root / revision_key
    final_dir = CACHE_ROOT / slug / revision_key
    stage_dir.mkdir(parents=True, exist_ok=False)
    stage_raw = stage_dir / f"raw.{file_type}"
    shutil.copy2(source, stage_raw)

    dataset_id: int | None = None
    revision_id: int | None = None
    job_id: int | None = None
    previous_revision_id: int | None = None
    published_files = False

    try:
        with connect() as conn:
            existing = conn.execute(
                "SELECT id, current_revision_id FROM datasets WHERE slug = ?",
                (slug,),
            ).fetchone()
            if existing:
                dataset_id = int(existing["id"])
                previous_revision_id = (
                    int(existing["current_revision_id"])
                    if existing["current_revision_id"] is not None
                    else None
                )
            else:
                cursor = conn.execute(
                    """
                    INSERT INTO datasets (
                      slug, name, description, original_filename, file_type, file_size,
                      status, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'importing', ?, ?)
                    """,
                    (slug, name, description, source.name, file_type, source_size, now, now),
                )
                dataset_id = int(cursor.lastrowid)

            revision_cursor = conn.execute(
                """
                INSERT INTO dataset_revisions (
                  dataset_id, revision_key, status, abundance_scale, normalization,
                  missing_value_policy, covariates_json, source_json, source_sha256,
                  source_file_size, compute_version, params_hash, created_at
                )
                VALUES (?, ?, 'computing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    dataset_id,
                    revision_key,
                    abundance_scale,
                    normalization,
                    missing_value_policy,
                    _json_text(covariates),
                    _json_text(source_metadata),
                    source_sha256,
                    source_size,
                    COMPUTE_VERSION,
                    params_hash,
                    now,
                ),
            )
            revision_id = int(revision_cursor.lastrowid)
            job_cursor = conn.execute(
                """
                INSERT INTO import_jobs (dataset_id, status, stage, message, started_at)
                VALUES (?, 'running', 'validation', 'Validating source matrix', ?)
                """,
                (dataset_id, now),
            )
            job_id = int(job_cursor.lastrowid)

        published_at = utcnow()
        summary, artifacts, warnings = precompute_all(
            stage_raw,
            slug,
            name,
            published_at,
            abundance_scale=abundance_scale,
            missing_value_policy=missing_value_policy,
            minimum_group_size=2,
            group_mapping=group_mapping,
        )
        df, feature_cols, _ = prepare_dataframe(
            stage_raw,
            abundance_scale=abundance_scale,
            missing_value_policy=missing_value_policy,
            minimum_group_size=2,
            group_mapping=group_mapping,
        )
        validation = dict(df.attrs["validation_report"])
        validate_covariates(df, feature_cols, covariates)
        _log_import_event(
            slug=slug,
            revision=revision_key,
            stage="validation_and_compute",
            status="complete",
            started=started,
        )
        if min(validation["groupCounts"].values()) < 5:
            analysis_status = "insufficient_sample"
        elif validation["inferenceEligible"]:
            formal = run_formal_differential(
                job_id=revision_key,
                df=df,
                feature_cols=feature_cols,
                abundance_scale=abundance_scale,
                covariates=covariates,
            )
            formal["featureLabel"] = df.attrs["feature_label"]
            artifacts["differential_abundance"] = formal
            if df.attrs["feature_kind"] == "ko":
                ko_items = []
                for item in formal["items"]:
                    effect = float(item["effectSize"])
                    ko_items.append(
                        {
                            **item,
                            "koId": item["featureId"],
                            "koName": item.get("featureName", item["featureId"]),
                            "enrichedGroup": "AD" if effect >= 0 else "NC",
                            "effectMetric": item.get("effectMetric", "model_coefficient"),
                        }
                    )
                artifacts["differential_ko"] = {**formal, "items": ko_items}
            analysis_status = "formal_complete"
        else:
            analysis_status = "exploratory_only"
        provenance = {
            "revision": revision_key,
            "sourceSha256": source_sha256,
            "sourceFileSize": source_size,
            "abundanceScale": abundance_scale,
            "normalization": normalization,
            "missingValuePolicy": missing_value_policy,
            "covariates": covariates,
            "source": source_metadata,
            "groupMapping": group_mapping,
            "computeVersion": COMPUTE_VERSION,
            "parametersHash": params_hash,
            "generatedAt": published_at,
        }
        summary.update(
            {
                "currentRevision": revision_key,
                "analysisStatus": analysis_status,
                "provenance": provenance,
                "availableArtifacts": sorted(artifacts),
            }
        )
        artifacts["summary"] = summary

        artifact_metadata: dict[str, tuple[str, int]] = {}
        for chart_type, payload in artifacts.items():
            stage_path = stage_dir / f"{chart_type}.json"
            write_json(stage_path, payload)
            # Parse once before publication so malformed JSON can never become current.
            json.loads(stage_path.read_text(encoding="utf-8"))
            artifact_metadata[chart_type] = (_sha256_file(stage_path), stage_path.stat().st_size)

        final_dir.parent.mkdir(parents=True, exist_ok=True)
        os.replace(stage_dir, final_dir)
        published_files = True
        total_artifact_bytes = sum(size for _, size in artifact_metadata.values())
        _log_import_event(
            slug=slug,
            revision=revision_key,
            stage="cache_publish",
            status="complete",
            started=started,
            artifact_bytes=total_artifact_bytes,
        )

        with connect() as conn:
            replace_normalized_dataset(
                conn,
                dataset_id,
                df,
                feature_cols,
                revision_id=revision_id,
            )
            conn.execute("DELETE FROM chart_artifacts WHERE dataset_id = ?", (dataset_id,))
            for chart_type, (artifact_sha256, size_bytes) in artifact_metadata.items():
                cache_path = final_dir / f"{chart_type}.json"
                _insert_revision_artifact(
                    conn,
                    revision_id,
                    chart_type,
                    cache_path,
                    artifact_sha256,
                    size_bytes,
                    published_at,
                )
                _upsert_chart_artifact(conn, dataset_id, chart_type, cache_path, published_at)

            conn.execute(
                """
                UPDATE datasets
                SET name = ?, description = ?, original_filename = ?, file_type = ?,
                    file_size = ?, status = 'published', current_revision_id = ?,
                    analysis_status = ?, provenance_json = ?,
                    sample_count = ?, species_count = ?, feature_count = ?,
                    feature_kind = ?, feature_label = ?, group_counts_json = ?,
                    import_warnings_json = ?, updated_at = ?, published_at = ?
                WHERE id = ?
                """,
                (
                    name,
                    description,
                    source.name,
                    file_type,
                    source_size,
                    revision_id,
                    analysis_status,
                    _json_text(provenance),
                    summary["totalSamples"],
                    summary["totalSpecies"],
                    summary.get("totalFeatures", summary["totalSpecies"]),
                    summary.get("featureKind", "taxonomy"),
                    summary.get("featureLabel", "物种"),
                    _json_text(summary["groupCounts"]),
                    _json_text(warnings),
                    published_at,
                    published_at,
                    dataset_id,
                ),
            )
            conn.execute(
                """
                UPDATE dataset_revisions
                SET status = 'published', validation_json = ?, warnings_json = ?, published_at = ?
                WHERE id = ?
                """,
                (_json_text(validation), _json_text(warnings), published_at, revision_id),
            )
            conn.execute(
                """
                UPDATE import_jobs
                SET status = 'success', stage = 'complete', message = 'Dataset revision published',
                    finished_at = ?
                WHERE id = ?
                """,
                (published_at, job_id),
            )

        _prune_old_revisions(dataset_id, revision_id)
        _log_import_event(
            slug=slug,
            revision=revision_key,
            stage="complete",
            status="success",
            started=started,
            artifact_bytes=total_artifact_bytes,
        )
        return dataset_id
    except Exception as exc:
        _log_import_event(
            slug=slug,
            revision=revision_key,
            stage="failed",
            status="failed",
            started=started,
            exception_type=type(exc).__name__,
        )
        failed_at = utcnow()
        error_text = _validation_error_text(exc)
        if dataset_id is not None:
            with connect() as conn:
                if previous_revision_id is None:
                    conn.execute(
                        "UPDATE datasets SET status = 'failed', updated_at = ? WHERE id = ?",
                        (failed_at, dataset_id),
                    )
                if revision_id is not None:
                    conn.execute(
                        "UPDATE dataset_revisions SET status = 'failed', error = ? WHERE id = ?",
                        (error_text, revision_id),
                    )
                if job_id is not None:
                    conn.execute(
                        """
                        UPDATE import_jobs
                        SET status = 'failed', stage = 'failed', error = ?, finished_at = ?
                        WHERE id = ?
                        """,
                        (error_text, failed_at, job_id),
                    )
        cleanup_path = final_dir if published_files else stage_dir
        try:
            shutil.rmtree(cleanup_path)
        except FileNotFoundError:
            pass
        raise


def main() -> None:  # pragma: no cover - exercised through the packaged CLI
    parser = argparse.ArgumentParser(description="Import and precompute an AD-Meta public dataset.")
    parser.add_argument("--file", required=True, type=Path, help="Path to .xlsx, .csv, or .tsv input file.")
    parser.add_argument("--slug", required=True, help="Public dataset slug, for example ad-nc-species.")
    parser.add_argument("--name", required=True, help="Public dataset display name.")
    parser.add_argument("--description", default="", help="Optional public dataset description.")
    parser.add_argument(
        "--abundance-scale",
        choices=["counts", "relative_abundance", "normalized_abundance", "unknown"],
        default="unknown",
    )
    parser.add_argument("--normalization", default="unknown")
    parser.add_argument("--missing-value-policy", choices=["error", "zero"], default="error")
    parser.add_argument(
        "--group-mapping",
        default="{}",
        help='Explicit legacy group mapping as JSON, for example {"1":"AD","0":"NC"}.',
    )
    args = parser.parse_args()

    dataset_id = import_dataset(
        args.file,
        args.slug,
        args.name,
        args.description,
        abundance_scale=args.abundance_scale,
        normalization=args.normalization,
        missing_value_policy=args.missing_value_policy,
        group_mapping=json.loads(args.group_mapping),
    )
    print(f"Imported dataset {dataset_id} ({args.slug})")


if __name__ == "__main__":  # pragma: no cover
    main()
