from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager, suppress
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from app.api.analysis_runs import router as analysis_runs_router
from app.api.datasets import router as datasets_router
from app.core.config import (
    CACHE_ROOT,
    DEFAULT_CORS_ORIGINS,
    PROJECTION_CACHE_CLEANUP_BATCH_SIZE,
    PROJECTION_CACHE_CLEANUP_INTERVAL_SECONDS,
    STATS_WORKER_URL,
)
from app.core.database import connect, dispose_engine
from app.core.migrations import HEAD_REVISION, upgrade_database
from app.services.dataset_service import cache_metrics
from app.services.projection_audit_repository import cleanup_expired_audit_artifacts
from app.services.statistics_worker import worker_metrics

logger = logging.getLogger("ad_meta")


class RequestMetrics:
    def __init__(self) -> None:
        self.requests = 0
        self.errors = 0
        self.total_duration_seconds = 0.0

    def observe(self, status_code: int, duration: float) -> None:
        self.requests += 1
        self.errors += int(status_code >= 500)
        self.total_duration_seconds += duration


metrics = RequestMetrics()


async def _projection_cache_cleanup_loop() -> None:
    while True:
        try:
            deleted = await asyncio.to_thread(
                cleanup_expired_audit_artifacts,
                limit=PROJECTION_CACHE_CLEANUP_BATCH_SIZE,
            )
            if deleted:
                logger.info("Removed %s expired projection audit artifacts", deleted)
        except Exception:
            logger.exception("Projection audit cache cleanup failed")
        await asyncio.sleep(PROJECTION_CACHE_CLEANUP_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.migration_error = None
    cleanup_task = None
    try:
        upgrade_database()
    except Exception as exc:  # keep liveness available while readiness is false
        app.state.migration_error = f"{type(exc).__name__}: {exc}"
        logger.exception("Database migration failed")
    else:
        cleanup_task = asyncio.create_task(_projection_cache_cleanup_loop())
    try:
        yield
    finally:
        if cleanup_task is not None:
            cleanup_task.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup_task
        dispose_engine()


app = FastAPI(title="AD-Meta API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEFAULT_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_response(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", uuid.uuid4().hex)
    request.state.unhandled_exception_type = type(exc).__name__
    logger.error(
        "Unhandled request exception",
        exc_info=(type(exc), exc, exc.__traceback__),
        extra={"requestId": request_id, "path": request.url.path},
    )
    return JSONResponse(
        {"detail": "Internal Server Error", "requestId": request_id},
        status_code=500,
        headers={"X-Request-ID": request_id},
    )


@app.middleware("http")
async def request_observability(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    status_code = 500
    exception_type = None
    try:
        response = await call_next(request)
        status_code = response.status_code
        exception_type = getattr(request.state, "unhandled_exception_type", None)
    except Exception as exc:
        exception_type = type(exc).__name__
        raise
    finally:
        duration = time.perf_counter() - started
        metrics.observe(status_code, duration)
        parts = request.url.path.split("/")
        dataset = parts[3] if len(parts) > 3 and parts[2] == "datasets" else None
        revision = parts[5] if len(parts) > 5 and parts[4] == "revisions" else None
        logger.info(
            json.dumps(
                {
                    "event": "http_request",
                    "requestId": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "dataset": dataset,
                    "revision": revision,
                    "status": status_code,
                    "durationMs": round(duration * 1000, 2),
                    "exceptionType": exception_type,
                },
                ensure_ascii=False,
            )
        )
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/api/health/live")
def live():
    return {"status": "ok"}


@app.get("/api/health")
def health_compatibility():
    return {"status": "ok", "deprecated": True, "replacement": "/api/health/live"}


def _readiness_components(app_state) -> dict[str, dict[str, Any]]:
    components: dict[str, dict[str, Any]] = {
        "database": {"ok": False},
        "migration": {"ok": False, "expected": HEAD_REVISION},
        "cache": {"ok": False},
        "analysisRuns": {"ok": False, "publishedCount": 0},
        "statisticsWorker": {"ok": True, "enabled": bool(STATS_WORKER_URL)},
    }
    if getattr(app_state, "migration_error", None):
        components["migration"]["error"] = app_state.migration_error
        return components

    try:
        with connect() as conn:
            conn.execute("SELECT 1").fetchone()
            components["database"]["ok"] = True
            revision = conn.execute("SELECT version_num FROM alembic_version").fetchone()
            actual_revision = revision["version_num"] if hasattr(revision, "keys") else revision[0]
            components["migration"].update(
                {"ok": actual_revision == HEAD_REVISION, "actual": actual_revision}
            )
            run_row = conn.execute(
                "SELECT COUNT(*) AS value FROM analysis_runs WHERE status = 'published'"
            ).fetchone()
            published_run_count = int(run_row["value"])
            components["analysisRuns"] = {
                "ok": published_run_count > 0,
                "publishedCount": published_run_count,
            }
            rows = conn.execute(
                """
                SELECT revision_chart_artifacts.cache_path
                FROM datasets
                JOIN revision_chart_artifacts
                  ON revision_chart_artifacts.revision_id = datasets.current_revision_id
                WHERE datasets.status = 'published'
                """
            ).fetchall()
        missing = []
        for row in rows:
            raw_path = row["cache_path"]
            path = Path(raw_path)
            if not path.is_absolute():
                path = Path(__file__).resolve().parents[1] / path
            resolved = path.resolve()
            cache_root = CACHE_ROOT.resolve()
            if not (resolved == cache_root or cache_root in resolved.parents) or not resolved.is_file():
                missing.append(raw_path)
        components["cache"] = {"ok": not missing, "missingCount": len(missing)}
    except Exception as exc:
        components["database"]["error"] = f"{type(exc).__name__}: {exc}"

    if STATS_WORKER_URL:
        try:
            response = httpx.get(f"{STATS_WORKER_URL}/health", timeout=2.0)
            response.raise_for_status()
        except Exception as exc:
            components["statisticsWorker"] = {
                "ok": False,
                "enabled": True,
                "error": f"{type(exc).__name__}: {exc}",
            }
    return components


@app.get("/api/health/ready")
def ready(request: Request):
    components = _readiness_components(request.app.state)
    ok = all(component["ok"] for component in components.values())
    return JSONResponse(
        {"status": "ready" if ok else "not_ready", "components": components},
        status_code=200 if ok else 503,
    )


@app.get("/api/internal/metrics", include_in_schema=False)
def internal_metrics():
    operational: dict[str, Any] = {
        "jobStatuses": {},
        "importDurationSeconds": 0.0,
        "currentRevisions": 0,
        "artifactBytes": 0,
    }
    try:
        with connect() as conn:
            jobs = conn.execute("SELECT status, started_at, finished_at FROM import_jobs").fetchall()
            current = conn.execute(
                "SELECT COUNT(*) AS value FROM datasets WHERE current_revision_id IS NOT NULL"
            ).fetchone()
            artifact_bytes = conn.execute(
                "SELECT COALESCE(SUM(size_bytes), 0) AS value FROM revision_chart_artifacts"
            ).fetchone()
        for job in jobs:
            status = str(job["status"])
            operational["jobStatuses"][status] = operational["jobStatuses"].get(status, 0) + 1
            if job["started_at"] and job["finished_at"]:
                started = job["started_at"]
                finished = job["finished_at"]
                if not isinstance(started, datetime):
                    started = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
                if not isinstance(finished, datetime):
                    finished = datetime.fromisoformat(str(finished).replace("Z", "+00:00"))
                operational["importDurationSeconds"] += max(0.0, (finished - started).total_seconds())
        operational["currentRevisions"] = int(current["value"])
        operational["artifactBytes"] = int(artifact_bytes["value"])
    except Exception as exc:
        logger.warning("Operational metrics query failed: %s", exc)

    cache = cache_metrics()
    worker = worker_metrics()
    lines = [
        "# TYPE ad_meta_http_requests_total counter",
        f"ad_meta_http_requests_total {metrics.requests}",
        "# TYPE ad_meta_http_errors_total counter",
        f"ad_meta_http_errors_total {metrics.errors}",
        "# TYPE ad_meta_http_request_duration_seconds_total counter",
        f"ad_meta_http_request_duration_seconds_total {metrics.total_duration_seconds:.6f}",
        "# TYPE ad_meta_cache_requests_total counter",
        f"ad_meta_cache_requests_total {cache['requests']}",
        f"ad_meta_cache_hits_total {cache['hits']}",
        f"ad_meta_cache_misses_total {cache['misses']}",
        f"ad_meta_cache_errors_total {cache['errors']}",
        "# TYPE ad_meta_statistics_worker_attempts_total counter",
        f"ad_meta_statistics_worker_attempts_total {worker['attempts']}",
        f"ad_meta_statistics_worker_failures_total {worker['failures']}",
        "# TYPE ad_meta_import_duration_seconds_total counter",
        f"ad_meta_import_duration_seconds_total {operational['importDurationSeconds']:.6f}",
        "# TYPE ad_meta_current_revisions gauge",
        f"ad_meta_current_revisions {operational['currentRevisions']}",
        "# TYPE ad_meta_revision_artifact_bytes gauge",
        f"ad_meta_revision_artifact_bytes {operational['artifactBytes']}",
    ]
    for status, count in sorted(operational["jobStatuses"].items()):
        lines.append(f'ad_meta_import_jobs_total{{status="{status}"}} {count}')
    return PlainTextResponse(
        "\n".join(lines) + "\n",
        media_type="text/plain; version=0.0.4",
    )


app.include_router(datasets_router)
app.include_router(analysis_runs_router)
