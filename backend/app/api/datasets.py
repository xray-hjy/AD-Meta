from fastapi import APIRouter, HTTPException

from app.services.dataset_service import get_dataset, list_datasets, read_chart

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


@router.get("/datasets")
def datasets():
    return list_datasets()


@router.get("/datasets/{slug}")
def dataset(slug: str):
    payload = get_dataset(slug)
    if payload is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return payload


@router.get("/datasets/{slug}/summary")
def summary(slug: str):
    payload, error = read_chart(slug, "summary")
    _raise_chart_error(error, "Summary")
    return payload


@router.get("/datasets/{slug}/charts/{chart_type}")
def chart(slug: str, chart_type: str):
    payload, error = read_chart(slug, chart_type)
    _raise_chart_error(error)
    return payload
