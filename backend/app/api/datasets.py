from fastapi import APIRouter, HTTPException, Request, Response

from app.api.models import ChartArtifactPayload, DatasetResponse, ErrorResponse, SummaryResponse
from app.services.dataset_service import get_dataset, list_datasets, read_chart_with_metadata

router = APIRouter(prefix="/api", tags=["datasets"])


def _raise_chart_error(error: str | None, chart_name: str = "Chart") -> None:
    if error == "unsupported":
        raise HTTPException(status_code=400, detail="Unsupported chart type")
    if error == "dataset":
        raise HTTPException(status_code=404, detail="Dataset not found")
    if error == "chart":
        raise HTTPException(status_code=404, detail=f"{chart_name} not found")
    if error == "cache":
        raise HTTPException(status_code=500, detail=f"{chart_name} cache cannot be read")


def _cached_chart_response(
    slug: str,
    chart_type: str,
    request: Request,
    response: Response,
    *,
    revision_key: str | None = None,
    chart_name: str = "Chart",
):
    payload, error, metadata = read_chart_with_metadata(slug, chart_type, revision_key)
    _raise_chart_error(error, chart_name)
    etag = metadata.get("etag") if metadata else None
    if etag:
        quoted_etag = f'"{etag}"'
        if request.headers.get("if-none-match") == quoted_etag:
            return Response(status_code=304, headers={"ETag": quoted_etag})
        response.headers["ETag"] = quoted_etag
    if metadata and metadata.get("lastModified"):
        response.headers["Last-Modified"] = str(metadata["lastModified"])
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    if chart_type == "lda":
        response.headers["Deprecation"] = "true"
        response.headers["Link"] = '</api/datasets/{slug}/charts/differential_ko>; rel="successor-version"'.format(
            slug=slug
        )
    return payload


@router.get("/datasets", response_model=list[DatasetResponse], response_model_exclude_none=True)
def datasets():
    return list_datasets()


@router.get("/datasets/{slug}", response_model=DatasetResponse, response_model_exclude_none=True)
def dataset(slug: str):
    payload = get_dataset(slug)
    if payload is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return payload


@router.get(
    "/datasets/{slug}/summary",
    response_model=SummaryResponse,
    response_model_exclude_none=True,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def summary(slug: str, request: Request, response: Response):
    return _cached_chart_response(slug, "summary", request, response, chart_name="Summary")


@router.get(
    "/datasets/{slug}/charts/{chart_type}",
    response_model=ChartArtifactPayload,
    response_model_exclude_none=True,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def chart(slug: str, chart_type: str, request: Request, response: Response):
    return _cached_chart_response(slug, chart_type, request, response)


@router.get(
    "/datasets/{slug}/revisions/{revision_key}/charts/{chart_type}",
    response_model=ChartArtifactPayload,
    response_model_exclude_none=True,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def revision_chart(
    slug: str,
    revision_key: str,
    chart_type: str,
    request: Request,
    response: Response,
):
    return _cached_chart_response(
        slug,
        chart_type,
        request,
        response,
        revision_key=revision_key,
    )
