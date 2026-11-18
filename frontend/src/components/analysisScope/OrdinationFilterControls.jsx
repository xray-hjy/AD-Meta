import { useEffect, useState } from 'react';
import { fetchJson } from '../../api/client';
import './ordination-filter.css';

const OPTIONS = [
  ['standard', '标准：≥0.01%，≥10% 样本'], ['unfiltered', '全部可用物种'],
  ['custom', '自定义筛选'], ['top_n', '高丰度 Top N 子集'],
  ['inclusive', '宽松：≥0.001%，≥5% 样本'], ['robust', '严格：≥0.05%，≥20% 样本'],
];
export default function OrdinationFilterControls({ runKey, artifactKey, kind, scope, topN, parameters, onChange }) {
  const [draft, setDraft] = useState(parameters);
  const [count, setCount] = useState(topN);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => { setDraft(parameters); setCount(topN); }, [parameters, topN]);
  const mode = draft.filterPreset || (kind === 'pca' ? 'top_n' : 'standard');
  const valid = Number.isFinite(count) && count >= 2 && count <= 500 && Number.isInteger(count)
    && ['minimumRelativeAbundance', 'minimumPrevalence'].every(key => Number.isFinite(draft[key]) && draft[key] >= 0 && draft[key] <= 1);
  const dirty = JSON.stringify(draft) !== JSON.stringify(parameters) || count !== topN;
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    if (!valid) { setBusy(false); return () => controller.abort(); }
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const next = await fetchJson(`/api/analysis-runs/${encodeURIComponent(runKey)}/artifacts/${encodeURIComponent(artifactKey)}/ordinations/${kind}/preview`, {
          method: 'POST', body: { scope, topN: count, parameters: draft }, signal: controller.signal,
        });
        if (!controller.signal.aborted) setResult(next);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message || '预览失败，请重试');
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [runKey, artifactKey, kind, scope, count, draft, valid]);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  return <section className="ordination-filter" aria-label="物种筛选工作区">
    <div className="ordination-filter__fields">
      <label>物种范围<select aria-label="物种范围" value={mode} onChange={event => update('filterPreset', event.target.value)}>
        {OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {mode === 'custom' ? <>
        <label>单样本最低相对丰度（%）<input type="number" aria-label="单样本最低相对丰度（%）" min="0" max="100" step="0.001" value={draft.minimumRelativeAbundance * 100}
          onChange={event => update('minimumRelativeAbundance', event.target.value === '' ? NaN : Number(event.target.value) / 100)} /></label>
        <label>最低样本比例（%）<input type="number" aria-label="最低样本比例（%）" min="0" max="100" step="1" value={draft.minimumPrevalence * 100}
          onChange={event => update('minimumPrevalence', event.target.value === '' ? NaN : Number(event.target.value) / 100)} /></label>
      </> : null}
      {mode === 'top_n' ? <label>参与计算的物种数<input type="number" aria-label="参与计算的物种数" min="2" max="500" step="1" value={count}
        onChange={event => setCount(event.target.value === '' ? NaN : Number(event.target.value))} /></label> : null}
      <button type="button" disabled={!valid || busy || !result || !dirty} onClick={() => onChange(scope, count, draft)}>应用筛选并重新计算</button>
    </div>
    <p>{mode === 'top_n' ? '按当前有效样本闭合后的平均相对丰度排序；Top N 决定参与计算的物种，是高丰度子集探索。'
      : mode === 'unfiltered' ? '使用当前样本范围内的全部输入物种，不按丰度或检出率排除物种。'
        : '在筛选前总丰度大于零的有效样本中，统计单样本相对丰度达到阈值的样本比例；筛选不使用分组标签。阈值为 0 时仅统计丰度 > 0 的检出。'}</p>
    <p role="status">{!valid ? '请输入有效阈值（0–100%）及整数物种数（2–500）。' : busy ? '正在预览筛选…' : error || (result
      ? `预计保留 ${result.filter.selectedCount} / ${result.filter.sourceFeatureCount} 个物种；有效样本 ${result.sampleFiltering.selectedSampleCount} / ${result.sampleFiltering.sourceSampleCount}（原始总丰度为零 ${result.sampleFiltering.zeroTotalSampleCount}，筛选后为零 ${result.sampleFiltering.zeroAfterFilterSampleCount}）。${dirty ? '条件尚未应用，当前图仍为上次计算结果。' : '当前条件已应用。'}` : '')}</p>
    {result ? <p>保留丰度比例：平均 {(result.filter.retainedMass.mean * 100).toFixed(2)}%，最低 {(result.filter.retainedMass.minimum * 100).toFixed(2)}%。</p> : null}
    {result && (result.sampleFiltering.excludedZeroTotalSamples.length || result.sampleFiltering.excludedZeroAfterFilterSamples.length) ? <details><summary>查看排除的样本</summary><p>原始总丰度为零：{result.sampleFiltering.excludedZeroTotalSamples.join('、') || '无'}</p><p>筛选后总丰度为零：{result.sampleFiltering.excludedZeroAfterFilterSamples.join('、') || '无'}</p></details> : null}
    {result ? <details open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>查看本次筛选明细（{result.rows.length} 个物种）</summary>
      <div className="ordination-filter__table"><table><thead><tr><th>物种</th><th>平均相对丰度</th><th>达到阈值样本比例</th><th>结果</th></tr></thead>
        <tbody>{(detailsOpen ? result.rows : []).map(row => <tr key={row.feature}><td>{row.feature}</td><td>{(row.meanRelativeAbundance * 100).toPrecision(4)}%</td><td>{(row.prevalence * 100).toFixed(1)}%</td><td>{row.status === 'displayed' ? '保留' : '排除'}</td></tr>)}</tbody></table></div>
    </details> : null}
    <small>标准、宽松与严格是本项目探索预设；并非原论文方法的完整复现，不应按组间分离程度选择阈值。</small>
  </section>;
}
