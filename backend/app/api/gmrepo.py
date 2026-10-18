import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from app.api.gmrepo_models import (
    GmrepoAuditResponse,
    GmrepoCatalogResponse,
    GmrepoCandidateRequest,
    GmrepoDistributionResponse,
    GmrepoErrorResponse,
    GmrepoEvaluationPackageResponse,
    GmrepoEvaluationResponse,
    GmrepoEvidenceResponse,
    GmrepoGeneraResponse,
    GmrepoOverviewResponse,
    GmrepoResourcesResponse,
    GmrepoSamplesResponse,
    GmrepoStatisticsResponse,
    GmrepoSubjectResponse,
    ReferenceGroup,
    ReferenceScope,
)
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


@router.get("/resources", response_model=GmrepoResourcesResponse)
def resources(data: Data):
    from app.services.gmrepo_evaluation_service import resources as load_resources

    return load_resources(data)


@router.get("/comparison-catalog")
def comparison_catalog(data: Data, sourceRevision: str = "", datasetSlug: str = "ad-nc-species",
                       query: str = Query(default="", max_length=160), limit: int = Query(default=50, ge=1, le=2000),
                       offset: int = Query(default=0, ge=0), speciesIds: str = Query(default="", max_length=20000)):
    from app.services.gmrepo_candidate_service import catalog as candidates

    try:
        result = candidates(data, sourceRevision, datasetSlug)
        requested = set(speciesIds.split(",")) if speciesIds else set()
        if requested and not sourceRevision:
            raise ValueError("从主物种选择候选必须提供固定物种版本。")
        targeted = [r for r in result["items"] if not requested or requested.intersection((r.get("primaryStatistic") or {}).get("genus", {}).get("speciesFeatureIds", []))]
        covered = {sid for r in targeted for sid in (r.get("primaryStatistic") or {}).get("genus", {}).get("speciesFeatureIds", [])}
        result["unresolvedSpeciesIds"] = sorted(requested - covered)
        items = [r for r in targeted if query.casefold() in f"{r['name']} {r['candidateId']}".casefold()]
        return {**result, "items": items[offset:offset + limit], "total": len(items), "catalogTotal": len(result["items"]), "offset": offset, "limit": limit}
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/candidate-comparison", response_model=GmrepoEvaluationPackageResponse)
def candidate_comparison(data: Data, request: GmrepoCandidateRequest):
    from app.services.gmrepo_candidate_service import evaluate

    try:
        return evaluate(data, request.candidateIds, request.sourceRevision, request.datasetSlug)
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/candidate-report", response_class=PlainTextResponse)
def candidate_report(data: Data, evaluationId: str = Query(pattern=r"^[0-9a-f]{64}$")):
    from app.services.gmrepo_snapshot_service import load
    from app.services.gmrepo_candidate_service import report

    try:
        return PlainTextResponse(report(load(evaluationId)), headers={"Content-Disposition": 'attachment; filename="gmrepo-candidate-comparison.md"'})
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/wgs-reference")
def wgs_reference(query: str = Query(default="", max_length=160), level: str = Query(default="genus", pattern=r"^(genus|species)$")):
    from app.services.external_wgs_service import catalog

    try:
        return catalog(query, level)
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(503, "WGS 扩展参考不可校验，未替换 GMrepo 数据。") from exc


@router.get("/review-workspace")
def review_workspace(data: Data):
    from app.services.gmrepo_review_service import workspace

    try:
        return workspace(data)
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(503, "科研待审材料当前不可验证，未改用示意记录。") from exc


@router.get("/review-dossier", response_class=Response)
def review_dossier(data: Data):
    from app.services.gmrepo_review_service import dossier

    try:
        return Response(dossier(data), media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="gmrepo-scientific-review-dossier.zip"'})
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(422, "待审依据不可校验，未生成批准意见。") from exc


@router.get("/wgs-distribution")
def wgs_distribution(feature: str = Query(pattern=r"^MPA3:[0-9a-f]{20}$"), revision: str = Query(pattern=r"^[0-9a-f]{64}$")):
    from app.services.external_wgs_service import distribution

    try:
        return distribution(feature, revision)
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/resolve-subject", response_model=GmrepoSubjectResponse)
def resolve_subject(data: Data, subject_type: str = Query(alias="subjectType", pattern=r"^(species|mag|genus|ko)$"),
                    subject_id: str = Query(alias="subjectId", min_length=1, max_length=160),
                    source_revision: str = Query(default="", alias="sourceRevision", max_length=128),
                    dataset_slug: str = Query(default="ad-nc-species", alias="datasetSlug", max_length=100),
                    run_key: str = Query(default="", alias="runKey", max_length=150),
                    artifact_key: str = Query(default="", alias="artifactKey", max_length=150)):
    from app.services.gmrepo_evaluation_service import resolve_subject as resolve

    return resolve(data, subject_type, subject_id, source_revision, dataset_slug, run_key, artifact_key)


@router.get("/evidence-summary", response_model=GmrepoEvaluationResponse)
def evidence_summary(data: Data, genus: str = Query(pattern=r"^NCBI:\d+$"),
                     source_revision: str = Query(default="", alias="sourceRevision", max_length=128),
                     dataset_slug: str = Query(default="ad-nc-species", alias="datasetSlug", max_length=100),
                     subject_type: str = Query(default="", alias="subjectType", pattern=r"^(species|mag|genus)?$"),
                     subject_id: str = Query(default="", alias="subjectId", max_length=160),
                     run_key: str = Query(default="", alias="runKey", max_length=150),
                     artifact_key: str = Query(default="", alias="artifactKey", max_length=150),
                     source_chart: str = Query(default="", alias="sourceChart", max_length=100),
                     source_scope: str = Query(default="{}", alias="sourceScope", max_length=4000)):
    from app.services.gmrepo_evaluation_service import evidence_summary as summarize
    from app.services.gmrepo_evaluation_service import resolve_subject
    from app.services.gmrepo_snapshot_service import current_status, freeze

    try:
        subject = resolve_subject(data, subject_type, subject_id, source_revision, dataset_slug, run_key, artifact_key) if subject_type else None
        if subject and (subject["status"] != "mapped" or subject["genus"]["featureId"] != genus):
            raise ValueError("主对象与评估菌属没有可靠对应。")
        context = json.loads(source_scope)
        if not isinstance(context, dict):
            raise ValueError("来源范围应为结构化对象。")
        record = summarize(data, genus, source_revision if subject_type in {"", "species"} else "", dataset_slug)
        package = freeze(record, subject, {"runKey": run_key, "artifactKey": artifact_key, "sourceChart": source_chart, "scope": context})
        return {**package["payload"]["evaluation"], "evaluationId": package["evaluationId"], "snapshotStatus": current_status(package, data)}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(503, "评估快照当前无法保存；不会用未固定结果冒充固定报告。") from exc


@router.get("/evaluation-package", response_model=GmrepoEvaluationPackageResponse)
def evaluation_package(data: Data, evaluation_id: str = Query(alias="evaluationId", pattern=r"^[0-9a-f]{64}$")):
    from app.services.gmrepo_snapshot_service import current_status, load

    try:
        package = load(evaluation_id)
        return JSONResponse({**package, "currentStatus": current_status(package, data)}, headers={
            "Content-Disposition": f'attachment; filename="gmrepo-{evaluation_id}-evaluation.json"'})
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(422, "固定评估不可读或校验失败；不会回退当前结果。") from exc


@router.get("/recompute-package", response_class=Response)
def recompute_package(data: Data, evaluation_id: str = Query(alias="evaluationId", pattern=r"^[0-9a-f]{64}$")):
    from app.services.gmrepo_replay_service import bundle
    from app.services.gmrepo_snapshot_service import load

    try:
        raw = bundle(data, load(evaluation_id))
        return Response(raw, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="gmrepo-{evaluation_id}-reference-replay.zip"'})
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/report", response_class=PlainTextResponse)
def report(data: Data, genus: str = Query(pattern=r"^NCBI:\d+$"),
           subject_type: str = Query(default="", alias="subjectType", pattern=r"^(species|mag|genus|ko)?$"),
           subject_id: str = Query(default="", alias="subjectId", max_length=160),
           source_revision: str = Query(default="", alias="sourceRevision", max_length=128),
           dataset_slug: str = Query(default="ad-nc-species", alias="datasetSlug", max_length=100),
           run_key: str = Query(default="", alias="runKey", max_length=150),
           artifact_key: str = Query(default="", alias="artifactKey", max_length=150),
           source_chart: str = Query(default="", alias="sourceChart", max_length=100),
           source_scope: str = Query(default="{}", alias="sourceScope", max_length=4000),
           evaluation_id: str = Query(default="", alias="evaluationId", pattern=r"^([0-9a-f]{64})?$")):
    from app.services.gmrepo_evaluation_service import evidence_summary as summarize
    from app.services.gmrepo_evaluation_service import markdown_report, resolve_subject

    if evaluation_id:
        from app.services.gmrepo_snapshot_service import current_status, load

        try:
            package = load(evaluation_id)
            payload = package["payload"]
            subject = payload["subject"]
            if payload["evaluation"]["genus"]["featureId"] != genus or (subject_type and (not subject or subject["subjectType"] != subject_type or subject["subjectId"] != subject_id)):
                raise ValueError("报告对象与固定评估不符。")
            if source_revision and (not subject or subject["sourceRevision"] != source_revision):
                raise ValueError("报告主版本与固定评估不符。")
            status = current_status(package, data)
            preface = f"评估 ID：{evaluation_id}\n\n当前用途状态：{status['currentUse']}\n\n" + "\n\n".join(status["reasons"]) + "\n\n"
            return PlainTextResponse(preface + markdown_report(payload["evaluation"], subject, payload["sourceContext"]), media_type="text/markdown",
                                     headers={"Content-Disposition": f'attachment; filename="gmrepo-{evaluation_id}-evidence.md"'})
        except (OSError, ValueError, KeyError) as exc:
            raise HTTPException(422, "固定评估不存在、对象不匹配或校验失败；不会回退重算报告。") from exc
    subject = resolve_subject(data, subject_type, subject_id, source_revision, dataset_slug, run_key, artifact_key) if subject_type else None
    if subject is not None and (subject["status"] != "mapped" or subject["genus"]["featureId"] != genus):
        raise HTTPException(422, "主对象与报告菌属没有可靠对应。")
    try:
        main_revision = source_revision if subject_type == "species" else ""
        selected_slug = subject["datasetSlug"] if subject else dataset_slug
        record = summarize(data, genus, main_revision, selected_slug)
        scope_record = json.loads(source_scope)
        if not isinstance(scope_record, dict):
            raise ValueError("来源范围应为结构化对象。")
        context = {"runKey": run_key, "artifactKey": artifact_key, "sourceChart": source_chart, "scope": scope_record}
        return PlainTextResponse(markdown_report(record, subject, context), media_type="text/markdown",
                                 headers={"Content-Disposition": f'attachment; filename="gmrepo-{genus.replace(":", "-")}-evidence.md"'})
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


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
    from app.services import gmrepo_analysis_service as analysis

    return analysis.audit_catalog(data)


@router.get("/distribution", response_model=GmrepoDistributionResponse)
def distribution(data: Data, cohort: str = Query(min_length=1, max_length=32, pattern=r"^PRJ[A-Z0-9]+$"),
                 genus: str = Query(max_length=32, pattern=r"^NCBI:\d+$")):
    from app.services import gmrepo_analysis_service as analysis

    try:
        return analysis.distribution(data, cohort, genus)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/statistics", response_model=GmrepoStatisticsResponse)
def statistics(data: Data, cohort: str = Query(min_length=1, max_length=32, pattern=r"^PRJ[A-Z0-9]+$"),
               query: str = Query(default="", max_length=100), limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    from app.services import gmrepo_analysis_service as analysis

    try:
        return analysis.statistics_page(data, cohort, query, limit, offset)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/evidence", response_model=GmrepoEvidenceResponse)
def evidence(data: Data, cohort: str = Query(min_length=1, max_length=32, pattern=r"^PRJ[A-Z0-9]+$"),
             genus: str = Query(max_length=32, pattern=r"^NCBI:\d+$"),
             source_revision: str = Query(default="", alias="sourceRevision", max_length=128),
             dataset_slug: str = Query(default="ad-nc-species", alias="datasetSlug", max_length=100)):
    from app.services import gmrepo_analysis_service as analysis

    try:
        return analysis.evidence(data, cohort, genus, source_revision, dataset_slug)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
