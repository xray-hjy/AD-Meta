import { useQuery } from '@tanstack/react-query';
import { getMagRobustness, magRobustnessDownloadUrl } from '../../api/mag';
import LoadingState from '../../components/ui/LoadingState';
import { formatMagNumber as number } from './magDistributionView';
import { covariateLabels, fullCohortLabel } from './magRobustnessLabels';

function ExactNumber({ value }) {
  return <span title={value == null ? undefined : String(value)}>{number(value)}</span>;
}

function Interval({ estimate }) {
  return <span className="mag-robustness-interval"><ExactNumber value={estimate.ciLow} /> 至 <ExactNumber value={estimate.ciHigh} /></span>;
}

function ModelRow({ label, estimate, alpha }) {
  if (estimate.status !== 'estimated') return <tr><th scope="row">{label}</th><td colSpan={3}>无法估计 · {estimate.reason}</td></tr>;
  const fdr = estimate.qValue == null ? '未纳入预定义检验集合'
    : estimate.qValue < alpha ? `q < ${alpha}` : `未达 FDR 阈值 ${alpha}`;
  return <tr>
    <th scope="row">{label}</th>
    <td><strong><ExactNumber value={estimate.beta} /></strong><small>比值 <ExactNumber value={estimate.geometricMeanRatio} /></small></td>
    <td><Interval estimate={estimate} /></td>
    <td>p <ExactNumber value={estimate.pValue} /><br />q <ExactNumber value={estimate.qValue} /><small>{fdr}</small></td>
  </tr>;
}

function OmissionRow({ row }) {
  const { excludedBatch, adCount, ncCount, estimate, betaChange, directionReversed, intervalWidthRatio } = row;
  return <tr>
    <th scope="row">{excludedBatch}</th><td>{adCount} / {ncCount}</td>
    {estimate.status === 'estimated' ? <>
      <td><strong><ExactNumber value={estimate.beta} /></strong><small><Interval estimate={estimate} /></small></td>
      <td>{betaChange == null ? '已计算' : <>Δβ <ExactNumber value={betaChange} /></>}
        {directionReversed && <small>方向反转</small>}
        {intervalWidthRatio > 1 && <small>区间变宽 · ×<ExactNumber value={intervalWidthRatio} /></small>}
      </td>
    </> : <td colSpan={2}>无法估计 · {estimate.reason}</td>}
  </tr>;
}

export default function MagRobustnessEvidence({ revision, magId }) {
  const query = useQuery({ queryKey: ['mag', 'robustness', revision, magId],
    queryFn: ({ signal }) => getMagRobustness({ revision, magId }, { signal }), staleTime: 60_000 });
  const result = query.data?.release === revision ? query.data : null;
  const summary = result?.summary;
  const association = result?.association;
  const ready = result?.status === 'ready' && association?.magId === magId && summary?.release === revision;

  return <section className="mag-robustness-evidence" aria-label="协变量校正">
    <h3>协变量校正</h3>
    {query.isPending ? <LoadingState message="正在读取完整队列预计算结果…" /> : !ready ? <div className="mag-robustness-empty">
      <p role={query.isError ? 'alert' : 'status'}>{query.isError ? '校正结果读取失败。' : result?.reason || '当前数据修订暂无可用的完整队列校正结果。'}</p>
      <button type="button" className="analysis-button" disabled={query.isFetching} onClick={() => query.refetch()}>重新读取校正结果</button>
    </div> : <>
      <p className="mag-robustness-scope">{fullCohortLabel(summary)} · AD {association.adCount} / NC {association.ncCount}</p>
      <p>β 为 AD 相对 NC 的 log₂ 丰度差，正值表示 AD 估计较高。比值为 2<sup>β</sup>。{covariateLabels(summary) ? `调整项为${covariateLabels(summary)}。` : '当前修订暂无可用协变量。'}</p>
      <div className="mag-robustness-table" role="region" aria-label="完整队列模型结果" tabIndex={0}>
        <table><thead><tr><th scope="col">模型</th><th scope="col">β / 几何均值比</th><th scope="col">95% CI</th><th scope="col">p / BH-FDR q</th></tr></thead>
          <tbody><ModelRow label="未校正" estimate={association.unadjusted} alpha={summary.fdrAlpha} />
            <ModelRow label="已校正" estimate={association.adjusted} alpha={summary.fdrAlpha} /></tbody>
        </table>
      </div>
      <p className="mag-muted">BH 检验集合包括未校正 {summary.testedUnadjusted} 个 MAG、校正 {summary.testedAdjusted} 个 MAG。
        {summary.testedAdjusted > 0 && summary.belowFdrAdjusted === 0 ? ` 校正模型中没有 MAG 达到 q < ${summary.fdrAlpha}。` : ''}</p>
      <details>
        <summary>逐批剔除{result.sensitivity.length ? ` · ${result.sensitivity.length} 次` : ' · 暂不可用'}</summary>
        {result.sensitivity.length ? <>
          <p>每次剔除一个处理批次后重新拟合。Δβ 为与完整队列校正效应的差，区间倍数以完整队列为参照。</p>
          <div className="mag-robustness-table" role="region" aria-label="逐批剔除结果" tabIndex={0}>
            <table><thead><tr><th scope="col">剔除批次</th><th scope="col">AD / NC</th><th scope="col">β 与 95% CI</th><th scope="col">变化</th></tr></thead>
              <tbody>{result.sensitivity.map(row => <OmissionRow key={row.excludedBatch} row={row} />)}</tbody>
            </table>
          </div>
        </> : <p>{summary.covariateNotes.find(note => note.includes('逐批剔除')) || '此修订未提供逐批剔除结果。'}</p>}
      </details>
      <details>
        <summary>模型、质检与数据修订</summary>
        <p>log₂(CoverM 相对丰度百分比) 的线性回归，采用 HC3 稳健标准误及残差自由度 t 区间。两个主模型采用相同的样本集合，逐模型独立做 BH 校正。</p>
        {summary.batchDefinition && <p>{summary.batchDefinition}</p>}
        {summary.covariateNotes.map(note => <p key={note}>{note}</p>)}
        <p>{summary.observationUnitNote}</p>
        {association.maxSingleSampleBetaChange != null && <p>删去单一样本的最大 |Δβ| 为 <ExactNumber value={association.maxSingleSampleBetaChange} />，
          Cook 距离超过 4/n 的样本有 {association.influentialSampleCount} 个。</p>}
        <p>结果版本 <code>{summary.analysisVersion}</code> · statsmodels {summary.statsmodelsVersion}</p>
        <p>数据修订 <code>{summary.release}</code></p>
      </details>
      <div className="mag-robustness-downloads">
        <a href={magRobustnessDownloadUrl('associations', revision)} download>主结果 CSV</a>
        <a href={magRobustnessDownloadUrl('sensitivity', revision)} download>逐批剔除 CSV</a>
        <a href={magRobustnessDownloadUrl('methods', revision)} download>方法与质检 JSON</a>
      </div>
    </>}
  </section>;
}
