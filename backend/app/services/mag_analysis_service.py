"""Dataset-scoped MAG queries and pure statistical projections over published source artifacts."""
from __future__ import annotations

import hashlib
import io
import json
from collections import Counter
from functools import lru_cache
from typing import Any

import numpy as np
from scipy.stats import mannwhitneyu

from app.compute.statistics import benjamini_hochberg
from app.core.config import SETTINGS
from app.domain.mag import MagDataError, MagDataset, MagScope
from app.services import cohort_repository as repository
from app.services.csv_export import SpreadsheetSafeDictWriter

ANALYSIS_VERSION = 'cohort-mag-statistics-2026-10-20'
MAPPING_TOLERANCE = 0.001
TAXONOMY, QUALITY, LINEAGE, CROSSWALK = 'taxonomy', 'quality', 'lineage', 'crosswalk'
TAXONOMY_RANKS = ('domain', 'phylum', 'class', 'order', 'family', 'genus', 'species')
MAPPING_STATUSES = ('matched_exact_ncbi_species_taxid', 'ncbi_species_taxid_not_observed_in_reads', 'no_gtdb_reference')

def load_mag_dataset(dataset_key: str = '', revision: str = '') -> MagDataset:
    # A revision resolves its own cohort; an explicit cohort must match it.
    entry = repository.release_record(dataset_key or ('' if revision else SETTINGS.mag_dataset), revision)
    return repository.load_release(entry['release_key'])


def scope_indices(data: MagDataset, scope: MagScope) -> list[int]:
    if scope.age_min is not None and scope.age_max is not None and scope.age_min > scope.age_max:
        raise ValueError("最低年龄不能大于最高年龄。")
    return [i for i, sample in enumerate(data.samples) if (
        (not scope.disease or sample["disease"] == scope.disease)
        and (not scope.gender or sample["gender"] == scope.gender)
        and (not scope.batch or sample["batch"] == scope.batch)
        and (scope.age_min is None or (sample["age"] is not None and sample["age"] >= scope.age_min))
        and (scope.age_max is None or (sample["age"] is not None and sample["age"] <= scope.age_max))
    )]


def provenance(data: MagDataset, scope: MagScope) -> dict[str, Any]:
    indices = scope_indices(data, scope)
    counts = Counter(data.samples[i]['disease'] for i in indices)
    request = json.dumps({'source': data.fingerprint, 'scope': scope.as_dict(), 'analysis': ANALYSIS_VERSION}, sort_keys=True)
    warnings = [
        '探索性研究结果，不用于临床诊断或因果判断。',
        '保留 CoverM 上游百分比；代表 MAG 丰度不重新闭合至 100%。',
        '双侧 Mann–Whitney U；BH-FDR 在当前样本范围的完整 MAG 集合上计算，再做展示筛选。',
        '年龄、性别、批次筛选不是协变量校正；超过丰度阈值的比例不是生物学检出率。',
    ]
    if data.lineage:
        low = sum(r['memberToRepAni'] < 0.95 for r in data.lineage)
        warnings.append(f'dRep 来源组不代表外部验证队列；保留 {low} 条实际 ANI < 0.95 的成员记录。')
    if not data.crosswalk:
        warnings.append('未接入经核对的跨分类体系对应；GTDB 分类不自动映射为当前物种矩阵的特征。')
    if counts.get('AD', 0) < 2 or counts.get('NC', 0) < 2:
        warnings.append('至少一组少于 2 个样本，不计算 p/q 和秩效应量。')
    return {
        'version': data.version, 'datasetKey': data.version, 'release': data.fingerprint,
        'analysisVersion': ANALYSIS_VERSION, 'storageBackend': 'database',
        'dataFingerprint': data.fingerprint, 'requestFingerprint': hashlib.sha256(request.encode()).hexdigest(),
        'unit': '%', 'groupField': 'disease', 'filters': scope.as_dict(),
        'sampleCount': len(indices), 'excludedSampleCount': len(data.samples)-len(indices),
        'sampleIds': [data.sample_ids[i] for i in indices], 'magCount': len(data.mag_ids),
        'groupCounts': {g: counts.get(g, 0) for g in ('AD', 'NC')},
        'testedFeatureCount': len(data.mag_ids) if min(counts.get('AD',0), counts.get('NC',0)) >= 2 else 0,
        'sources': list(data.sources), 'upstreamGeneration': data.modules.get('abundance',{}).get('generation'),
        'provenanceScope': 'runtime-input-and-downstream-analysis',
        'mappingTolerancePercentPoints': MAPPING_TOLERANCE, 'maxMappingErrorPercentPoints': data.max_mapping_error,
        'warnings': warnings, 'modules': data.modules, 'processing': data.processing, 'communityResults': data.community_results,
        'manifest': {'file': None, 'sha256': None, 'buildDate': (data.annotation_manifest or {}).get('buildDate'), 'status': 'published'},
    }


def overview(data: MagDataset, scope: MagScope) -> dict[str, Any]:
    selected = [data.samples[i] for i in scope_indices(data, scope)]
    batches = []
    for batch in sorted({s['batch'] for s in data.samples if s['batch']}):
        counts = Counter(s['disease'] for s in selected if s['batch'] == batch)
        batches.append({'batch': batch, 'AD': counts.get('AD',0), 'NC': counts.get('NC',0)})
    ages = [s['age'] for s in data.samples if s['age'] is not None]
    return {'provenance': provenance(data, scope), 'batches': batches,
            'capabilities': {'taxonomy': bool(data.taxonomy), 'quality': bool(data.quality),
                             'lineage': bool(data.lineage), 'crosswalk': bool(data.crosswalk),
                             **{name: data.modules.get(name,{}).get('status') in {'ready','partial'} for name in ('arg','bgc','phylogeny','coverage')}},
            'options': {'genders': sorted({s['gender'] for s in data.samples if s['gender']}),
                        'batches': sorted({s['batch'] for s in data.samples if s['batch']}),
                        'ageMin': min(ages) if ages else None, 'ageMax': max(ages) if ages else None}}


def catalog(data: MagDataset) -> dict[str, Any]:
    """Catalog evidence is independent of sample filters and abundance statistics."""
    taxonomy = {row["magId"]: row for row in data.taxonomy}
    quality = {row["magId"]: row for row in data.quality}
    return {"provenance": provenance(data, MagScope()), "scopeKind": "catalog",
            "total": len(data.mag_ids), "items": [
                {"magId": mag_id, "taxonomy": taxonomy.get(mag_id), "quality": quality.get(mag_id)}
                for mag_id in data.mag_ids]}


def taxonomy_summary(data: MagDataset, scope: MagScope, rank: str = "phylum", top_n: int = 20) -> dict[str, Any]:
    if not data.taxonomy:
        raise MagDataError(TAXONOMY, "当前版本包含已核验的 MAG 分类输入", "未提供", data.version)
    if rank not in TAXONOMY_RANKS:
        raise ValueError("不支持的分类层级。")
    labels = [row[rank].strip() for row in data.taxonomy]
    unresolved = sum(not label for label in labels)
    counts = Counter(label or f"未解析至 {rank}" for label in labels)
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    shown = ordered[:top_n]
    other_count = sum(count for _, count in ordered[top_n:])
    total = len(data.taxonomy)
    items = [{"label": label, "count": count, "percent": count / total * 100} for label, count in shown]
    if other_count:
        items.append({"label": "其他分类", "count": other_count, "percent": other_count / total * 100})
    manifest = data.annotation_manifest or {}
    taxonomy_tool = manifest.get("tools", {}).get("taxonomy", {})
    return {
        "provenance": provenance(data, scope),
        "rank": rank,
        "topN": top_n,
        "items": items,
        "totalMagCount": total,
        "distinctTaxonCount": len(counts),
        "resolvedMagCount": total - unresolved,
        "unresolvedMagCount": unresolved,
        "method": taxonomy_tool.get("name", "GTDB-Tk"),
        "version": taxonomy_tool.get("version"),
        "versionNote": taxonomy_tool.get("note"),
    }


def quality_summary(data: MagDataset, scope: MagScope) -> dict[str, Any]:
    if not data.quality:
        raise MagDataError(QUALITY, "当前版本包含已核验的 CheckM2 质量输入", "未提供", data.version)
    completeness = [row["completenessPercent"] for row in data.quality]
    contamination = [row["contaminationPercent"] for row in data.quality]
    manifest = data.annotation_manifest or {}
    quality_tool = manifest.get("tools", {}).get("quality", {})
    return {
        "provenance": provenance(data, scope),
        "items": list(data.quality),
        "summary": {
            "totalMagCount": len(data.quality),
            "referenceBandCount": sum(row["inReferenceBand"] for row in data.quality),
            "completenessMinPercent": min(completeness),
            "completenessMaxPercent": max(completeness),
            "contaminationMinPercent": min(contamination),
            "contaminationMaxPercent": max(contamination),
        },
        "referenceBand": {
            "minimumCompletenessPercent": 90,
            "maximumContaminationPercent": 5,
            "label": "完整度≥90%且污染率≤5%的参考区间（非 MIMAG 高质量判定）",
        },
        "method": quality_tool.get("name", "CheckM2"),
        "version": quality_tool.get("version"),
    }


def _require_capability(data: MagDataset, capability: str) -> None:
    if capability == "lineage" and not data.lineage:
        raise MagDataError(LINEAGE, "当前版本包含已核验的 dRep 代表关系", "未提供", data.version)
    if capability == "crosswalk" and not data.crosswalk:
        raise MagDataError(CROSSWALK, "当前版本包含已核验的物种 crosswalk", "未提供", data.version)


@lru_cache(maxsize=4)
def lineage_cluster_summaries(data: MagDataset) -> tuple[dict[str, Any], ...]:
    _require_capability(data, "lineage")
    by_cluster: dict[str, list[dict[str, Any]]] = {}
    for row in data.lineage:
        by_cluster.setdefault(row["clusterId"], []).append(row)
    taxonomy = {row["magId"]: row for row in data.taxonomy}
    quality = {row["magId"]: row for row in data.quality}
    crosswalk = {row["magId"]: row for row in data.crosswalk}
    summaries = []
    for cluster_id, members in by_cluster.items():
        representative = members[0]["representativeMag"]
        ani_values = [row["memberToRepAni"] for row in members]
        coverage_values = [row["memberToRepAlignmentCoverage"] for row in members]
        taxonomy_row = taxonomy.get(representative, {})
        quality_row = quality.get(representative, {})
        mapping_row = crosswalk.get(representative, {})
        summaries.append({
            "clusterId": cluster_id,
            "representativeMag": representative,
            "memberCount": len(members),
            "sourceSampleCount": len({row["memberSourceSampleId"] for row in members}),
            "adMemberCount": sum(row["memberDisease"] == "AD" for row in members),
            "ncMemberCount": sum(row["memberDisease"] == "NC" for row in members),
            "sourceGroups": sorted({row["memberGroup"] for row in members}),
            "aniMin": min(ani_values),
            "aniMax": max(ani_values),
            "alignmentCoverageMin": min(coverage_values),
            "alignmentCoverageMax": max(coverage_values),
            "below095AniCount": sum(value < 0.95 for value in ani_values),
            "gtdbSpecies": taxonomy_row.get("species") or mapping_row.get("gtdbSpecies"),
            "completenessPercent": quality_row.get("completenessPercent"),
            "contaminationPercent": quality_row.get("contaminationPercent"),
            "mappingStatus": mapping_row.get("mappingStatus"),
        })
    return tuple(sorted(summaries, key=lambda row: row["clusterId"]))


LINEAGE_CLUSTER_SORT_FIELDS = {
    "clusterId", "representativeMag", "memberCount", "sourceSampleCount", "aniMin", "aniMax",
    "below095AniCount", "completenessPercent", "contaminationPercent",
}


def lineage_cluster_page(
    data: MagDataset,
    scope: MagScope,
    *,
    query: str = "",
    mapping_status: str = "",
    low_ani_only: bool = False,
    sort_by: str = "memberCount",
    direction: str = "desc",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    _require_capability(data, "lineage")
    if sort_by not in LINEAGE_CLUSTER_SORT_FIELDS or direction not in {"asc", "desc"}:
        raise ValueError("不支持的 lineage 聚类排序字段或方向。")
    needle = query.strip().casefold()
    summaries = lineage_cluster_summaries(data)
    exact_id = needle in {value.casefold() for row in summaries for value in (row["clusterId"], row["representativeMag"])}
    rows = [row for row in summaries if (
        needle in (row["clusterId"].casefold(), row["representativeMag"].casefold()) if exact_id else
        not needle or needle in row["clusterId"].casefold()
        or needle in row["representativeMag"].casefold()
        or needle in (row["gtdbSpecies"] or "").casefold()
    )]
    if mapping_status:
        rows = [row for row in rows if row["mappingStatus"] == mapping_status]
    if low_ani_only:
        rows = [row for row in rows if row["below095AniCount"] > 0]
    present = sorted((row for row in rows if row[sort_by] is not None), key=lambda row: row["clusterId"])
    present.sort(key=lambda row: row[sort_by], reverse=direction == "desc")
    missing = sorted((row for row in rows if row[sort_by] is None), key=lambda row: row["clusterId"])
    ordered = present + missing
    return {
        "provenance": provenance(data, scope),
        "items": ordered[offset:offset + limit],
        "total": len(ordered),
        "limit": limit,
        "offset": offset,
        "query": query,
        "mappingStatus": mapping_status,
        "lowAniOnly": low_ani_only,
        "sortBy": sort_by,
        "direction": direction,
        "summary": {
            "memberMagCount": len(data.lineage),
            "representativeMagCount": len(data.mag_ids),
            "secondaryClusterCount": len(lineage_cluster_summaries(data)),
            "sourceSampleCount": len({row["memberSourceSampleId"] for row in data.lineage}),
            "below095AniCount": sum(row["memberToRepAni"] < 0.95 for row in data.lineage),
        },
    }


LINEAGE_MEMBER_SORT_FIELDS = {"memberMag", "memberSourceSampleId", "memberToRepAni", "memberToRepAlignmentCoverage"}


def lineage_cluster_detail(
    data: MagDataset,
    scope: MagScope,
    cluster_id: str,
    *,
    query: str = "",
    disease: str = "",
    group: str = "",
    low_ani_only: bool = False,
    sort_by: str = "memberToRepAni",
    direction: str = "asc",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    _require_capability(data, "lineage")
    if sort_by not in LINEAGE_MEMBER_SORT_FIELDS or direction not in {"asc", "desc"}:
        raise ValueError("不支持的 lineage 成员排序字段或方向。")
    summary = next((row for row in lineage_cluster_summaries(data) if row["clusterId"] == cluster_id), None)
    if summary is None:
        raise KeyError("dRep 聚类不存在。")
    needle = query.strip().casefold()
    rows = [row for row in data.lineage if row["clusterId"] == cluster_id and (
        not needle or needle in row["memberMag"].casefold() or needle in row["memberSourceSampleId"].casefold()
    )]
    if disease:
        rows = [row for row in rows if row["memberDisease"] == disease]
    if group:
        rows = [row for row in rows if row["memberGroup"] == group]
    if low_ani_only:
        rows = [row for row in rows if row["memberToRepAni"] < 0.95]
    rows.sort(key=lambda row: (row[sort_by], row["memberMag"]), reverse=direction == "desc")
    return {
        "provenance": provenance(data, scope),
        "cluster": summary,
        "items": rows[offset:offset + limit],
        "total": len(rows),
        "limit": limit,
        "offset": offset,
        "query": query,
        "disease": disease,
        "group": group,
        "lowAniOnly": low_ani_only,
        "sortBy": sort_by,
        "direction": direction,
    }


def mag_lineage(data: MagDataset, scope: MagScope, mag_id: str) -> dict[str, Any]:
    _require_capability(data, "lineage")
    member = next((row for row in data.lineage if row["memberMag"] == mag_id), None)
    if member is None:
        raise KeyError("MAG ID 不存在于 lineage。")
    cluster = next(row for row in lineage_cluster_summaries(data) if row["clusterId"] == member["clusterId"])
    crosswalk = next((row for row in data.crosswalk if row["magId"] == member["representativeMag"]), None)
    return {
        "provenance": provenance(data, scope),
        "queriedMagId": mag_id,
        "queryRole": "representative" if member["isRepresentative"] else "member",
        "cluster": cluster,
        "member": member,
        "crosswalk": crosswalk,
    }


def crosswalk_page(
    data: MagDataset,
    scope: MagScope,
    *,
    query: str = "",
    mapping_status: str = "",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    _require_capability(data, "crosswalk")
    needle = query.strip().casefold()
    exact_id = needle in {row["magId"].casefold() for row in data.crosswalk}
    rows = [row for row in data.crosswalk if (
        row["magId"].casefold() == needle if exact_id else
        not needle or needle in row["magId"].casefold()
        or needle in (row["gtdbSpecies"] or "").casefold()
        or needle in (row["ncbiOrganismName"] or "").casefold()
        or needle in (row["krakenSpeciesName"] or "").casefold()
    )]
    if mapping_status:
        rows = [row for row in rows if row["mappingStatus"] == mapping_status]
    rows.sort(key=lambda row: row["magId"])
    counts = Counter(row["mappingStatus"] for row in data.crosswalk)
    return {
        "provenance": provenance(data, scope),
        "items": rows[offset:offset + limit],
        "total": len(rows),
        "limit": limit,
        "offset": offset,
        "query": query,
        "mappingStatus": mapping_status,
        "statusCounts": {status: counts.get(status, 0) for status in MAPPING_STATUSES},
    }


@lru_cache(maxsize=16)
def comparison_rows(data: MagDataset, scope: MagScope) -> tuple[dict[str, Any], ...]:
    indices = scope_indices(data, scope)
    values = data.matrix[indices]
    groups = {g: data.matrix[[i for i in indices if data.samples[i]["disease"] == g]] for g in ("AD", "NC")}
    ad, nc = groups["AD"], groups["NC"]
    testable = len(ad) >= 2 and len(nc) >= 2
    if testable:
        result = mannwhitneyu(ad, nc, axis=0, alternative="two-sided", method="asymptotic", use_continuity=True)
        p_values = np.where(np.isfinite(result.pvalue), result.pvalue, 1.0)
        q_values = benjamini_hochberg(p_values)
        effects = 2 * result.statistic / (len(ad) * len(nc)) - 1
    rows = []
    taxonomy_by_id = {row['magId']: row for row in data.taxonomy}
    quality_by_id = {row['magId']: row for row in data.quality}
    for j, mag_id in enumerate(data.mag_ids):
        taxonomy = taxonomy_by_id.get(mag_id, {})
        quality = quality_by_id.get(mag_id, {})
        taxonomy_rank = next((rank for rank in reversed(TAXONOMY_RANKS) if taxonomy.get(rank)), None)
        row: dict[str, Any] = {"magId": mag_id, "lengthBp": data.lengths[j],
                               "taxonomyName": taxonomy.get(taxonomy_rank) if taxonomy_rank else None,
                               "taxonomyRank": taxonomy_rank,
                               "taxonomy": {rank: taxonomy.get(rank) for rank in TAXONOMY_RANKS if taxonomy.get(rank)},
                               "completenessPercent": quality.get('completenessPercent'),
                               "contaminationPercent": quality.get('contaminationPercent'),
                               "meanPercent": float(values[:, j].mean()) if len(values) else None}
        for group, block in groups.items():
            prefix = group.lower()
            row[f"{prefix}MeanPercent"] = float(block[:, j].mean()) if len(block) else None
            row[f"{prefix}MedianPercent"] = float(np.median(block[:, j])) if len(block) else None
            row[f"{prefix}AboveThresholdPercent"] = float((block[:, j] > scope.abundance_threshold_percent).mean() * 100) if len(block) else None
        row["meanDifferencePercentPoints"] = row["adMeanPercent"] - row["ncMeanPercent"] if len(ad) and len(nc) else None
        row.update({"pValue": float(p_values[j]) if testable else None,
                    "qValue": float(q_values[j]) if testable else None,
                    "rankBiserial": float(effects[j]) if testable else None})
        rows.append(row)
    return tuple(rows)


SORT_FIELDS = {"magId", "meanPercent", "adMeanPercent", "ncMeanPercent", "meanDifferencePercentPoints", "qValue", "rankBiserial"}


def ordered_features(data: MagDataset, scope: MagScope, query: str = "", sort_by: str = "meanPercent", direction: str = "desc") -> list:
    if sort_by not in SORT_FIELDS or direction not in {"asc", "desc"}:
        raise ValueError("不支持的排序字段或方向。")
    needle = query.strip().casefold()
    exact_id = needle in {mag_id.casefold() for mag_id in data.mag_ids}
    rows = [row for row in comparison_rows(data, scope)
            if (row["magId"].casefold() == needle if exact_id else
                not needle or any(needle in value.casefold()
                                  for value in [row["magId"], *row["taxonomy"].values()]))]
    # Stable ties; missing statistics always last, in both directions.
    present = sorted((r for r in rows if r[sort_by] is not None), key=lambda r: r["magId"])
    present.sort(key=lambda r: r[sort_by], reverse=direction == "desc")
    return present + sorted((r for r in rows if r[sort_by] is None), key=lambda r: r["magId"])


def feature_page(data, scope, *, query="", sort_by="meanPercent", direction="desc", limit=25, offset=0):
    rows = ordered_features(data, scope, query, sort_by, direction)
    return {"provenance": provenance(data, scope), "items": rows[offset:offset + limit], "total": len(rows),
            "limit": limit, "offset": offset, "query": query, "sortBy": sort_by, "direction": direction}


def sample_rows(data: MagDataset, scope: MagScope) -> list[dict[str, Any]]:
    return [{**data.samples[i], "aboveThresholdMagCount": int((data.matrix[i] > scope.abundance_threshold_percent).sum())}
            for i in scope_indices(data, scope)]


def feature_distribution(data: MagDataset, scope: MagScope, mag_id: str) -> dict[str, Any]:
    try:
        column = data.mag_ids.index(mag_id)
    except ValueError as exc:
        raise KeyError("MAG ID 不存在。") from exc
    samples = [{**data.samples[i], "abundancePercent": float(data.matrix[i, column])} for i in scope_indices(data, scope)]
    boxes = []
    for group in ("AD", "NC"):
        values = np.asarray([s["abundancePercent"] for s in samples if s["disease"] == group])
        if not len(values):
            continue
        q1, median, q3 = np.percentile(values, [25, 50, 75])
        iqr = q3 - q1
        inliers = values[(values >= q1 - 1.5 * iqr) & (values <= q3 + 1.5 * iqr)]
        boxes.append({"group": group, "n": len(values), "values": [float(inliers.min()), float(q1), float(median), float(q3), float(inliers.max())]})
    return {"provenance": provenance(data, scope), "feature": comparison_rows(data, scope)[column],
            "samples": samples, "boxes": boxes}


def heatmap(data: MagDataset, scope: MagScope, top_n: int = 20, settings=None) -> dict[str, Any]:
    from app.services.mag_heatmap_service import build_heatmap

    return {"provenance": provenance(data, scope),
            **build_heatmap(data, scope_indices(data, scope), comparison_rows(data, scope), top_n, settings)}


def stream_csv(rows, columns):
    buffer = io.StringIO()
    writer = SpreadsheetSafeDictWriter(buffer, columns)
    writer.writeheader()
    yield ("\ufeff" + buffer.getvalue()).encode("utf-8")
    for start in range(0, len(rows), 250):
        buffer.seek(0)
        buffer.truncate(0)
        writer.writerows(rows[start:start + 250])
        yield buffer.getvalue().encode("utf-8")
