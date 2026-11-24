"""Offline full-cohort association fits over the published CoverM matrix."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from importlib.metadata import version
from typing import Any

import numpy as np
from statsmodels.regression.linear_model import OLS

from app.compute.statistics import benjamini_hochberg
from app.domain.mag import MagDataset
from app.domain.mag_robustness import (
    ANALYSIS_VERSION,
    FDR_ALPHA,
    Association,
    BatchOmission,
    Covariate,
    Estimate,
    RobustnessSummary,
)

METHODS = {
    'response': 'log₂(CoverM 原始相对丰度百分比)，不重新归一化，不加伪计数。',
    'sampleSelection': '按样本 ID 匹配，使用纳入协变量的完整记录。两个全队列模型使用相同样本。',
    'featureSelection': '在发布矩阵全样本中，有零值、负值、非有限值或超出百分比范围的 MAG 整列暂缓。常量或无法估计标准误的 MAG 不进入检验集合。',
    'model': '含截距 OLS，NC 为参照，年龄作中心化连续变量，性别和经过确认的处理批次按分类固定效应纳入。',
    'inference': 'HC3 稳健标准误，使用残差自由度的 t 分布给出双侧 p 值与 95% 置信区间。β 为 AD−NC 的 log₂ 差，2^β 为模型估计的几何均值比。',
    'fdr': '两套主模型在共同可估计的 MAG 集合上各自做 BH；若无可用调整模型，则在可估计的未校正集合上做 BH。逐批剔除展示效应与区间。',
    'batchOmission': '每次仅剔除一个已确认的处理批次，保留同样的调整口径并重建设计矩阵。剩下一种批次水平时，该因子无自由度。',
    'influence': '完整队列调整模型检查 Cook 距离（描述性参考 4/n）及删去单个样本时 β 的最大绝对变化。保留所有通过纳入规则的样本。',
    'interpretation': '同一队列内的探索性关联。相对丰度用于关联分析，检出需结合独立覆盖与比对证据。',
}


def sample_counts(samples):
    diseases = Counter(sample['disease'] for sample in samples)
    return {'sampleCount': len(samples), 'adCount': diseases['AD'], 'ncCount': diseases['NC']}


def unavailable(reason: str) -> Estimate:
    return Estimate(status='unavailable', reason=reason)


@dataclass(frozen=True)
class Design:
    indices: np.ndarray
    columns: list[str]
    x: np.ndarray
    leverage: np.ndarray
    rank: int
    residual_df: int
    condition_number: float | None
    reference_batch: str | None
    reason: str | None

    def audit(self) -> dict[str, Any]:
        return {
            'columns': self.columns, 'rank': self.rank, 'residualDf': self.residual_df,
            'conditionNumber': self.condition_number, 'referenceBatch': self.reference_batch,
            'maxLeverage': float(self.leverage.max()) if self.leverage.size else None,
            'reason': self.reason,
        }


def make_design(data: MagDataset, indices: np.ndarray, covariates: list[Covariate]) -> Design:
    samples = [data.samples[i] for i in indices]
    names = ['intercept', 'AD']
    columns = [np.ones(len(samples)), np.asarray([s['disease'] == 'AD' for s in samples], dtype=float)]
    reference_batch = None
    if 'age' in covariates:
        ages = np.asarray([s['age'] for s in samples], dtype=float)
        names.append('centeredAge')
        columns.append(ages - ages.mean() if ages.size else ages)
    if 'gender' in covariates:
        names.append('gender=M')
        columns.append(np.asarray([s['gender'] == 'M' for s in samples], dtype=float))
    if 'batch' in covariates:
        batches = sorted({s['batch'] for s in samples})
        reference_batch = batches[0] if batches else None
        for batch in batches[1:]:
            names.append(f'batch={batch}')
            columns.append(np.asarray([s['batch'] == batch for s in samples], dtype=float))
    x = np.column_stack(columns)
    rank = int(np.linalg.matrix_rank(x)) if len(indices) else 0
    residual_df = len(indices) - rank
    counts = sample_counts(samples)
    reason, leverage, condition = None, np.array([]), None
    if min(counts['adCount'], counts['ncCount']) < 2:
        reason = 'AD 或 NC 少于 2 个可用样本。'
    elif rank != x.shape[1] or residual_df <= 0:
        reason = '设计矩阵秩不足或没有剩余自由度。'
    else:
        leverage = np.einsum('ij,ji->i', x, np.linalg.pinv(x))
        condition = float(np.linalg.cond(x))
        if np.any(leverage >= 1 - 1e-10):
            reason = '存在杠杆值接近 1 的样本，HC3 不可估计。'
    return Design(indices, names, x, leverage, rank, residual_df, condition, reference_batch, reason)


def complete_age(sample) -> bool:
    age = sample.get('age')
    return age is not None and np.isfinite(age) and 0 <= age <= 120


def plan_design(data: MagDataset, confirmed_batch: bool):
    """Choose covariates from the metadata and design alone, before reading outcomes."""
    indices = np.arange(len(data.samples))
    covariates: list[Covariate] = []
    notes: list[str] = []
    candidate_fields: tuple[tuple[Covariate, str, Callable[[dict[str, Any]], bool]], ...] = (
        ('age', '年龄', complete_age), ('gender', '性别', lambda s: s.get('gender') in {'F', 'M'}),
    )
    for field, label, valid in candidate_fields:
        complete = np.asarray([i for i in indices if valid(data.samples[i])], dtype=int)
        proposed = make_design(data, complete, [*covariates, field])
        if proposed.reason:
            notes.append(f'{label}未纳入：{proposed.reason}')
            continue
        if len(complete) != len(indices):
            notes.append(f'{label}完整记录规则排除 {len(indices) - len(complete)} 个样本。')
        covariates.append(field)
        indices = complete

    batches = Counter(data.samples[i].get('batch') or '' for i in indices)
    batch_reason = None
    if not confirmed_batch:
        batch_reason = '当前修订没有经过确认的技术处理批次映射。'
    elif '' in batches:
        batch_reason = '纳入样本的处理批次字段有缺失。'
    elif len(batches) <= 1:
        batch_reason = '有效处理批次不足两个。'
    else:
        proposed = make_design(data, indices, [*covariates, 'batch'])
        if proposed.reason:
            batch_reason = f'批次与分组或其他协变量混杂，或批次内信息不足。{proposed.reason}'
    if batch_reason:
        notes.append(f'批次校正与逐批剔除暂不可用：{batch_reason}')
    else:
        covariates.append('batch')
    return indices, covariates, notes


def fit_estimate(y: np.ndarray, design: Design, reason: str | None = None, *, diagnostics=False):
    if reason or design.reason:
        return unavailable(reason or design.reason), {}
    if np.ptp(y) == 0:
        return unavailable('纳入样本的丰度没有变异。'), {}

    model = OLS(y, design.x).fit()
    if np.linalg.norm(model.resid) <= np.finfo(float).eps * max(1., np.linalg.norm(y)) * len(y):
        return unavailable('残差变异不足，无法估计 HC3 标准误。'), {}
    robust = model.get_robustcov_results(cov_type='HC3', use_t=True)
    beta, se, p = map(float, (robust.params[1], robust.bse[1], robust.pvalues[1]))
    low, high = map(float, robust.conf_int(alpha=.05)[1])
    if not np.isfinite([beta, se, p, low, high]).all() or se <= 0 or high <= low:
        return unavailable('HC3 标准误或区间无法估计。'), {}
    with np.errstate(over='ignore', under='ignore'):
        ratio = float(np.exp2(beta))
    estimate = Estimate(status='estimated', beta=beta, ciLow=low, ciHigh=high, standardError=se,
                        pValue=p, geometricMeanRatio=ratio if np.isfinite(ratio) and ratio > 0 else None)
    if not diagnostics:
        return estimate, {}

    # Exact OLS case deletion for the disease coefficient (same design columns).
    deletion = model.model.pinv_wexog[1] * model.resid / (1 - design.leverage)
    largest = int(np.argmax(np.abs(deletion)))
    cook = model.get_influence().cooks_distance[0]
    return estimate, {
        'maxCooksDistance': float(cook.max()), 'influentialSampleCount': int(np.count_nonzero(cook > 4 / len(y))),
        'maxSingleSampleBetaChange': float(abs(deletion[largest])), 'mostInfluentialIndex': int(design.indices[largest]),
    }


def assign_fdr(associations: list[Association], adjusted_planned: bool) -> tuple[int, int]:
    family = [row for row in associations if row.unadjusted.status == 'estimated'
              and (not adjusted_planned or row.adjusted.status == 'estimated')]
    for name in (('unadjusted', 'adjusted') if adjusted_planned else ('unadjusted',)):
        estimates = [getattr(row, name) for row in family]
        for estimate, q in zip(estimates, benjamini_hochberg([r.pValue for r in estimates]), strict=True):
            estimate.qValue = float(q)
    return len(family), len(family) if adjusted_planned else 0


def validate_input(data: MagDataset) -> dict[str, Any]:
    if data.matrix.shape != (len(data.sample_ids), len(data.mag_ids)) or not data.samples or not data.mag_ids:
        raise ValueError('发布矩阵与样本或 MAG 目录尺寸不一致。')
    if tuple(s['sampleId'] for s in data.samples) != data.sample_ids or any(
        not all(ids) or len(set(ids)) != len(ids) for ids in (data.sample_ids, data.mag_ids)
    ):
        raise ValueError('发布矩阵索引和元数据未对齐，或存在缺失、重复 ID。')
    if any(s['disease'] not in {'AD', 'NC'} for s in data.samples):
        raise ValueError('发现 AD / NC 之外的疾病标签。')
    identifier_audit = {}
    for key in ('sampleId', 'sampleName', 'accession', 'subjectId'):
        values = [s[key] for s in data.samples if s.get(key)]
        duplicate_count = len(values) - len(set(values))
        identifier_audit[key] = {'provided': len(values), 'duplicates': duplicate_count}
        if duplicate_count:
            raise ValueError(f'{key} 有重复记录，需先核对采样单位和样本选择规则。')
    return identifier_audit


def fit_cohort(data: MagDataset, protocol: dict[str, Any], inputs: dict[str, Any]):
    identifier_audit = validate_input(data)
    batch = protocol.get('processingBatch')
    indices, covariates, notes = plan_design(data, confirmed_batch=bool(batch))
    unadjusted = make_design(data, indices, [])
    adjusted = make_design(data, indices, covariates)
    counts = sample_counts([data.samples[i] for i in indices])
    omissions = {}
    if 'batch' in covariates:
        for label in sorted({data.samples[i]['batch'] for i in indices}):
            others = np.asarray([i for i in indices if data.samples[i]['batch'] != label], dtype=int)
            omissions[label] = make_design(data, others, covariates)
    omission_counts = {label: sample_counts([data.samples[i] for i in design.indices]) for label, design in omissions.items()}

    matrix = data.matrix
    finite = np.isfinite(matrix)
    nonpositive_counts = (finite & (matrix <= 0)).sum(axis=0)
    nonfinite_counts = (~finite).sum(axis=0)
    high_counts = (finite & (matrix > 100)).sum(axis=0)
    log_matrix = np.log2(np.where(finite & (matrix > 0) & (matrix <= 100), matrix, 1.0))
    associations: list[Association] = []
    sensitivity: list[BatchOmission] = []
    for column, mag_id in enumerate(data.mag_ids):
        nonpositive, nonfinite, too_high = map(int, (nonpositive_counts[column], nonfinite_counts[column], high_counts[column]))
        problems = [f'{count} 个{label}' for count, label in (
            (nonpositive, '零或负值'), (nonfinite, '非有限值或缺失'), (too_high, '超出百分比范围的值'),
        ) if count]
        reason = '该发布的丰度列含' + '、'.join(problems) + '。' if problems else None
        y = log_matrix[:, column]
        raw, _ = fit_estimate(y[indices], unadjusted, reason)
        corrected, diagnostics = fit_estimate(y[indices], adjusted, reason or (
            None if covariates else '没有满足建模条件的协变量。'
        ), diagnostics=True)
        if diagnostics:
            diagnostics['mostInfluentialSampleId'] = data.sample_ids[diagnostics.pop('mostInfluentialIndex')]
        values = matrix[finite[:, column], column]
        associations.append(Association(magId=mag_id, **counts, unadjusted=raw, adjusted=corrected,
                                        minAbundancePercent=float(values.min()) if values.size else None,
                                        nonPositiveCount=nonpositive, nonFiniteCount=nonfinite, outOfRangeCount=too_high,
                                        **diagnostics))
        for label, design in omissions.items():
            estimate, _ = fit_estimate(y[design.indices], design, reason)
            change, reversed_direction, width_ratio = None, None, None
            if estimate.status == corrected.status == 'estimated':
                change = estimate.beta - corrected.beta
                reversed_direction = estimate.beta * corrected.beta < 0
                width_ratio = (estimate.ciHigh - estimate.ciLow) / (corrected.ciHigh - corrected.ciLow)
            sensitivity.append(BatchOmission(magId=mag_id, excludedBatch=label, **omission_counts[label],
                                             estimate=estimate, betaChange=change, directionReversed=reversed_direction,
                                             intervalWidthRatio=width_ratio))

    tested_raw, tested_adjusted = assign_fdr(associations, bool(covariates))
    summary = RobustnessSummary(
        datasetKey=data.version, projectAccession=protocol['projectAccession'], release=data.fingerprint,
        analysisVersion=ANALYSIS_VERSION, **counts, cohortSampleCount=len(data.samples), magCount=len(data.mag_ids),
        testedUnadjusted=tested_raw, testedAdjusted=tested_adjusted, fdrAlpha=FDR_ALPHA,
        belowFdrUnadjusted=sum(row.unadjusted.qValue is not None and row.unadjusted.qValue < FDR_ALPHA for row in associations),
        belowFdrAdjusted=sum(row.adjusted.qValue is not None and row.adjusted.qValue < FDR_ALPHA for row in associations),
        covariates=covariates, covariateNotes=notes, batchSourceColumn=batch['sourceColumn'] if batch else None,
        batchDefinition=batch['definition'] if batch else None, omittedBatches=list(omissions),
        observationUnitNote=protocol['observationUnitNote'], statsmodelsVersion=version('statsmodels'),
    )
    qc = cohort_quality_control(data, indices, identifier_audit, associations)
    qc.update(inputs=inputs, protocol=protocol, retainedSampleIds=[data.sample_ids[i] for i in indices],
              design={'unadjusted': unadjusted.audit(), 'adjusted': adjusted.audit() if covariates else None,
                      'omissions': {label: {**design.audit(), **omission_counts[label],
                                             'retainedSampleIds': [data.sample_ids[i] for i in design.indices]}
                                    for label, design in omissions.items()}},
              software={name: version(name) for name in ('numpy', 'scipy', 'statsmodels')})
    return summary, qc, associations, sensitivity


def cohort_quality_control(data, indices, identifier_audit, associations):
    included = [data.samples[i] for i in indices]
    age = {group: [s['age'] for s in included if s['disease'] == group and complete_age(s)] for group in ('AD', 'NC')}
    age_ranges = {group: [min(values), max(values)] if values else None for group, values in age.items()}
    overlap = None
    if all(age.values()):
        lower = max(min(values) for values in age.values())
        upper = min(max(values) for values in age.values())
        if lower <= upper:
            overlap = [lower, upper]
    positive = data.matrix[np.isfinite(data.matrix) & (data.matrix > 0)]
    influential = [row for row in associations if row.maxSingleSampleBetaChange is not None]
    return {
        'identifiers': identifier_audit, 'matrixShape': list(data.matrix.shape),
        'finiteCells': int(np.count_nonzero(np.isfinite(data.matrix))),
        'zeroCells': int(np.count_nonzero(data.matrix == 0)),
        'positiveAbundancePercentQuantiles': dict(zip(['min', 'p01', 'median', 'p99', 'max'],
                                                     np.quantile(positive, [0, .01, .5, .99, 1]).tolist(), strict=True)) if positive.size else None,
        'ageRanges': age_ranges, 'ageOverlap': overlap,
        'ageOutsideOverlap': {g: sum(not overlap[0] <= v <= overlap[1] for v in values)
                              for g, values in age.items()} if overlap else None,
        'sexComposition': {g: dict(Counter(s['gender'] or 'missing' for s in included if s['disease'] == g)) for g in ('AD', 'NC')},
        'batchComposition': {b: sample_counts([s for s in included if (s['batch'] or 'missing') == b])
                             for b in sorted({s['batch'] or 'missing' for s in included})},
        'influence': {'modelsChecked': len(influential),
                      'magsWithCooksFlag': sum(bool(row.influentialSampleCount) for row in influential),
                      'maxSingleSampleBetaChange': max((row.maxSingleSampleBetaChange for row in influential), default=None),
                      'largestChanges': [row.model_dump(include={'magId', 'mostInfluentialSampleId', 'maxSingleSampleBetaChange', 'maxCooksDistance'})
                                         for row in sorted(influential, key=lambda r: -r.maxSingleSampleBetaChange)[:10]]},
    }
