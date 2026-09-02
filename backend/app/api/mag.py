from __future__ import annotations

import hashlib
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from app.api.mag_models import (
    MagDistributionResponse,
    MagErrorResponse,
    MagFeaturePageResponse,
    MagHeatmapResponse,
    MagOverviewResponse,
    MagQualityResponse,
    MagSamplesResponse,
    MagTaxonomyResponse,
)
from app.services import mag_data_service as service

router = APIRouter(prefix="/api/mag", tags=["mag"], responses={503: {"model": MagErrorResponse}})


def dataset(revision: str = Query(default="", max_length=64)) -> service.MagDataset:
    data = service.load_mag_dataset()
    if revision and revision != data.fingerprint:
        raise HTTPException(409, "MAG 数据版本已变化，请刷新工作区后重试；不会混用旧图表与新数据。")
    return data


def selection(
    disease: Literal["", "AD", "NC"] = "",
    gender: Literal["", "F", "M"] = "",
    batch: Literal["", "1", "2", "3", "4", "5"] = "",
    age_min: float | None = Query(default=None, alias="ageMin", ge=0, le=120, allow_inf_nan=False),
    age_max: float | None = Query(default=None, alias="ageMax", ge=0, le=120, allow_inf_nan=False),
    abundance_threshold_percent: float = Query(default=0, alias="abundanceThresholdPercent", ge=0, le=100, allow_inf_nan=False),
) -> service.MagScope:
    if age_min is not None and age_max is not None and age_min > age_max:
        raise HTTPException(422, "最低年龄不能大于最高年龄。")
    return service.MagScope(disease, gender, batch, age_min, age_max, abundance_threshold_percent)


Data = Annotated[service.MagDataset, Depends(dataset)]
Scope = Annotated[service.MagScope, Depends(selection)]
SortBy = Literal["magId", "meanPercent", "adMeanPercent", "ncMeanPercent", "meanDifferencePercentPoints", "qValue", "rankBiserial"]
TaxonomyRank = Literal["domain", "phylum", "class", "order", "family", "genus", "species"]


@router.get("/overview", response_model=MagOverviewResponse)
def overview(data: Data, scope: Scope):
    return service.overview(data, scope)


@router.get("/features", response_model=MagFeaturePageResponse)
def features(
    data: Data, scope: Scope,
    query: str = Query(default="", max_length=200),
    sort_by: Annotated[SortBy, Query(alias="sortBy")] = "meanPercent",
    direction: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return service.feature_page(data, scope, query=query, sort_by=sort_by, direction=direction, limit=limit, offset=offset)


@router.get("/features/{mag_id}", response_model=MagDistributionResponse)
def distribution(mag_id: str, data: Data, scope: Scope):
    try:
        return service.feature_distribution(data, scope, mag_id)
    except KeyError as exc:
        raise HTTPException(404, "MAG ID 不存在。") from exc


@router.get("/heatmap", response_model=MagHeatmapResponse)
def heatmap(data: Data, scope: Scope, top_n: int = Query(default=20, alias="topN", ge=1, le=50)):
    return service.heatmap(data, scope, top_n)


@router.get("/samples", response_model=MagSamplesResponse)
def samples(data: Data, scope: Scope):
    return {"provenance": service.provenance(data, scope), "items": service.sample_rows(data, scope)}


@router.get("/taxonomy", response_model=MagTaxonomyResponse)
def taxonomy(
    data: Data,
    scope: Scope,
    rank: TaxonomyRank = "phylum",
    top_n: int = Query(default=20, alias="topN", ge=5, le=50),
):
    return service.taxonomy_summary(data, scope, rank=rank, top_n=top_n)


@router.get("/quality", response_model=MagQualityResponse)
def quality(data: Data, scope: Scope):
    return service.quality_summary(data, scope)


@router.get("/downloads/{kind}", response_class=StreamingResponse,
            responses={200: {"content": {"text/csv": {}, "application/json": {}}}})
def download(
    kind: Literal["features", "matrix", "samples", "taxonomy", "quality", "provenance"], data: Data, scope: Scope,
    query: str = Query(default="", max_length=200),
    sort_by: Annotated[SortBy, Query(alias="sortBy")] = "meanPercent",
    direction: Literal["asc", "desc"] = "desc",
    view: Literal["features", "distribution", "heatmap", "taxonomy", "quality", "mapping"] = "features",
    top_n: int = Query(default=20, alias="topN", ge=1, le=50),
    mag_id: str = Query(default="", alias="magId", max_length=200),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    audit = service.provenance(data, scope)
    token = f"{data.version}-{kind}-{audit['requestFingerprint'][:12]}"
    if kind == "provenance":
        display: dict = {"view": view, "featureQuery": query, "sortBy": sort_by, "direction": direction,
                         "pageLimit": limit, "pageOffset": offset, "topN": top_n, "selectedMagId": mag_id}
        if view == "features":
            display["displayedMagIds"] = [r["magId"] for r in service.ordered_features(data, scope, query, sort_by, direction)[offset:offset + min(limit, 15)]]
        elif view == "heatmap":
            display["displayedMagIds"] = service.heatmap(data, scope, top_n)["magIds"]
            display["colorTransform"] = "log10(1 + abundance_percent)"
            display["sampleOrder"] = "disease / HPC_Batch / sampleId"
        elif view == "distribution":
            if mag_id not in data.mag_ids:
                raise HTTPException(404, "MAG ID 不存在。")
            display["displayedMagIds"] = [mag_id]
        elif view == "taxonomy":
            display["displayedMagIds"] = list(data.mag_ids) if data.taxonomy else []
            display["taxonomyScope"] = "all representative MAGs; independent of sample filters"
        elif view == "quality":
            display["displayedMagIds"] = list(data.mag_ids) if data.quality else []
            display["qualityScope"] = "all representative MAGs; independent of sample filters"
        if not audit["sampleCount"]:
            display["displayedMagIds"] = []
        display_hash = hashlib.sha256((audit["requestFingerprint"] + json.dumps(display, sort_keys=True)).encode()).hexdigest()
        return JSONResponse({**audit, "display": display, "projectionFingerprint": display_hash},
                            headers={"Content-Disposition": f'attachment; filename="{token}.json"'})
    if kind == "features":
        rows = service.ordered_features(data, scope, query, sort_by, direction)
        columns = list(service.comparison_rows(data, scope)[0])
    elif kind == "samples":
        rows = service.sample_rows(data, scope)
        columns = ["sampleId", "disease", "age", "gender", "batch", "mappedPercent", "unmappedPercent", "aboveThresholdMagCount"]
    elif kind == "taxonomy":
        if not data.taxonomy:
            raise service.MagDataError(service.TAXONOMY, "当前版本包含已核验的 MAG 分类输入", "未提供", data.version)
        rows = list(data.taxonomy)
        columns = ["magId", *service.TAXONOMY_RANKS, "classificationMethod", "closestReference", "closestAni", "closestAf", "msaPercent"]
    elif kind == "quality":
        if not data.quality:
            raise service.MagDataError(service.QUALITY, "当前版本包含已核验的 CheckM2 质量输入", "未提供", data.version)
        rows = list(data.quality)
        columns = ["magId", "completenessPercent", "contaminationPercent", "completenessModel", "codingDensity",
                   "contigN50Bp", "genomeSizeBp", "gcContent", "totalCodingSequences", "totalContigs",
                   "maxContigLengthBp", "inReferenceBand"]
    else:
        columns = ["sampleId", "disease", "age", "gender", "batch", *data.mag_ids]
        rows = [{**{k: data.samples[i][k] for k in columns[:5]}, **dict(zip(data.mag_ids, data.matrix[i].tolist(), strict=True))}
                for i in service.scope_indices(data, scope)]
    # Keep source identity and cohort parameters in every downloaded row.
    context = {"dataFingerprint": data.fingerprint, "requestFingerprint": audit["requestFingerprint"],
               "scopeJson": json.dumps(scope.as_dict(), sort_keys=True), "abundanceUnit": "%"}
    return StreamingResponse(service.stream_csv([{**row, **context} for row in rows], [*columns, *context]),
                             media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{token}.csv"'})
