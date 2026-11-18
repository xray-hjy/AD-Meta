import { useMemo, useRef, useState } from 'react';
import CartesianEChart from './CartesianEChart';
import { getProjectionAuditMetadata, getProjectionAuditRows } from '../../api/analysisRuns';
import { escapeTooltipText } from '../../utils/tooltipHtml';
import './heatmap-analysis.css';

export const heatmapNumber = value => value == null || !Number.isFinite(Number(value)) ? '—'
  : String(Number(Number(value).toPrecision(6)));

function SingleFeatureDistribution({ data }) {
  const stat = data.stats[0];
  const relative = data.analysisRecord.inputScale === 'relative_abundance';
  const unit = relative ? '相对丰度（%）' : '源丰度（单位未声明）';
  const option = useMemo(() => {
    const build = (labels, matrix, group, index) => ({ name: group, type: 'scatter', symbolSize: 7,
      itemStyle: { color: index ? '#0072B2' : '#D55E00', opacity: .65 },
      data: labels.map((sample, i) => [index + (((i * 17) % 23) / 23 - .5) * .28, matrix[i][0] * (relative ? 100 : 1), sample, group]) });
    return { animation: false, grid: { left: 90, right: 32, top: 36, bottom: 55 },
      xAxis: { type: 'value', min: -.5, max: 1.5, interval: .5, axisLabel: { formatter: x => x === 0 ? 'AD' : x === 1 ? 'NC' : '' }, splitLine: { show: false } },
      yAxis: { type: 'value', name: unit, nameLocation: 'middle', nameGap: 65, scale: true },
      tooltip: { formatter: params => `${escapeTooltipText(params.data[2] || '组均值')} · ${escapeTooltipText(params.data[3] || params.seriesName)}<br/>${unit}: ${heatmapNumber(params.data[1])}` },
      series: [build(data.adLabels, data.rawAdMatrix, 'AD', 0), build(data.ncLabels, data.rawNcMatrix, 'NC', 1),
        { name: '组均值', type: 'scatter', symbol: 'diamond', symbolSize: 14, itemStyle: { color: '#0f172a' },
          data: [[0, stat.meanAD * (relative ? 100 : 1)], [1, stat.meanNC * (relative ? 100 : 1)]] }] };
  }, [data, relative, stat.meanAD, stat.meanNC, unit]);
  return <section className="heatmap-single-feature" aria-label="单物种样本分布">
    <h3>{stat.fullName.split('|').at(-1).replace(/^s__/, '')}：样本分布</h3>
    <p>当前仅展示 1 个物种。散点为每个样本的原始丰度，菱形为组均值；横向错开仅用于避免遮挡，不代表另一项测量。单物种不据此解释丰富的聚类结构。</p>
    <p>AD 检出 {stat.detectedAD}/{stat.nAD}（{heatmapNumber(stat.prevalenceAD * 100)}%）；NC 检出 {stat.detectedNC}/{stat.nNC}（{heatmapNumber(stat.prevalenceNC * 100)}%）。</p>
    <p>p={heatmapNumber(stat.pValue)}；q={heatmapNumber(stat.qValue)}；均值 log₂FC={heatmapNumber(stat.log2FC)}；秩二列相关={heatmapNumber(stat.effectSize)}。</p>
    <CartesianEChart option={option} showDataTable={false} frameActions style={{ height: 350 }}
      ariaLabel="单物种 AD NC 原始丰度样本点与组均值"
      exportConfig={{ fileName: 'heatmap-single-feature-distribution', format: 'svg', minWidth: 1000, minHeight: 500 }} />
  </section>;
}

export default function HeatmapAnalysisPanel({ data, projection, onExplore }) {
  const host = useRef(null);
  const [downloadStatus, setDownloadStatus] = useState('');
  const summary = data?.summary, record = data?.analysisRecord;
  if (!summary || !record) return null;
  const exploratory = data.display.viewMode === 'exploratory';
  const exportRecord = () => {
    const blob = new Blob([JSON.stringify({ analysisRecord: record, summary, display: data.display,
      criteria: data.filter, projectionKey: projection?.projectionKey, scope: projection?.scope }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `heatmap-analysis-${record.analysisKey.slice(0, 12)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openStats = () => {
    const details = host.current?.closest('.chart-frame')?.querySelector('details.projection-audit');
    if (details) { details.open = true; details.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  };
  const downloadStatistics = async () => {
    setDownloadStatus('正在下载全部源物种统计…');
    try {
      const request = { ...projection.projectionRequest, projectionKey: projection.projectionKey,
        section: 'statistical_filter', filters: {}, query: '', sortBy: 'qValue', sortDirection: 'asc', limit: 500, offset: 0 };
      await getProjectionAuditMetadata(projection.runKey, projection.artifactKey, 'heatmap', request);
      const rows = [];
      let total = 1;
      for (let offset = 0; offset < total; offset += 500) {
        const result = await getProjectionAuditRows(projection.runKey, projection.artifactKey, 'heatmap', { ...request, offset });
        total = result.total; rows.push(...result.items);
      }
      const keys = ['analysisKey', 'datasetRevision', 'methodVersion', 'inputScale', 'abundanceUnit', 'prefilter', 'testedFeatureCount', 'foldChangePseudocount', 'viewMode', 'displayTopN', 'qValueMax', 'log2FcMinAbs', 'feature', 'tested', 'inclusionReason', 'status', 'reason', 'pValue', 'qValue', 'effectSize', 'effectMetric', 'log2FC', 'nAD', 'nNC', 'detectedAD', 'detectedNC', 'prevalenceAD', 'prevalenceNC', 'meanAD', 'meanNC', 'medianAD', 'medianNC', 'minAD', 'maxAD', 'minNC', 'maxNC', 'log2FCAtEps1e10', 'log2FCAtEps1e8', 'epsilonSensitive'];
      const cell = value => {
        if (value == null) return '';
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        const text = String(value), safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
        return `"${safe.replaceAll('"', '""')}"`;
      };
      const csv = '\ufeff' + [keys.join(','), ...rows.map(row => keys.map(key => cell({ ...row,
        analysisKey: record.analysisKey, datasetRevision: projection.datasetRevision, viewMode: data.display.viewMode,
        methodVersion: record.methodVersion, inputScale: record.inputScale, abundanceUnit: record.inputScale === 'relative_abundance' ? 'stored_proportion' : 'source_unit_unknown',
        prefilter: record.prefilter.mode, testedFeatureCount: record.testedFeatureCount, foldChangePseudocount: record.foldChangePseudocount, displayTopN: data.filter.topN,
        qValueMax: data.filter.qValueMax, log2FcMinAbs: data.filter.log2FcMinAbs }[key])).join(','))].join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
      link.href = url; link.download = `heatmap-full-statistics-${record.analysisKey.slice(0, 12)}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadStatus(`已下载全部 ${rows.length} 个源物种统计，未检验项的 p/q 留空。`);
    } catch (error) { setDownloadStatus(`下载失败：${error.message}`); }
  };
  return <section ref={host} className="heatmap-analysis" aria-label="热图分析记录与结果解释">
    <h3>{exploratory ? '探索性丰度热图 · 不代表显著差异' : summary.bothPassCount === 0 ? '本次统计筛选为零候选，丰度数据仍可查看' : '差异分析结果'}</h3>
    <dl className="heatmap-analysis__summary">
      {[["源物种", summary.sourceFeatureCount], ["进入检验 / BH 校正", summary.testedFeatureCount], ["预筛排除", summary.excludedFeatureCount],
        ["未校正 p < 0.05", summary.rawPLt005Count], [`q < ${data.filter.qValueMax}`, summary.qPassCount],
        [`|log₂FC| > ${data.filter.log2FcMinAbs}`, summary.effectPassCount], ["同时通过", summary.bothPassCount], ["最小 q", heatmapNumber(summary.minQ)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <p>{data.display.selectionNote}。当前显示 {summary.displayedCount} 个物种；Top N 只限制展示，不改变检验与 BH 校正集合。</p>
    {summary.bothPassCount === 0 ? <p>在当前方法、样本范围和阈值下没有同时通过的物种，不等于不存在生物学差异。系统不会自动放宽阈值，也不会用未通过项补成显著差异热图。</p> : null}
    {record.prefilter.mode !== 'none' ? <p className="heatmap-analysis__caution">正在使用用户选择的预筛敏感性方案：合并样本中丰度严格大于 {heatmapNumber(record.prefilter.strictAbundanceThreshold)} 的样本比例 ≥ {heatmapNumber(record.prefilter.minimumPrevalence * 100)}%。这会改变 BH 校正集合；预筛不读取分组标签，也不自动保证筛选后的推断性质，不应按显著物种数量挑选方案。</p> : <p>默认不预筛，对全部源物种进行检验与校正；常数和全零物种记为 p=q=1。</p>}
    <p>当前为双侧 Mann–Whitney U + BH-FDR，未调整协变量；效应方向 AD 相对 NC。log₂FC 使用组算术均值及 10⁻⁹ 伪计数，{summary.epsilonSensitiveCount} 个物种对 10⁻¹⁰／10⁻⁸ 检查较敏感，明细可核对。MaAsLin2 是独立模型，不与这里的均值 log₂FC 混用。</p>
    {exploratory && data.display.ranking === 'q_value' ? <p className="heatmap-analysis__caution">按 q 值排序使用了 AD/NC 标签；该热图不能再被解释为独立、无监督的分组验证。</p> : null}
    <div className="heatmap-analysis__actions">
      {!exploratory && onExplore ? <button type="button" onClick={onExplore}>查看探索性丰度热图</button> : null}
      <button type="button" onClick={openStats}>查看完整统计结果</button>
      {projection?.projectionRequest ? <button type="button" disabled={downloadStatus.startsWith('正在')} onClick={downloadStatistics}>下载完整统计 CSV</button> : null}
      <button type="button" onClick={exportRecord}>下载分析记录 JSON</button>
    </div>
    {downloadStatus ? <p role="status">{downloadStatus}</p> : null}
    <details><summary>输入、方法与显示记录</summary>
      <p>分析记录：{record.analysisKey}；数据修订：{record.datasetRevision || projection?.datasetRevision || '直接输入'}；统计表校验：{record.statisticsSha256 || '直接计算'}。</p>
      <p>AD {record.groupCounts.AD} 个样本，NC {record.groupCounts.NC} 个样本；输入尺度 {record.inputScale}；热图内不再次闭合或归一化；非有限、缺失及负值拒绝计算，不静默填零。</p>
      <p>MWU p 值方法 auto（小样本无结值时精确法，否则渐近法，连续性校正）；BH 范围为本记录全部预筛合格物种。{data.valueTransformNote}</p>
      <p>{data.display.clustering === 'grouped' ? '样本按 AD、NC 分组并保留组内来源顺序，物种按选择排名，不聚类。' : '欧氏距离 + average linkage；组内图分别聚类，合并图允许 AD/NC 混排；聚类使用当前显示变换后的矩阵。'}</p>
    </details>
    {data.stats?.length === 1 && data.rawAdMatrix && data.rawNcMatrix ? <SingleFeatureDistribution data={data} /> : null}
  </section>;
}
