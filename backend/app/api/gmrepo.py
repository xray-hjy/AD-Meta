from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.gmrepo_models import (
    GmrepoAuditResponse,
    GmrepoCatalogResponse,
    GmrepoDistributionResponse,
    GmrepoErrorResponse,
    GmrepoEvidenceResponse,
    GmrepoGeneraResponse,
    GmrepoOverviewResponse,
    GmrepoSamplesResponse,
    GmrepoStatisticsResponse,
    ReferenceGroup,
    ReferenceScope,
)
from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_service as service

router = APIRouter(prefix="/api/references/gmrepo", tags=["gmrepo"], responses={503: {"model": GmrepoErrorResponse}})


def dataset(revision: str = Query(default="", max_length=64)) -> service.ReferenceDataset:
    data = service.load_reference_dataset()
    if revision and revision != data.fingerprint:
        raise HTTPException(409, "GMrepo 数据版本已变化，请刷新页面后重试。")
    return data


def selection(cohort: str = Query(default="", max_length=32, pattern=r"^(PRJ[A-Z0-9]+)?$"),
              group: ReferenceGroup = "", scope: ReferenceScope = "all") -> dict[str, str]:
    return {"cohort": cohort, "group": group, "scope": scope}


Data = Annotated[service.ReferenceDataset, Depends(dataset)]
Selection = Annotated[dict, Depends(selection)]


@router.get("/catalog", response_model=GmrepoCatalogResponse)
def catalog(data: Data):
    return service.catalog(data)


@router.get("/overview", response_model=GmrepoOverviewResponse)
def overview(data: Data, selected: Selection):
    try:
        return service.overview(data, **selected)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/genera", response_model=GmrepoGeneraResponse)
def genera(data: Data, query: str = Query(default="", max_length=100)):
    return service.genus_page(data, query)


@router.get("/samples", response_model=GmrepoSamplesResponse)
def samples(data: Data, selected: Selection,
            genus: str = Query(default="", max_length=32, pattern=r"^(NCBI:\d+)?$"),
            limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    try:
        return service.sample_page(data, **selected, genus=genus, limit=limit, offset=offset)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/audit", response_model=GmrepoAuditResponse)
def audit(data: Data):
    return analysis.audit_catalog(data)


@router.get("/distribution", response_model=GmrepoDistributionResponse)
def distribution(data: Data, cohort: str = Query(min_length=1, max_length=32, pattern=r"^PRJ[A-Z0-9]+$"),
                 genus: str = Query(max_length=32, pattern=r"^NCBI:\d+$")):
    try:
        return analysis.distribution(data, cohort, genus)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/statistics", response_model=GmrepoStatisticsResponse)
def statistics(data: Data, cohort: str = Query(min_length=1, max_length=32, pattern=r"^PRJ[A-Z0-9]+$"),
               query: str = Query(default="", max_length=100), limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    try:
        return analysis.statistics_page(data, cohort, query, limit, offset)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/evidence", response_model=GmrepoEvidenceResponse)
def evidence(data: Data, cohort: str = Query(min_length=1, max_length=32, pattern=r"^PRJ[A-Z0-9]+$"),
             genus: str = Query(max_length=32, pattern=r"^NCBI:\d+$")):
    try:
        return analysis.evidence(data, cohort, genus)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
