"""Preview the exact ordination filter without running SVD or permutations."""
from app.compute.charts.ordination import prepare_pcoa_input
from app.core.database import connect
from app.domain.analysis_scope import ChartProjectionRequest
from app.services.analysis_projection_service import (
    AnalysisScopeError,
    _artifact_samples,
    _resolve_artifact,
    _resolve_run,
    _select_scope_samples,
)
from app.services.chart_projection_service import (
    _load_scoped_dataframe,
    _resolve_projection_parameters,
    _validate_projection,
    _validate_projection_parameters,
)


def preview_ordination(run_key: str, artifact_key: str, kind: str, request: ChartProjectionRequest) -> dict:
    if kind not in {"pca", "pcoa"}:
        raise AnalysisScopeError("Only PCA and PCoA support ordination previews")
    parameters = _resolve_projection_parameters(kind, request.parameters)
    _validate_projection_parameters(kind, request.topN, parameters)
    with connect() as conn:
        run = _resolve_run(conn, run_key)
        artifact = _resolve_artifact(conn, int(run["id"]), artifact_key)
        available = _artifact_samples(conn, int(run["id"]), int(artifact["id"]))
        selected = _select_scope_samples(available, request.scope)
        _validate_projection(kind, str(artifact["feature_kind"]), selected, request.scope)
        frame, features = _load_scoped_dataframe(conn, artifact, selected, request.scope)
    prepared = prepare_pcoa_input(frame, features, parameters["filterPreset"],
        parameters["minimumRelativeAbundance"], parameters["minimumPrevalence"], request.topN)
    return {"filter": prepared["filter"], "sampleFiltering": prepared["sampleFiltering"],
        "rows": [{key: value for key, value in row.items() if not key.startswith("_")} for row in prepared["auditRows"]],
        "parameters": parameters, "topN": request.topN, "scope": request.scope.model_dump()}
