from fastapi import APIRouter, HTTPException

from app.services.dataset_service import get_dataset, list_datasets, read_chart

router = APIRouter(prefix="/api", tags=["datasets"])


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
    if error == "dataset":
        raise HTTPException(status_code=404, detail="Dataset not found")
    if error == "chart":
        raise HTTPException(status_code=404, detail="Summary not found")
    if error == "cache":
        raise HTTPException(status_code=500, detail="Summary cache cannot be read")
    return payload


@router.get("/datasets/{slug}/charts/{chart_type}")
def chart(slug: str, chart_type: str):
    payload, error = read_chart(slug, chart_type)
    if error == "unsupported":
        raise HTTPException(status_code=400, detail="Unsupported chart type")
    if error == "dataset":
        raise HTTPException(status_code=404, detail="Dataset not found")
    if error == "chart":
        raise HTTPException(status_code=404, detail="Chart not found")
    if error == "cache":
        raise HTTPException(status_code=500, detail="Chart cache cannot be read")
    return payload
