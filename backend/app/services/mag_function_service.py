"""Functional catalog, gene evidence, projected signals and source result views."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from functools import lru_cache
from threading import Lock
from typing import Any

import numpy as np
from scipy.cluster.hierarchy import leaves_list, linkage
from scipy.stats import mannwhitneyu

from app.compute.statistics import benjamini_hochberg
from app.core.database import connect
from app.services import cohort_repository as repository
from app.services import mag_analysis_service as mag
from app.services.mag_function_store import NAMESPACES, open_store

VERSION = 'functional-projection-2026-10-23.1'
_SIGNAL_LOCK = Lock()
THEMES: list[dict[str, Any]] = [
    {'id': 'butyrate', 'label': '丁酸相关酶', 'namespace': 'kofam_ko', 'ids': ['K00634', 'K00929'],
     'description': '磷酸丁酰转移酶与丁酸激酶的独立基因证据；不代表完整丁酸合成路线。'},
    {'id': 'gaba', 'label': 'GABA 相关酶', 'namespace': 'kofam_ko', 'ids': ['K01580'],
     'description': '谷氨酸脱羧酶命中；不直接判定 GABA 产生或分泌。'},
    {'id': 'bile', 'label': '胆汁酸相关酶', 'namespace': 'kofam_ko', 'ids': ['K01442'],
     'description': '胆酰甘氨酸水解酶命中；不代表完整次级胆汁酸转化。'},
    {'id': 'tryptophan', 'label': '色氨酸相关基因', 'namespace': 'kofam_ko', 'search': 'tryptoph',
     'description': '按来源功能描述检索的色氨酸相关基因集合；不是自动通路判定。'},
    {'id': 'carbohydrate', 'label': '糖类利用相关家族', 'namespace': 'dbcan_family',
     'description': 'CAZyme 家族注释证据；底物与亚家族在各自命名空间中单独检索。'},
    {'id': 'cofactor', 'label': '辅因子相关基因', 'namespace': 'kofam_ko', 'module': 'cofactors',
     'description': '来源 distill 目录中的单 KO 条目，数值由已核对 KO 矩阵查询，保留原始差异报告。'},
]


def identity(data, **params):
    text = json.dumps({'version': VERSION, 'release': data.fingerprint, **params}, sort_keys=True, ensure_ascii=False)
    return {'release': data.fingerprint, 'annotationRevision': data.modules.get('metabolism', {}).get('revision'),
            'projectionFingerprint': hashlib.sha256(text.encode()).hexdigest(), 'analysisVersion': VERSION}


def _ids(value):
    return list(dict.fromkeys(re.split(r'[,;\s]+', value.strip()))) if value.strip() else []


def _mags(data, query='', ids='', completeness=None, contamination=None) -> list[dict[str, Any]]:
    taxonomy = {r['magId']: r for r in data.taxonomy}
    quality = {r['magId']: r for r in data.quality}
    selected = _ids(ids)
    if set(selected) - set(data.mag_ids):
        raise ValueError('MAG 清单包含不属于该发布的标识。')
    result = []
    for mid in selected or data.mag_ids:
        tax, qual = taxonomy.get(mid, {}), quality.get(mid, {})
        if query and query.casefold() not in (mid + ' ' + ' '.join(str(v) for v in tax.values())).casefold():
            continue
        if completeness is not None and (qual.get('completenessPercent') is None or qual['completenessPercent'] < completeness):
            continue
        if contamination is not None and (qual.get('contaminationPercent') is None or qual['contaminationPercent'] > contamination):
            continue
        result.append({'magId': mid, 'taxonomy': tax, 'quality': qual,
                       'label': next((tax.get(k) for k in ('species', 'genus', 'family', 'order', 'phylum') if tax.get(k)), mid)})
    if not selected:
        result.sort(key=lambda r: (r['taxonomy'].get('genus', ''), r['label'], r['magId']))
    return result


def overview(data):
    with open_store(data) as conn:
        items = []
        catalog = {r['magId']: r for r in _mags(data)}
        for row in conn.execute('SELECT * FROM mags ORDER BY mag_id'):
            items.append({**catalog[row['mag_id']], 'geneCount': row['gene_count'],
                          'annotationPercent': row['annotation_percent'], 'domain': row['domain']})
    module = data.modules['metabolism']
    return {**identity(data), 'scopeKind': 'catalog', 'items': items,
            'report': {k: v for k, v in module.items() if k not in {'database', 'sources'}},
            'namespaces': [{'id': k, 'label': v} for k, v in NAMESPACES.items()],
            'themes': [{**r, 'definitionVersion': VERSION, 'evidenceKind': 'research_gene_set'} for r in THEMES]}


def feature_rows(data, namespace, query='', mag_id='', ids=''):
    if namespace not in NAMESPACES:
        raise ValueError('不支持的功能命名空间。')
    selected = _ids(ids)
    with open_store(data) as conn:
        clause, params = 'f.namespace=?', [namespace]
        if selected:
            clause += ' AND f.feature_id IN (' + ','.join('?' for _ in selected) + ')'
            params.extend(selected)
        if query:
            clause += " AND (f.feature_id LIKE ? ESCAPE '!' OR f.description LIKE ? ESCAPE '!')"
            needle = '%' + query.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
            params.extend([needle, needle])
        join, join_params = '', []
        if mag_id:
            join = ' AND c.mag_key=(SELECT mag_key FROM mags WHERE mag_id=?)'
            join_params.append(mag_id)
        sql = f'''SELECT f.*,COUNT(c.mag_key) AS carriers,COALESCE(SUM(c.gene_count),0) AS genes
                  FROM features f LEFT JOIN counts c ON c.feature_key=f.feature_key {join}
                  WHERE {clause} GROUP BY f.feature_key ORDER BY carriers DESC,genes DESC,f.feature_id'''
        result = [{'featureId': r['feature_id'], 'namespace': namespace, 'description': r['description'],
                   'carrierCount': r['carriers'], 'geneCount': r['genes']} for r in conn.execute(sql, join_params + params)]
    if mag_id:
        result = [r for r in result if r['geneCount'] > 0]
    if selected:
        found = {r['featureId']: r for r in result}
        if set(selected) - set(found) and not mag_id:
            raise ValueError('功能清单包含当前命名空间不存在的标识。')
        result = [found[key] for key in selected if key in found]
    return result


def feature_page(data, namespace, query='', mag_id='', ids='', limit=25, offset=0):
    items = feature_rows(data, namespace, query, mag_id, ids)
    return {**identity(data, namespace=namespace, query=query, magId=mag_id, ids=ids), 'scopeKind': 'catalog',
            'namespace': namespace, 'items': items[offset:offset + limit], 'total': len(items), 'limit': limit, 'offset': offset}


def _order(values, binary):
    if len(values) < 2 or values.shape[1] == 0:
        return list(range(len(values))), []
    active = [i for i, row in enumerate(values) if np.any(row)]
    inactive = [i for i in range(len(values)) if i not in active]
    if len(active) < 2:
        return active + inactive, []
    merges = linkage(values[active].astype(bool) if binary else np.log1p(values[active]),
                     method='average', metric='jaccard' if binary else 'euclidean')
    return [active[i] for i in leaves_list(merges)] + inactive, [{'left': int(r[0]), 'right': int(r[1]), 'distance': float(r[2]), 'size': int(r[3])} for r in merges]


def matrix(data, namespace='kofam_ko', query='', mag_query='', feature_ids='', mag_ids='', mag_limit=40, feature_limit=30,
           completeness=None, contamination=None, row_order='taxonomy', column_order='rank', value_kind='presence'):
    selected_mags = _mags(data, mag_query, mag_ids, completeness, contamination)
    selected_features = feature_rows(data, namespace, query, ids=feature_ids)
    mags = selected_mags[:mag_limit]
    fields = selected_features[:feature_limit]
    if len(mags) * len(fields) > 20000:
        raise ValueError('图形展示集合超过 20,000 个单元格；请缩小集合，完整数据仍可下载。')
    mi = {row['magId']: i for i, row in enumerate(mags)}
    fi = {row['featureId']: i for i, row in enumerate(fields)}
    values = np.zeros((len(mags), len(fields)), dtype=int)
    if mi and fi:
        with open_store(data) as conn:
            clause = ','.join('?' for _ in fi)
            for row in conn.execute(f'''SELECT m.mag_id,f.feature_id,c.gene_count FROM counts c
                 JOIN features f USING(feature_key) JOIN mags m USING(mag_key)
                 WHERE f.namespace=? AND f.feature_id IN ({clause})''', [namespace, *fi]):
                if row['mag_id'] in mi:
                    values[mi[row['mag_id']], fi[row['feature_id']]] = row['gene_count']
    ri, ci = list(range(len(mags))), list(range(len(fields)))
    dendrograms: dict[str, Any] = {'mags': None, 'features': None}
    if row_order == 'cluster':
        ri, merges = _order(values, value_kind == 'presence')
        dendrograms['mags'] = {'leafIds': [mags[i]['magId'] for i, row in enumerate(values) if np.any(row)], 'merges': merges}
    if column_order == 'cluster':
        ci, merges = _order(values.T, value_kind == 'presence')
        dendrograms['features'] = {'leafIds': [fields[i]['featureId'] for i, row in enumerate(values.T) if np.any(row)], 'merges': merges}
    if column_order == 'id':
        ci.sort(key=lambda i: fields[i]['featureId'])
    values = values[np.ix_(ri, ci)]
    result = {**identity(data, namespace=namespace, query=query, magQuery=mag_query, featureIds=feature_ids, magIds=mag_ids,
                        magLimit=mag_limit, featureLimit=feature_limit, completeness=completeness, contamination=contamination,
                        rowOrder=row_order, columnOrder=column_order, valueKind=value_kind),
              'scopeKind': 'catalog', 'namespace': namespace, 'valueKind': value_kind, 'unit': 'annotated genes',
              'mags': [mags[i] for i in ri], 'features': [fields[i] for i in ci], 'values': values.tolist(),
              'dendrograms': dendrograms,
              'selection': {'catalogMags': len(data.mag_ids), 'matchedMags': len(selected_mags), 'shownMags': len(mags),
                            'matchedFeatures': len(selected_features), 'shownFeatures': len(fields)},
              'methods': {'clustering': 'average / Jaccard (presence) or Euclidean of log1p(count); zero vectors last',
                          'rowOrder': row_order, 'columnOrder': column_order,
                          'meaning': '本次代表 MAG 注释的基因计数；不是表达量或群落 KO 丰度。'}}
    return result


def carriers(data, scope, namespace, feature_id, limit=25, offset=0, sort_by='geneCount'):
    with open_store(data) as conn:
        counts = {row['mag_id']: row['gene_count'] for row in conn.execute('''SELECT m.mag_id,c.gene_count FROM counts c
                 JOIN features f USING(feature_key) JOIN mags m USING(mag_key) WHERE namespace=? AND feature_id=?''', (namespace, feature_id))}
    if sort_by not in {'geneCount', 'qValue', 'meanPercent', 'magId'}:
        raise ValueError('不支持的携带者排序。')
    stats = {r['magId']: r for r in mag.comparison_rows(data, scope)}
    items = [{**stats[mid], 'geneCount': count} for mid, count in counts.items()]
    items.sort(key=lambda r: (r.get(sort_by) is None, r.get(sort_by) if sort_by in {'qValue', 'magId'} else -(r.get(sort_by) or 0), r['magId']))
    return {**identity(data, namespace=namespace, featureId=feature_id, scope=scope.as_dict()), 'scopeKind': 'catalog_with_sample_annotation',
            'items': items[offset:offset + limit], 'total': len(items), 'limit': limit, 'offset': offset,
            'sampleScope': scope.as_dict(), 'testFamily': len(data.mag_ids), 'featureId': feature_id}


def genes(data, mag_id, namespace='', feature_id='', contig='', start=None, stop=None, query='', limit=25, offset=0):
    if mag_id not in data.mag_ids:
        raise ValueError('请指定当前代表 MAG。')
    clause, params = 'm.mag_id=?', [mag_id]
    if namespace and feature_id:
        clause += ' AND EXISTS(SELECT 1 FROM hits h JOIN features f USING(feature_key) WHERE h.gene_key=g.gene_key AND f.namespace=? AND f.feature_id=?)'
        params.extend([namespace, feature_id])
    if contig:
        clause += ' AND g.contig=?'
        params.append(contig)
    if start is not None:
        clause += ' AND MAX(g.start_bp,g.stop_bp)>=?'
        params.append(start)
    if stop is not None:
        clause += ' AND MIN(g.start_bp,g.stop_bp)<=?'
        params.append(stop)
    if query:
        clause += " AND g.query_id LIKE ? ESCAPE '!'"
        params.append('%' + query.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%')
    with open_store(data) as conn:
        base = ' FROM genes g JOIN mags m USING(mag_key) WHERE ' + clause
        total = conn.execute('SELECT COUNT(*)' + base, params).fetchone()[0]
        items = [{'geneId': r['query_id'], 'magId': mag_id, 'contigId': r['contig'], 'start': r['start_bp'], 'end': r['stop_bp'],
                  'strand': r['strand'], 'rank': r['rank'], 'evidence': json.loads(r['evidence_json'])}
                 for r in conn.execute('SELECT g.*' + base + ' ORDER BY g.contig,MIN(g.start_bp,g.stop_bp),g.query_id LIMIT ? OFFSET ?', [*params, limit, offset])]
        contigs = [dict(r) for r in conn.execute('''SELECT contig AS contigId,COUNT(*) AS geneCount,
               MIN(MIN(start_bp,stop_bp)) AS start,MAX(MAX(start_bp,stop_bp)) AS end
               FROM genes WHERE mag_key=(SELECT mag_key FROM mags WHERE mag_id=?) GROUP BY contig ORDER BY contig''', (mag_id,))]
    return {**identity(data, magId=mag_id, namespace=namespace, featureId=feature_id, contig=contig, start=start, stop=stop, query=query),
            'scopeKind': 'catalog', 'items': items, 'total': total, 'limit': limit, 'offset': offset, 'contigs': contigs,
            'coordinateConvention': data.modules['metabolism']['coordinateConvention'],
            'filteredEvidence': bool(namespace and feature_id), 'hasSequence': False}


def theme(data, theme_id, mag_ids='', mag_limit=40):
    definition = next((r for r in THEMES if r['id'] == theme_id), None)
    if definition is None:
        raise ValueError('未知研究基因集合。')
    feature_ids = definition.get('ids', [])
    if definition.get('module'):
        with open_store(data) as conn:
            feature_ids = list(dict.fromkeys(r[0] for r in conn.execute('SELECT gene_id FROM distill WHERE module=? ORDER BY gene_id', (definition['module'],)) if re.fullmatch(r'K\d{5}', r[0])))
        available = {r['featureId'] for r in feature_rows(data, definition['namespace'])}
        feature_ids = [key for key in feature_ids if key in available]
    available = {r['featureId'] for r in feature_rows(data, definition['namespace'])}
    unavailable = [key for key in feature_ids if key not in available]
    filtered_ids = [key for key in feature_ids if key in available]
    empty = bool(definition.get('ids') or definition.get('module')) and not filtered_ids
    result = matrix(data, definition['namespace'], query=definition.get('search', ''), feature_ids=','.join(filtered_ids),
                    mag_ids=mag_ids, mag_limit=mag_limit, feature_limit=0 if empty else min(60, 20000 // max(mag_limit, 1)))
    if empty:
        result['selection']['matchedFeatures'] = 0
    result['theme'] = {**definition, 'definitionVersion': VERSION, 'evidenceKind': 'research_gene_set',
                       'source': 'DRAM best-hit KO / dbCAN annotations; source descriptions and explicit gene sets',
                       'pathwayCompletenessAvailable': False, 'unavailableFeatures': unavailable}
    return result


@lru_cache(maxsize=8)
def _source_rows(revision, kind):
    return tuple(repository.records(revision, kind)[0])


def source_matrix(data, module, category='known_hmm_hit', mag_limit=40, feature_limit=30):
    state = data.modules.get(module, {})
    if module not in {'arg', 'bgc'} or state.get('status') not in {'ready', 'partial'}:
        raise ValueError('当前发布没有对应 ARG/BGC 结果。')
    items = _source_rows(state['revision'], 'arg_hits' if module == 'arg' else 'bgc_regions')
    statuses = {r['magId']: r for r in _source_rows(state['revision'], 'arg_summary' if module == 'arg' else 'bgc_status')}
    counts = Counter()
    labels = Counter()
    for row in items:
        if module == 'arg':
            if category == 'novel095':
                if row['category'] != 'novel_candidate' or not row['passes'].get('passed_0.95'):
                    continue
            elif row['category'] != category:
                continue
            names = [row.get('queryName') or '未提供命中名称']
        else:
            names = list(dict.fromkeys(row['products']))
        for name in names:
            counts[row['magId'], name] += 1
            labels[name] += 1
    selected = [name for name, _ in sorted(labels.items(), key=lambda kv: (-kv[1], kv[0]))[:feature_limit]]
    mags = _mags(data)
    mags.sort(key=lambda r: (-sum(counts[r['magId'], name] for name in selected), r['magId']))
    mags = mags[:mag_limit]
    values = [[counts[r['magId'], name] if counts[r['magId'], name] or statuses.get(r['magId'], {}).get('status') == 'success' else None for name in selected] for r in mags]
    return {**identity(data, sourceModule=module, category=category, magLimit=mag_limit, featureLimit=feature_limit),
            'mags': mags, 'features': [{'featureId': name, 'description': '', 'geneCount': labels[name]} for name in selected],
            'values': values, 'valueKind': 'count', 'namespace': module, 'scopeKind': 'catalog',
            'selection': {'matchedMags': len(data.mag_ids), 'shownMags': len(mags), 'matchedFeatures': len(labels), 'shownFeatures': len(selected)},
            'methods': {'meaning': 'ARG 蛋白命中或唯一 BGC 区域标签计数；多产品标签之和不是唯一区域数。'}}


def source_details(data, module, mag_id='', query='', category='', limit=25, offset=0):
    state = data.modules.get(module, {})
    if module not in {'arg', 'bgc'} or 'revision' not in state:
        raise ValueError('没有对应来源。')
    items = _source_rows(state['revision'], 'arg_hits' if module == 'arg' else 'bgc_regions')
    matching = [r for r in items if (not mag_id or r['magId'] == mag_id) and
                (not query or query.casefold() in json.dumps(r, ensure_ascii=False).casefold()) and
                (not category or module == 'bgc' or (r['category'] == 'novel_candidate' and r['passes'].get('passed_0.95') if category == 'novel095' else r['category'] == category))]
    return {**identity(data, module=module, magId=mag_id, query=query, category=category), 'scopeKind': 'catalog',
            'items': matching[offset:offset + limit], 'total': len(matching), 'limit': limit, 'offset': offset}


def coverage(data, scope, mag_id):
    state = data.modules.get('coverage', {})
    if 'revision' not in state or mag_id not in data.mag_ids:
        raise ValueError('缺少当前 MAG 覆盖结果。')
    records = repository.records(state['revision'], 'coverage_metrics', mag_id=mag_id)[0]
    sample_indices = mag.scope_indices(data, scope)
    samples = {data.sample_ids[i]: data.samples[i] for i in sample_indices}
    j = data.mag_ids.index(mag_id)
    abundance = {data.sample_ids[i]: float(data.matrix[i, j]) for i in sample_indices}
    return {**identity(data, magId=mag_id, scope=scope.as_dict()), 'scopeKind': 'sample',
            'items': [{**r, **samples[r['sampleId']], 'abundancePercent': abundance[r['sampleId']]} for r in records if r['sampleId'] in samples],
            'magId': mag_id, 'sampleScope': scope.as_dict()}


def compare(data, scope, mag_ids):
    requested = _ids(mag_ids)
    catalog = {r['magId']: r for r in _mags(data, ids=mag_ids)}
    stats = {r['magId']: r for r in mag.comparison_rows(data, scope)}
    with open_store(data) as conn:
        summaries = {r['mag_id']: json.loads(r['metadata_json']) for r in conn.execute('SELECT mag_id,metadata_json FROM mags')}
    return {**identity(data, magIds=mag_ids, scope=scope.as_dict()), 'scopeKind': 'catalog_with_sample_annotation',
            'items': [{**catalog[mid], **stats[mid], 'functional': summaries[mid]} for mid in requested]}


def distributions(data, scope, mag_ids, limit=6, offset=0):
    requested = [r['magId'] for r in _mags(data, ids=mag_ids)] if mag_ids else []
    items = []
    for mid in requested[offset:offset + limit]:
        distribution = mag.feature_distribution(data, scope, mid)
        items.append({'magId': mid, 'feature': distribution['feature'], 'samples': distribution['samples'], 'boxes': distribution['boxes']})
    return {**identity(data, magIds=mag_ids, scope=scope.as_dict(), offset=offset, limit=limit),
            'scopeKind': 'sample', 'items': items, 'total': len(requested), 'limit': limit, 'offset': offset}


def community(data, feature_id):
    link = data.community_results.get('ko', {})
    if not link.get('revision') or not re.fullmatch(r'K\d{5}', feature_id):
        return {**identity(data), 'items': [], 'available': False}
    with connect() as conn:
        values = conn.execute('''SELECT s.sample_code,a.abundance FROM revision_ko_abundance a
              JOIN revision_sample_info s ON s.sample_id=a.sample_id JOIN dataset_revisions r ON r.id=a.revision_id
              WHERE r.revision_key=? AND a.ko_id=?''', (link['revision'], feature_id)).fetchall()
    samples = {r['sampleId']: r for r in data.samples}
    return {**identity(data, communityRevision=link['revision'], featureId=feature_id), 'featureId': feature_id,
            'available': bool(values), 'communityRevision': link['revision'], 'link': link,
            'items': [{**samples[r['sample_code']], 'value': r['abundance']} for r in values if r['sample_code'] in samples],
            'unit': 'DiTing 上游标准化丰度', 'meaning': '原始群落 KO 结果，独立于 MAG 加权代理量。'}


@lru_cache(maxsize=8)
def _signals_cached(data, scope, namespace, kind):
    fields = feature_rows(data, namespace)
    fi = {r['featureId']: i for i, r in enumerate(fields)}
    mi = {mid: i for i, mid in enumerate(data.mag_ids)}
    counts = np.zeros((len(mi), len(fi)), dtype=float)
    with open_store(data) as conn:
        for row in conn.execute('''SELECT m.mag_id,f.feature_id,c.gene_count FROM counts c
                JOIN features f USING(feature_key) JOIN mags m USING(mag_key) WHERE namespace=?''', (namespace,)):
            counts[mi[row['mag_id']], fi[row['feature_id']]] = row['gene_count']
    if kind == 'carriers':
        counts = (counts > 0).astype(float)
    selected = mag.scope_indices(data, scope)
    values = data.matrix[selected] @ counts
    ad_indices = [j for j, i in enumerate(selected) if data.samples[i]['disease'] == 'AD']
    nc_indices = [j for j, i in enumerate(selected) if data.samples[i]['disease'] == 'NC']
    testable = len(ad_indices) >= 2 and len(nc_indices) >= 2
    if testable:
        result = mannwhitneyu(values[ad_indices], values[nc_indices], axis=0, alternative='two-sided', method='asymptotic')
        p = np.where(np.isfinite(result.pvalue), result.pvalue, 1)
        q = benjamini_hochberg(p)
        effect = 2 * result.statistic / (len(ad_indices) * len(nc_indices)) - 1
    rows = [{**field, 'adMean': float(values[ad_indices, i].mean()) if ad_indices else None,
             'ncMean': float(values[nc_indices, i].mean()) if nc_indices else None,
             'pValue': float(p[i]) if testable else None, 'qValue': float(q[i]) if testable else None,
             'effect': float(effect[i]) if testable else None} for i, field in enumerate(fields)]
    return rows, selected, values


def _signals(data, scope, namespace, kind):
    with _SIGNAL_LOCK:
        return _signals_cached(data, scope, namespace, kind)


def signals(data, scope, namespace='kofam_ko', kind='carriers', feature_id='', query='', limit=25, offset=0):
    if namespace not in {'kofam_ko', 'dbcan_family', 'dbcan_substrate', 'merops_family'} or kind not in {'carriers', 'copies'}:
        raise ValueError('不支持的代理量类型或命名空间。')
    rows, selected, values = _signals(data, scope, namespace, kind)
    matching = [r for r in rows if not query or query.casefold() in (r['featureId'] + ' ' + r['description']).casefold()]
    matching = sorted(matching, key=lambda r: (r['qValue'] is None, r['qValue'] or 0, r['featureId']))
    field = next((i for i, r in enumerate(rows) if r['featureId'] == feature_id), None)
    samples = [{**data.samples[i], 'value': float(values[j, field])} for j, i in enumerate(selected)] if field is not None else []
    return {**identity(data, namespace=namespace, kind=kind, featureId=feature_id, query=query,
                       limit=limit, offset=offset, scope=scope.as_dict()), 'scopeKind': 'sample',
            'items': matching[offset:offset + limit], 'total': len(matching), 'samples': samples, 'limit': limit, 'offset': offset,
            'unit': '百分点' if kind == 'carriers' else '百分点 × 注释基因计数', 'kind': kind,
            'testFamily': len(rows), 'featureId': feature_id,
            'meaning': 'MAG 丰度加权代理量；不是原始群落 KO 丰度、表达量或代谢通量。',
            'sampleScope': scope.as_dict()}
