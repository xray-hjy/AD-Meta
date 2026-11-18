"""Revision-bound KO/pathway exploration; display selection never changes BH families."""
from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.stats import mannwhitneyu

from app.compute.statistics import benjamini_hochberg
from app.services.diting_import import read_profile

FORMULA_REFERENCE_SHA256 = '96e32f16e1a260930334408dc00e0f7584adc4c3dc4eac678ce389f6eb74fecd'
FORMULA_SOURCE = 'https://raw.githubusercontent.com/xuechunxu/DiTing/master/Pathway_formulas.txt'
FORMULA_NAME = 'Denitrification, nitrite -> nitric oxide (nirK or nirS)'


def summarize(names, matrix, samples, prevalence, *, pathway=False):
    ad = np.array([s['group'] == 'AD' for s in samples])
    if ad.sum() < 3 or (~ad).sum() < 3:
        raise ValueError('功能比较至少需要 3 个 AD 与 3 个 NC 样本；当前范围不满足。')
    rows, tested = [], []
    for name, values in zip(names, matrix, strict=True):
        a, b = values[ad], values[~ad]
        included = pathway or float((values > 0).mean()) >= prevalence
        row = {'id': name, 'name': name, 'kind': 'pathway' if pathway else 'ko',
               'tested': bool(included), 'reason': 'all_pathways' if pathway else 'passes_prevalence' if included else 'below_prevalence_threshold',
               'pValue': None, 'qValue': None, 'effect': None, 'mean': float(values.mean()),
               'groups': {g: {'count': len(v), 'detected': int((v > 0).sum()), 'mean': float(v.mean()),
                              'median': float(np.median(v)), 'q1': float(np.quantile(v, .25)), 'q3': float(np.quantile(v, .75))}
                          for g, v in [('AD', a), ('NC', b)]}}
        if included:
            result = mannwhitneyu(a, b, alternative='two-sided', method='asymptotic' if pathway else 'auto')
            row.update(pValue=float(result.pvalue) if np.isfinite(result.pvalue) else 1.0,
                       effect=2 * float(result.statistic) / (len(a) * len(b)) - 1 if np.isfinite(result.statistic) else 0.0)
            tested.append(row)
        rows.append(row)
    for row, q in zip(tested, benjamini_hochberg([r['pValue'] for r in tested]), strict=True):
        row['qValue'] = float(q)
    return rows


@lru_cache(maxsize=8)
def exploration_snapshot(directory, ko_sha, pathway_sha, metadata_sha, scope_json, prevalence):
    directory = Path(directory)
    for name, digest in [('raw.tab', ko_sha), ('pathways_relative_abundance.tab', pathway_sha), ('sample_metadata.tsv', metadata_sha)]:
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != digest:
            raise ValueError('功能分析源文件校验失败；拒绝混用其他修订。')
    names, values, meta = read_profile(directory / 'raw.tab', directory / 'sample_metadata.tsv', 'k_number')
    pn, pv, pm = read_profile(directory / 'pathways_relative_abundance.tab', directory / 'sample_metadata.tsv', '#Pathway')
    if not meta.equals(pm):
        raise ValueError('KO 与通路样本或分组不一致。')
    standard = [i for i, name in enumerate(names) if re.fullmatch(r'K\d{5}', name)]
    kn, kv = [names[i] for i in standard], values[standard]
    # Verify the whole revision before deriving a selected-sample view.
    mapping = None
    if FORMULA_NAME in pn and all(k in kn for k in ['K00368', 'K15864']):
        # Use a documented numerical tolerance for floating point sums.
        summed = kv[kn.index('K00368')] + kv[kn.index('K15864')]
        if np.allclose(pv[pn.index(FORMULA_NAME)], summed, rtol=1e-12, atol=1e-12):
            mapping = {'pathway': FORMULA_NAME, 'kos': ['K00368', 'K15864'], 'formula': 'K00368 + K15864',
                       'source': FORMULA_SOURCE, 'referenceSha256': FORMULA_REFERENCE_SHA256, 'referenceLabel': 'DiTing public formulas v0.3; installed version unknown',
                       'status': 'verified_for_this_revision', 'sampleCount': len(meta), 'maxAbsoluteError': float(np.max(np.abs(pv[pn.index(FORMULA_NAME)] - summed))),
                       'verification': 'sample-ID aligned numerical agreement; not independent biological validation'}
    scope = json.loads(scope_json)
    if scope['mode'] in {'sample', 'subset'}:
        requested = set(scope['sampleCodes'])
        if not requested.issubset(set(meta.sample_id)):
            raise ValueError('所选样本不在这一修订中。')
        mask = meta.sample_id.isin(requested).to_numpy()
    elif scope['mode'] == 'group':
        mask = meta.Group.isin(scope['groups']).to_numpy()
    else:
        mask = np.ones(len(meta), dtype=bool)
    samples = [{'id': r.sample_id, 'group': r.Group} for r in meta.loc[mask].itertuples()]
    km, pmatrix = kv[:, mask], pv[:, mask]
    ko_rows = summarize(kn, km, samples, prevalence)
    pathway_rows = summarize(pn, pmatrix, samples, prevalence, pathway=True)
    record = {'methodVersion': 'functional-exploration-v1', 'koSourceSha256': ko_sha, 'pathwaySourceSha256': pathway_sha,
              'sampleMetadataSha256': metadata_sha, 'samples': samples, 'scope': scope, 'koPrevalenceMin': prevalence,
              'koFamilyCount': sum(r['tested'] for r in ko_rows), 'pathwayFamilyCount': len(pathway_rows),
              'method': 'two-sided Mann–Whitney U; KO auto; pathways asymptotic; BH separately within each full eligible family',
              'unit': 'DiTing upstream normalized abundance; no reclosure; not percent', 'detection': '> 0', 'covariates': [],
              'mappingVersion': 'curated-denitrification-sum-v1', 'formulaReferenceSha256': FORMULA_REFERENCE_SHA256, 'installedDitingVersion': 'unknown'}
    record['analysisKey'] = hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()
    return record, ko_rows, pathway_rows, km, pmatrix, mapping
