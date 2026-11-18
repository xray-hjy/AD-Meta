import { useMemo, useState } from 'react';
import ClientDataTable from '../data-display/ClientDataTable';
import ResultDisclosure from '../data-display/ResultDisclosure';
import ChartSupplement from './ChartSupplement';
import { formatAbundance } from './boxplotView';
import { groupSummaryRows } from './boxplotResearch';

export default function BoxplotResearchPanel({ model, projection, onDownload, downloadStatus }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => groupSummaryRows(model.available, model.series, model.activeTransform, model.groupCounts), [model]);
  const count = value => value == null ? '—' : value;
  const canDownload = Boolean(projection?.projectionKey && projection.projectionRequest);
  return <ChartSupplement><ResultDisclosure title="分组统计与复核数据"
    className="boxplot-research"
    summary={`${model.available.length} 个对象 · ${model.activeTransform.label}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <p className="boxplot-view-note">当前尺度：{model.activeTransform.label}。检出定义为存储丰度 &gt; 0；检出比例分母为有效数值样本数。
      零值计入分位数和分母，缺失值排除并单列。Q1、Q3 使用线性插值，IQR = Q3 − Q1。</p>
    {rows.some(row => row.validCount == null) ? <p className="boxplot-view-note">当前结果未提供完整的分组检出信息，未知项显示“—”；重新计算图表后可查看。</p> : null}
    <div className="boxplot-research-actions">
      <button type="button" className="analysis-button" disabled={!canDownload || downloadStatus?.busy} onClick={onDownload}>
        {downloadStatus?.busy ? '正在准备复核数据…' : '下载全部已选对象复核数据 ZIP'}
      </button>
      <span>包含逐样本丰度、三种尺度的分组统计、数据版本及方法说明。</span>
    </div>
    {downloadStatus?.message ? <p role={downloadStatus.error ? 'alert' : 'status'}>{downloadStatus.message}</p> : null}
    {projection ? <details className="boxplot-research-provenance"><summary>数据版本与统计口径</summary>
      <dl><dt>分析运行</dt><dd>{projection.runKey}</dd><dt>分析产物</dt><dd>{projection.artifactKey}</dd>
        <dt>数据版本</dt><dd>{projection.datasetRevision}</dd><dt>丰度口径</dt><dd>{projection.dataSemantics?.abundanceScale || '未提供'}</dd>
        <dt>标准化方法</dt><dd>{projection.dataSemantics?.normalization || '未提供'}</dd><dt>计算版本</dt><dd>{projection.dataSemantics?.computeVersion || '未提供'}</dd>
        <dt>图表标识</dt><dd>{projection.projectionKey}</dd></dl>
      <p>统计范围为当前已应用的样本与全部绘图对象；每个尺度先变换逐样本值，再计算箱线统计。主体放大、分页及散点开关只影响图形展示。</p>
    </details> : null}
    {open ? <ClientDataTable rows={rows} ariaLabel="物种分组统计，可滚动" footer="表中包含全部已选对象，不受图表分页影响；下载文件保留数值序列化精度。"
      renderRow={row => <tr key={`${row.featureId}:${row.group}`}>
        <td><details><summary>{row.shortName}</summary><div className="boxplot-research-identity">{row.feature}<br />ID: {row.featureId}</div></details></td>
        <td>{row.group}</td><td>{count(row.validCount)} / {count(row.sampleCount)}</td><td>{count(row.missingCount)}</td>
        <td>{row.detectionRate == null ? '—' : `${row.detectedCount}/${row.validCount}（${(row.detectionRate * 100).toFixed(1)}%）`}</td>
        <td>{count(row.zeroCount)}</td><td>{formatAbundance(row.median)}</td><td>{formatAbundance(row.q1)} – {formatAbundance(row.q3)}</td><td>{formatAbundance(row.iqr)}</td>
      </tr>}><thead><tr>{['完整名称', '组别', '有效 / 组内样本', '缺失', '检出数 / 有效数（比例）', '零值数', '中位数', 'Q1 – Q3', 'IQR'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
    </ClientDataTable> : null}
  </ResultDisclosure></ChartSupplement>;
}
