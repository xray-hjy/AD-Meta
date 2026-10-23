from __future__ import annotations

import hashlib
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from app.api.mag_function_models import (
    FunctionalCommunity,
    FunctionalEvidence,
    FunctionalGenePage,
    FunctionalMatrix,
    FunctionalOverview,
    FunctionalPage,
    FunctionalSignals,
)
from app.api.mag_models import (
    MagCatalogResponse,
    MagCrosswalkPageResponse,
    MagDistributionResponse,
    MagErrorResponse,
    MagFeaturePageResponse,
    MagHeatmapResponse,
    MagLineageClusterDetailResponse,
    MagLineageClusterPageResponse,
    MagLineageResponse,
    MagOverviewResponse,
    MagQualityResponse,
    MagSamplesResponse,
    MagSuggestionsResponse,
    MagTaxonomyResponse,
)
from app.core.config import BACKEND_ROOT, RAW_ROOT, SETTINGS
from app.services import cohort_repository as repository
from app.services import mag_analysis_service as service
from app.services import mag_function_service as functions
from app.services.mag_suggestions import suggestions as search_suggestions

router = APIRouter(prefix="/api/mag", tags=["mag"], responses={503: {"model": MagErrorResponse}})


def dataset(revision: str = Query(default="", max_length=64), dataset: str = Query(default="", max_length=128),
            release: str = Query(default="", max_length=64)) -> service.MagDataset:
    if revision and release and revision != release:
        raise HTTPException(409, '请求中的结果修订不一致。')
    try:
        data = service.load_mag_dataset(dataset, revision or release)
        if (revision or release) and data.fingerprint != (revision or release):
            raise HTTPException(409, '请求中的分析记录与数据快照不一致。')
        return data
    except service.MagDataError as exc:
        if revision or release:
            raise HTTPException(409, '指定数据集或分析记录不可用；不会切换到其他记录。') from exc
        raise


def selection(
    disease: Literal["", "AD", "NC"] = "",
    gender: Literal["", "F", "M"] = "",
    batch: str = Query(default="", max_length=128),
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
MappingStatus = Literal[
    "",
    "matched_exact_ncbi_species_taxid",
    "ncbi_species_taxid_not_observed_in_reads",
    "no_gtdb_reference",
]


@router.get('/datasets')
def datasets():
    return {'items': repository.list_cohorts(), 'defaultDataset': SETTINGS.mag_dataset}


@router.get('/datasets/{dataset_key}/releases')
def releases(dataset_key: str):
    return {'items': repository.list_releases(dataset_key)}


@router.get('/sources')
def sources(data: Data):
    return {'dataset': data.version, 'release': data.fingerprint,
            'modules': repository.release_sources(data.fingerprint)}


MODULE_KINDS = {'arg': {'arg_summary', 'arg_hits'}, 'bgc': {'bgc_status', 'bgc_regions'}, 'phylogeny': {'trees'},
                'coverage': {'coverage_metrics'}, 'archive': {'archived_files'}}


def functional_call(call, *args, **kwargs):
    try:
        return call(*args, **kwargs)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get('/functions/overview', response_model=FunctionalOverview)
def functional_overview(data: Data):
    return functional_call(functions.overview, data)


@router.get('/functions/features', response_model=FunctionalPage)
def functional_features(data: Data, namespace: str = 'kofam_ko', query: str = Query('', max_length=200),
                        mag_id: str = Query('', alias='magId', max_length=160), ids: str = Query('', max_length=20000),
                        limit: int = Query(25, ge=1, le=1000), offset: int = Query(0, ge=0)):
    return functional_call(functions.feature_page, data, namespace, query, mag_id, ids, limit, offset)


def functional_settings(namespace: str = 'kofam_ko', query: str = Query('', max_length=200),
                        mag_query: str = Query('', alias='magQuery', max_length=200),
                        feature_ids: str = Query('', alias='featureIds', max_length=20000),
                        mag_ids: str = Query('', alias='magIds', max_length=150000),
                        mag_limit: int = Query(40, alias='magLimit', ge=1, le=1000),
                        feature_limit: int = Query(30, alias='featureLimit', ge=1, le=1000),
                        completeness: float | None = Query(None, alias='minCompleteness', ge=0, le=100, allow_inf_nan=False),
                        contamination: float | None = Query(None, alias='maxContamination', ge=0, le=100, allow_inf_nan=False),
                        row_order: Literal['taxonomy', 'cluster'] = Query('taxonomy', alias='rowOrder'),
                        column_order: Literal['rank', 'id', 'cluster'] = Query('rank', alias='columnOrder'),
                        value_kind: Literal['presence', 'count'] = Query('presence', alias='valueKind')):
    return dict(namespace=namespace, query=query, mag_query=mag_query, feature_ids=feature_ids, mag_ids=mag_ids,
                mag_limit=mag_limit, feature_limit=feature_limit, completeness=completeness, contamination=contamination,
                row_order=row_order, column_order=column_order, value_kind=value_kind)


@router.get('/functions/matrix', response_model=FunctionalMatrix)
def functional_matrix(data: Data, settings: Annotated[dict, Depends(functional_settings)]):
    return functional_call(functions.matrix, data, **settings)


@router.get('/functions/carriers', response_model=FunctionalPage)
def functional_carriers(data: Data, scope: Scope, namespace: str = 'kofam_ko',
                        feature_id: str = Query(..., alias='featureId', max_length=300),
                        sort_by: str = Query('geneCount', alias='sortBy'), limit: int = Query(25, ge=1, le=1000), offset: int = Query(0, ge=0)):
    return functional_call(functions.carriers, data, scope, namespace, feature_id, limit, offset, sort_by)


@router.get('/functions/genes', response_model=FunctionalGenePage)
def functional_genes(data: Data, mag_id: str = Query(..., alias='magId', max_length=160), namespace: str = '',
                     feature_id: str = Query('', alias='featureId', max_length=300), contig: str = Query('', max_length=300),
                     start: int | None = Query(None, ge=0), stop: int | None = Query(None, ge=0),
                     query: str = Query('', max_length=200), limit: int = Query(25, ge=1, le=2000), offset: int = Query(0, ge=0)):
    return functional_call(functions.genes, data, mag_id, namespace, feature_id, contig, start, stop, query, limit, offset)


@router.get('/functions/themes/{theme_id}', response_model=FunctionalMatrix)
def functional_theme(theme_id: str, data: Data, mag_ids: str = Query('', alias='magIds', max_length=150000),
                     mag_limit: int = Query(40, alias='magLimit', ge=1, le=1000)):
    return functional_call(functions.theme, data, theme_id, mag_ids, mag_limit)


@router.get('/functions/sources/{module}/matrix', response_model=FunctionalMatrix)
def functional_source_matrix(module: Literal['arg', 'bgc'], data: Data, category: str = 'known_hmm_hit',
                              mag_limit: int = Query(40, alias='magLimit', ge=1, le=200),
                              feature_limit: int = Query(30, alias='featureLimit', ge=1, le=100)):
    return functional_call(functions.source_matrix, data, module, category, mag_limit, feature_limit)


@router.get('/functions/sources/{module}/details', response_model=FunctionalPage)
def functional_source_details(module: Literal['arg', 'bgc'], data: Data,
                               mag_id: str = Query('', alias='magId', max_length=160), query: str = Query('', max_length=200),
                               category: str = '', limit: int = Query(25, ge=1, le=2000), offset: int = Query(0, ge=0)):
    return functional_call(functions.source_details, data, module, mag_id, query, category, limit, offset)


@router.get('/functions/coverage', response_model=FunctionalEvidence)
def functional_coverage(data: Data, scope: Scope, mag_id: str = Query(..., alias='magId', max_length=160)):
    return functional_call(functions.coverage, data, scope, mag_id)


@router.get('/functions/compare', response_model=FunctionalEvidence)
def functional_compare(data: Data, scope: Scope, mag_ids: str = Query(..., alias='magIds', max_length=150000)):
    return functional_call(functions.compare, data, scope, mag_ids)


@router.get('/functions/community', response_model=FunctionalCommunity)
def functional_community(data: Data, feature_id: str = Query(..., alias='featureId', max_length=16)):
    return functional_call(functions.community, data, feature_id)


@router.get('/functions/distributions', response_model=FunctionalPage)
def functional_distributions(data: Data, scope: Scope, mag_ids: str = Query(..., alias='magIds', max_length=150000),
                              limit: int = Query(6, ge=1, le=12), offset: int = Query(0, ge=0)):
    return functional_call(functions.distributions, data, scope, mag_ids, limit, offset)


@router.get('/functions/signals', response_model=FunctionalSignals)
def functional_signals(data: Data, scope: Scope, namespace: str = 'kofam_ko', kind: str = 'carriers',
                        feature_id: str = Query('', alias='featureId', max_length=300), query: str = Query('', max_length=200),
                        limit: int = Query(25, ge=1, le=1000), offset: int = Query(0, ge=0)):
    return functional_call(functions.signals, data, scope, namespace, kind, feature_id, query, limit, offset)


@router.get('/functions/download/{kind}')
def functional_download(kind: Literal['features', 'matrix', 'carriers', 'genes', 'arg', 'bgc', 'signals', 'provenance', 'distributions'],
                        data: Data, scope: Scope, settings: Annotated[dict, Depends(functional_settings)],
                        mag_id: str = Query('', alias='magId', max_length=160), feature_id: str = Query('', alias='featureId', max_length=300),
                        all_matches: bool = Query(False, alias='allMatches'), category: str = '',
                        signal_kind: str = Query('carriers', alias='signalKind'), contig: str = Query('', max_length=300)):
    import io

    from app.services.csv_export import SpreadsheetSafeDictWriter
    from app.services.mag_function_store import open_store

    if kind == 'provenance':
        return JSONResponse({'provenance': service.provenance(data, scope), 'functional': data.modules.get('metabolism'),
                             'settings': settings, 'featureId': feature_id, 'magId': mag_id},
                            headers={'Content-Disposition': 'attachment; filename="MAG-functional-provenance.json"'})
    if kind == 'distributions':
        selected_mags = functional_call(functions._mags, data, ids=settings['mag_ids']) if settings['mag_ids'] else []
        headers = ['magId', 'sampleId', 'disease', 'gender', 'batch', 'age', 'abundancePercent']

        def distribution_rows():
            for row in selected_mags:
                for sample in service.feature_distribution(data, scope, row['magId'])['samples']:
                    yield {'magId': row['magId'], **sample}
        items = distribution_rows()
    elif kind == 'matrix':
        mags = functional_call(functions._mags, data, settings['mag_query'], settings['mag_ids'], settings['completeness'], settings['contamination'])
        fields = functional_call(functions.feature_rows, data, settings['namespace'], settings['query'], ids=settings['feature_ids'])
        if not all_matches:
            projected = functional_call(functions.matrix, data, **settings)
            mags, fields = projected['mags'], projected['features']
        headers = ['MAG', *[r['featureId'] for r in fields]]

        def matrix_rows():
            with open_store(data) as conn:
                for row in mags:
                    values = {r['feature_id']: r['gene_count'] for r in conn.execute('''SELECT f.feature_id,c.gene_count FROM counts c
                      JOIN features f USING(feature_key) JOIN mags m USING(mag_key) WHERE m.mag_id=? AND namespace=?''',
                      (row['magId'], settings['namespace']))}
                    yield {'MAG': row['magId'], **{r['featureId']: values.get(r['featureId'], 0) for r in fields}}
        items = matrix_rows()
    else:
        def page(offset):
            if kind == 'features':
                return functions.feature_page(data, settings['namespace'], settings['query'], mag_id, settings['feature_ids'], 1000, offset)
            if kind == 'carriers':
                return functions.carriers(data, scope, settings['namespace'], feature_id, 1000, offset)
            if kind == 'genes':
                return functions.genes(data, mag_id, settings['namespace'], feature_id, contig=contig, limit=1000, offset=offset)
            if kind == 'signals':
                return functions.signals(data, scope, settings['namespace'], signal_kind, query=settings['query'], limit=1000, offset=offset)
            return functions.source_details(data, kind, mag_id, settings['query'], category, 1000, offset)
        first = functional_call(page, 0)
        headers = list(first['items'][0]) if first['items'] else ['id']

        def paged_rows():
            yield from first['items']
            for offset in range(1000, first['total'], 1000):
                yield from page(offset)['items']
        items = paged_rows()

    def stream():
        buffer = io.StringIO()
        writer = SpreadsheetSafeDictWriter(buffer, headers)
        writer.writeheader()
        yield '\ufeff' + buffer.getvalue()
        for row in items:
            buffer.seek(0)
            buffer.truncate(0)
            writer.writerow({key: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value for key, value in row.items()})
            yield buffer.getvalue()
    return StreamingResponse(stream(), media_type='text/csv; charset=utf-8',
                             headers={'Content-Disposition': f'attachment; filename="MAG-{kind}-{data.fingerprint[:12]}.csv"'})


@router.get('/modules/{module}/records')
def module_records(module: str, data: Data, kind: str, mag_id: str = Query(default='', alias='magId', max_length=160),
                   query: str = Query(default='', max_length=160), limit: int = Query(default=25, ge=1, le=1000),
                   offset: int = Query(default=0, ge=0), rank_by: str = Query(default='', alias='rankBy', max_length=32)):
    if kind not in MODULE_KINDS.get(module, set()):
        raise HTTPException(400, '不支持的结果类型。')
    state = data.modules.get(module, {})
    if state.get('status') not in {'ready', 'partial'}:
        return {'dataset': data.version, 'release': data.fingerprint, 'status': state.get('status', 'not_provided'),
                'items': [], 'total': 0, 'limit': limit, 'offset': offset, 'report': state}
    if rank_by:
        allowed = {'arg_summary': {'knownHits', 'novel075', 'novel095'}, 'bgc_status': {'regionCount'}}
        if rank_by not in allowed.get(kind, set()):
            raise HTTPException(400, '不支持的汇总排序指标。')
        items, total = repository.records(state['revision'], kind, mag_id=mag_id, query=query)
        items = sorted(items, key=lambda row: (row[rank_by] is None, -(row[rank_by] or 0), row['magId']))[offset:offset+limit]
    else:
        items, total = repository.records(state['revision'], kind, limit, offset, mag_id, query)
    return {'dataset': data.version, 'release': data.fingerprint, 'status': state['status'],
            'items': items, 'total': total, 'limit': limit, 'offset': offset, 'report': state}


@router.get('/sources/{module}/{index}')
def source_download(module: str, index: int, data: Data):
    state = data.modules.get(module, {})
    if 'revision' not in state:
        raise HTTPException(404, '没有对应来源。')
    files = repository.artifact_info(state['revision'])['sources']
    if index < 0 or index >= len(files):
        raise HTTPException(404, '没有对应来源。')
    entry = files[index]
    path = (BACKEND_ROOT / entry['file']).resolve()
    if not path.is_relative_to(RAW_ROOT.resolve()) or not path.is_file():
        raise HTTPException(404, '原文件当前未挂载；已导入的结果仍可查询。')
    from app.services.cohort_import import sha256
    if path.stat().st_size != entry['bytes'] or sha256(path) != entry['sha256']:
        raise HTTPException(409, '原文件与该分析记录的来源校验值不一致。')
    return FileResponse(path, filename=path.name, headers={'X-Content-SHA256': entry['sha256']})


def heatmap_settings(
    mode: Literal["abundance", "variance", "candidate"] = Query(default="abundance", alias="heatmapMode"),
    query: str = Query(default="", alias="heatmapQuery", max_length=200),
    ids: str = Query(default="", alias="heatmapIds", max_length=200000),
    candidate: Literal["statistics", "manual"] = Query(default="statistics", alias="candidateKind"),
    mean: float = Query(default=0, alias="minMean", ge=0, le=100, allow_inf_nan=False),
    threshold: float = Query(default=0, alias="sampleThreshold", ge=0, le=100, allow_inf_nan=False),
    ratio: float = Query(default=0, alias="minSamplePercent", ge=0, le=100, allow_inf_nan=False),
    completeness: float | None = Query(default=None, alias="minCompleteness", ge=0, le=100, allow_inf_nan=False),
    contamination: float | None = Query(default=None, alias="maxContamination", ge=0, le=100, allow_inf_nan=False),
    q: float = Query(default=0.05, alias="maxQ", ge=0, le=1, allow_inf_nan=False),
    effect: float = Query(default=0, alias="minEffect", ge=0, le=1, allow_inf_nan=False),
    sample_order: Literal["group", "withinGroup", "cluster"] = Query(default="group", alias="sampleOrder"),
    row_order: Literal["rank", "cluster"] = Query(default="rank", alias="rowOrder"),
    color: Literal["abundance", "rowZ"] = Query(default="abundance", alias="colorMode"),
) -> dict:
    return {"heatmapMode": mode, "heatmapQuery": query, "heatmapIds": ids, "candidateKind": candidate,
            "minMean": mean, "sampleThreshold": threshold, "minSamplePercent": ratio,
            "minCompleteness": completeness, "maxContamination": contamination, "maxQ": q, "minEffect": effect,
            "sampleOrder": sample_order, "rowOrder": row_order, "colorMode": color}


HeatmapSettings = Annotated[dict, Depends(heatmap_settings)]


def heatmap_result(data, scope, top_n, settings):
    try:
        return service.heatmap(data, scope, top_n, settings)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/overview", response_model=MagOverviewResponse)
def overview(data: Data, scope: Scope):
    return service.overview(data, scope)


@router.get("/catalog", response_model=MagCatalogResponse)
def catalog(data: Data):
    return service.catalog(data)


@router.get("/suggestions", response_model=MagSuggestionsResponse)
def suggestions(data: Data, context: Literal["lineage", "crosswalk"] = "lineage",
                query: str = Query(default="", max_length=200), limit: int = Query(default=20, ge=1, le=50)):
    return search_suggestions(data, context=context, query=query, limit=limit)


@router.get("/features", response_model=MagFeaturePageResponse)
def features(
    data: Data, scope: Scope,
    query: str = Query(default="", max_length=200),
    sort_by: Annotated[SortBy, Query(alias="sortBy")] = "meanPercent",
    direction: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=25, ge=1, le=300),
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
def heatmap(data: Data, scope: Scope, settings: HeatmapSettings,
            top_n: int = Query(default=20, alias="topN", ge=0, le=1000)):
    return heatmap_result(data, scope, top_n, settings)


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


@router.get("/lineage/clusters", response_model=MagLineageClusterPageResponse)
def lineage_clusters(
    data: Data,
    scope: Scope,
    query: str = Query(default="", max_length=200),
    mapping_status: Annotated[MappingStatus, Query(alias="mappingStatus")] = "",
    low_ani_only: bool = Query(default=False, alias="lowAniOnly"),
    sort_by: Annotated[
        Literal[
            "clusterId", "representativeMag", "memberCount", "sourceSampleCount", "aniMin", "aniMax",
            "below095AniCount", "completenessPercent", "contaminationPercent",
        ],
        Query(alias="sortBy"),
    ] = "memberCount",
    direction: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=25, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
):
    return service.lineage_cluster_page(
        data, scope, query=query, mapping_status=mapping_status, low_ani_only=low_ani_only,
        sort_by=sort_by, direction=direction, limit=limit, offset=offset,
    )


@router.get("/lineage/clusters/{cluster_id}", response_model=MagLineageClusterDetailResponse)
def lineage_cluster(
    cluster_id: str,
    data: Data,
    scope: Scope,
    query: str = Query(default="", max_length=200),
    member_disease: Literal["", "AD", "NC"] = Query(default="", alias="memberDisease"),
    source_group: str = Query(default="", alias="sourceGroup", max_length=128),
    low_ani_only: bool = Query(default=False, alias="lowAniOnly"),
    sort_by: Annotated[
        Literal["memberMag", "memberSourceSampleId", "memberToRepAni", "memberToRepAlignmentCoverage"],
        Query(alias="sortBy"),
    ] = "memberToRepAni",
    direction: Literal["asc", "desc"] = "asc",
    limit: int = Query(default=25, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
):
    try:
        return service.lineage_cluster_detail(
            data, scope, cluster_id, query=query, disease=member_disease, group=source_group,
            low_ani_only=low_ani_only, sort_by=sort_by, direction=direction, limit=limit, offset=offset,
        )
    except KeyError as exc:
        raise HTTPException(404, "dRep 聚类不存在。") from exc


@router.get("/lineage/mags/{mag_id}", response_model=MagLineageResponse)
def lineage_mag(mag_id: str, data: Data, scope: Scope):
    try:
        return service.mag_lineage(data, scope, mag_id)
    except KeyError as exc:
        raise HTTPException(404, "MAG ID 不存在于 lineage。") from exc


@router.get("/crosswalk", response_model=MagCrosswalkPageResponse)
def crosswalk(
    data: Data,
    scope: Scope,
    query: str = Query(default="", max_length=200),
    mapping_status: Annotated[MappingStatus, Query(alias="mappingStatus")] = "",
    limit: int = Query(default=25, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
):
    return service.crosswalk_page(
        data, scope, query=query, mapping_status=mapping_status, limit=limit, offset=offset,
    )


@router.get("/downloads/{kind}", response_class=StreamingResponse,
            responses={200: {"content": {"text/csv": {}, "text/tab-separated-values": {}, "application/json": {}}}})
def download(
    kind: Literal["features", "matrix", "samples", "taxonomy", "quality", "provenance", "lineage", "crosswalk", "heatmap"], data: Data, scope: Scope,
    heatmap_options: HeatmapSettings,
    query: str = Query(default="", max_length=200),
    sort_by: Annotated[SortBy, Query(alias="sortBy")] = "meanPercent",
    direction: Literal["asc", "desc"] = "desc",
    view: Literal["features", "distribution", "heatmap", "taxonomy", "quality", "mapping"] = "features",
    chart_sort_by: Literal["meanPercent", "adMeanPercent", "ncMeanPercent"] = Query(default="meanPercent", alias="chartSortBy"),
    rank: TaxonomyRank = "phylum",
    top_n: int = Query(default=20, alias="topN", ge=0, le=1000),
    mag_id: str = Query(default="", alias="magId", max_length=200),
    limit: int = Query(default=25, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
):
    audit = service.provenance(data, scope)
    token = f"{data.version}-{kind}-{audit['requestFingerprint'][:12]}"
    if kind in {"lineage", "crosswalk"}:
        rows = list(data.lineage if kind == 'lineage' else data.crosswalk)
        columns = list(rows[0]) if rows else ['magId']
        return StreamingResponse(service.stream_csv(rows, columns), media_type='text/csv; charset=utf-8',
                                 headers={'Content-Disposition': f'attachment; filename="{token}.csv"',
                                          'X-Data-Fingerprint': data.fingerprint})
    if kind == "provenance":
        display: dict = {"view": view, "featureQuery": query, "sortBy": sort_by, "direction": direction,
                         "pageLimit": limit, "pageOffset": offset, "topN": top_n, "selectedMagId": mag_id,
                         "chartSortBy": chart_sort_by}
        if view == "features":
            display["displayedMagIds"] = [r["magId"] for r in service.ordered_features(data, scope, query, chart_sort_by, "desc")[:top_n or None]]
        elif view == "heatmap":
            heatmap_data = heatmap_result(data, scope, top_n, heatmap_options)
            display.update({"displayedMagIds": heatmap_data["magIds"],
                            "sampleIds": [s["sampleId"] for s in heatmap_data["samples"]],
                            "heatmapSettings": heatmap_data["settings"], "methods": heatmap_data["methods"],
                            "selectionAudit": heatmap_data["selectionAudit"], "warnings": heatmap_data["warnings"],
                            "colorTransform": heatmap_data["methods"]["colorTransform"],
                            "sampleOrder": heatmap_data["methods"]["sampleOrder"]})
        elif view == "distribution":
            if mag_id not in data.mag_ids:
                raise HTTPException(404, "MAG ID 不存在。")
            display["displayedMagIds"] = [mag_id]
        elif view == "taxonomy":
            taxonomy_projection = service.taxonomy_summary(data, scope, rank=rank, top_n=top_n)
            display["taxonomyRank"] = rank
            display["displayedTaxa"] = [item["label"] for item in taxonomy_projection["items"]]
            display["displayedMagIds"] = list(data.mag_ids) if data.taxonomy else []
            display["taxonomyScope"] = "all representative MAGs; independent of sample filters"
        elif view == "quality":
            display["displayedMagIds"] = list(data.mag_ids) if data.quality else []
            display["qualityScope"] = "all representative MAGs; independent of sample filters"
        if not audit["sampleCount"]:
            display["displayedMagIds"] = []
        display_hash = hashlib.sha256((audit["requestFingerprint"] + json.dumps(display, sort_keys=True)).encode()).hexdigest()
        return JSONResponse({**audit, "display": display, "projectionFingerprint": display_hash,
                             "sourceInventory": repository.release_sources(data.fingerprint)},
                            headers={"Content-Disposition": f'attachment; filename="{token}.json"'})
    if kind == "heatmap":
        heatmap_data = heatmap_result(data, scope, top_n, heatmap_options)
        columns = ["sampleId", "disease", "age", "gender", "batch", *heatmap_data["magIds"]]
        rows = [{**{k: sample[k] for k in columns[:5]}, **dict(zip(heatmap_data["magIds"], values, strict=True))}
                for sample, values in zip(heatmap_data["samples"], heatmap_data["values"], strict=True)]
    elif kind == "features":
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
    if kind == "heatmap":
        context.update({"projectionFingerprint": heatmap_data["projectionFingerprint"],
                        "heatmapSettingsJson": json.dumps(heatmap_data["settings"], sort_keys=True)})
    csv_rows = [{**{key: json.dumps(value, ensure_ascii=False, sort_keys=True) if isinstance(value, dict) else value
                    for key, value in row.items()}, **context} for row in rows]
    return StreamingResponse(service.stream_csv(csv_rows, [*columns, *context]),
                             media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{token}.csv"'})
