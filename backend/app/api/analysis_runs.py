from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.api.models import (
    AbundanceProjectionResponse,
    AnalysisFeaturePageResponse,
    AnalysisRunResponse,
    AnalysisSampleDetailResponse,
    AnalysisSamplePageResponse,
    ChartProjectionResponse,
    ErrorResponse,
    ProjectionAuditMetadataResponse,
    ProjectionAuditOptionsResponse,
    ProjectionAuditResponse,
    ProjectionAuditRowsResponse,
)
from app.domain.analysis_scope import (
    AbundanceProjectionRequest,
    AuditProjectionKind,
    ChartProjectionRequest,
    ProjectionAuditRequest,
    ProjectionKind,
    ScopedFeatureRequest,
    ScopedSampleRequest,
)
from app.services.analysis_projection_service import (
    AnalysisArtifactNotFound,
    AnalysisRunNotFound,
    AnalysisScopeError,
    get_analysis_sample,
    list_analysis_samples,
    list_scoped_analysis_samples,
    project_abundance,
)
from app.services.analysis_run_service import get_analysis_run, list_analysis_runs
from app.services.chart_projection_service import project_chart, query_scoped_features
from app.services.projection_audit_service import (
    ProjectionAuditMismatch,
    get_projection_audit,
    get_projection_audit_metadata,
    get_projection_audit_options,
    query_projection_audit_rows,
)

router = APIRouter(prefix="/api/analysis-runs", tags=["analysis-runs"])


@router.get("", response_model=list[AnalysisRunResponse], response_model_exclude_none=True)
def analysis_runs():
    return list_analysis_runs()


@router.get(
    "/{run_key}",
    response_model=AnalysisRunResponse,
    response_model_exclude_none=True,
    responses={404: {"model": ErrorResponse}},
)
def analysis_run(run_key: str):
    payload = get_analysis_run(run_key)
    if payload is None:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    return payload


def _projection_error(exc: Exception) -> HTTPException:
    if isinstance(exc, AnalysisRunNotFound):
        return HTTPException(status_code=404, detail="Analysis run not found")
    if isinstance(exc, AnalysisArtifactNotFound):
        return HTTPException(status_code=404, detail="Analysis artifact not found")
    return HTTPException(status_code=422, detail=str(exc))


@router.get(
    "/{run_key}/samples",
    response_model=AnalysisSamplePageResponse,
    response_model_exclude_none=True,
)
def analysis_samples(
    run_key: str,
    artifact_key: str | None = Query(default=None, alias="artifactKey"),
    phenotype: str | None = None,
    query: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    try:
        return list_analysis_samples(
            run_key,
            artifact_key=artifact_key,
            phenotype=phenotype,
            query=query,
            limit=limit,
            offset=offset,
        )
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc


@router.get(
    "/{run_key}/samples/{sample_code}",
    response_model=AnalysisSampleDetailResponse,
    response_model_exclude_none=True,
)
def analysis_sample(run_key: str, sample_code: str):
    try:
        payload = get_analysis_sample(run_key, sample_code)
    except AnalysisRunNotFound as exc:
        raise _projection_error(exc) from exc
    if payload is None:
        raise HTTPException(status_code=404, detail="Analysis sample not found")
    return payload


@router.post(
    "/{run_key}/artifacts/{artifact_key}/samples/query",
    response_model=AnalysisSamplePageResponse,
    response_model_exclude_none=True,
)
def scoped_analysis_samples(
    run_key: str,
    artifact_key: str,
    request: ScopedSampleRequest,
):
    try:
        return list_scoped_analysis_samples(
            run_key,
            artifact_key,
            request.scope,
            query=request.query,
            limit=request.limit,
            offset=request.offset,
        )
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc


@router.post(
    "/{run_key}/artifacts/{artifact_key}/features/query",
    response_model=AnalysisFeaturePageResponse,
    response_model_exclude_none=True,
)
def scoped_analysis_features(
    run_key: str,
    artifact_key: str,
    request: ScopedFeatureRequest,
):
    try:
        return query_scoped_features(run_key, artifact_key, request)
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc


@router.post(
    "/{run_key}/artifacts/{artifact_key}/projections/abundance",
    response_model=AbundanceProjectionResponse,
    response_model_exclude_none=True,
)
def abundance_projection(
    run_key: str,
    artifact_key: str,
    request: AbundanceProjectionRequest,
):
    try:
        return project_abundance(run_key, artifact_key, request)
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc


@router.post(
    "/{run_key}/artifacts/{artifact_key}/projections/{projection_kind}",
    response_model=ChartProjectionResponse,
    response_model_exclude_none=True,
)
def chart_projection(
    run_key: str,
    artifact_key: str,
    projection_kind: ProjectionKind,
    request: ChartProjectionRequest,
):
    try:
        return project_chart(run_key, artifact_key, projection_kind, request)
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc


@router.post(
    "/{run_key}/artifacts/{artifact_key}/projection-audits/{projection_kind}",
    response_model=ProjectionAuditResponse,
    response_model_exclude_none=True,
)
def projection_audit(
    run_key: str,
    artifact_key: str,
    projection_kind: AuditProjectionKind,
    request: ProjectionAuditRequest,
):
    try:
        return get_projection_audit(run_key, artifact_key, projection_kind, request)
    except ProjectionAuditMismatch as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc


@router.post(
    "/{run_key}/artifacts/{artifact_key}/projection-audits/{projection_kind}/metadata",
    response_model=ProjectionAuditMetadataResponse,
    response_model_exclude_none=True,
)
def projection_audit_metadata(
    run_key: str,
    artifact_key: str,
    projection_kind: AuditProjectionKind,
    request: ProjectionAuditRequest,
):
    try:
        return get_projection_audit_metadata(
            run_key,
            artifact_key,
            projection_kind,
            request,
        )
    except ProjectionAuditMismatch as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc


@router.post(
    "/{run_key}/artifacts/{artifact_key}/projection-audits/{projection_kind}/options/{field}",
    response_model=ProjectionAuditOptionsResponse,
    response_model_exclude_none=True,
)
def projection_audit_options(
    run_key: str,
    artifact_key: str,
    projection_kind: AuditProjectionKind,
    field: str,
    request: ProjectionAuditRequest,
    query: str = "",
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    if field not in {"feature", "sample", "status", "reason"}:
        raise HTTPException(status_code=422, detail="Unsupported projection audit option field")
    try:
        return get_projection_audit_options(
            run_key,
            artifact_key,
            projection_kind,
            request,
            field,
            query=query,
            limit=limit,
            offset=offset,
        )
    except ProjectionAuditMismatch as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc


@router.post(
    "/{run_key}/artifacts/{artifact_key}/projection-audits/{projection_kind}/rows",
    response_model=ProjectionAuditRowsResponse,
    response_model_exclude_none=True,
)
def projection_audit_rows(
    run_key: str,
    artifact_key: str,
    projection_kind: AuditProjectionKind,
    request: ProjectionAuditRequest,
):
    try:
        return query_projection_audit_rows(
            run_key,
            artifact_key,
            projection_kind,
            request,
        )
    except ProjectionAuditMismatch as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (AnalysisRunNotFound, AnalysisArtifactNotFound, AnalysisScopeError) as exc:
        raise _projection_error(exc) from exc
