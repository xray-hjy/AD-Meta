import { useEffect, useMemo, useState } from 'react';
import ZoomableGroupedBarChart from './ZoomableGroupedBarChart';
import { escapeTooltipText } from '../../utils/tooltipHtml';

const COLORS = { AD: '#e74c3c', NC: '#2ecc71' };
const DEFAULT_TOP_N = 20;
const clampTopN = (value, max) => Math.max(1, Math.min(max, Math.round(Number(value) || 1)));
const formatNumber = value => value == null || !Number.isFinite(value) ? '未提供'
  : value !== 0 && Math.abs(value) < 0.000001 ? value.toExponential(3)
    : value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
const compactNumber = value => Math.abs(value) >= 1e9 ? `${(value / 1e9).toFixed(1)}B`
  : Math.abs(value) >= 1e6 ? `${(value / 1e6).toFixed(1)}M`
    : Math.abs(value) >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : formatNumber(value);
function abbreviateFeatureName(label) {
  const text = String(label || 'Unknown');
  if (/^K\d{5}/.test(text)) return text;
  const parts = text.replace(/\s+/g, '_').split('_').filter(Boolean);
  return parts.length >= 2 ? `${parts[0][0]}. ${parts.slice(1).join('_')}` : text;
}
function taxonomyHtml(fullName) {
  return String(fullName).split('|').map(part => escapeTooltipText(part.replace(/^([a-z])__/, (_, level) => `${level}: `))).join('<br/>');
}

export default function BarChart({ data, featureLabel = '物种', abundanceScale }) {
  const isProjection = Array.isArray(data?.items) && Array.isArray(data?.series);
  const relative = (data?.dataSemantics?.abundanceScale || abundanceScale) === 'relative_abundance';
  const legacyCount = Array.isArray(data) ? data.length : 0;
  const [topN, setTopN] = useState(DEFAULT_TOP_N);
  const [topNInput, setTopNInput] = useState(String(DEFAULT_TOP_N));
  useEffect(() => {
    if (isProjection || legacyCount <= 0) return;
    const next = Math.min(DEFAULT_TOP_N, legacyCount);
    setTopN(next); setTopNInput(String(next));
  }, [isProjection, legacyCount]);
  const model = useMemo(() => {
    const source = isProjection ? data.items : Array.isArray(data) ? data.slice(0, topN) : [];
    const series = isProjection ? data.series.map(series => ({ ...series, color: series.color || COLORS[series.group || series.key] || '#2563eb' }))
      : [{ key: 'AD', label: 'AD 均值', color: COLORS.AD }, { key: 'NC', label: 'NC 均值', color: COLORS.NC }];
    const items = source.map(item => ({ ...item, id: item.feature || item.species, label: item.feature || item.species,
      fullName: item.fullName || item.feature || item.species,
      values: Object.fromEntries(series.map(series => [series.key, isProjection ? item.values?.[series.key]?.mean ?? null
        : (series.key === 'AD' ? item.adMean : item.ncMean) ?? null]).map(([key, value]) => [key, value == null ? null : value * (relative ? 100 : 1)])) }));
    return { title: `${featureLabel}丰度对比`, featureLabel, items, series,
      axisName: `${isProjection && data.scope?.mode === 'sample' ? '样本' : '平均'}${relative ? '相对丰度（%）' : '丰度'}`,
      formatValue: value => `${formatNumber(value)}${relative && value != null ? '%' : ''}`, formatAxis: compactNumber, abbreviateLabel: abbreviateFeatureName,
      tooltipAppearance: 'light',
      tooltipFormatter: params => {
        const entry = Array.isArray(params) ? params[0] : params;
        const item = items[entry?.dataIndex];
        if (!item) return '';
        return `<b>${escapeTooltipText(item.label)}</b><br/>${item.fullName !== item.label ? `${taxonomyHtml(item.fullName)}<br/>` : ''}${escapeTooltipText(entry.seriesName)}: ${formatNumber(item.values[series[entry.seriesIndex]?.key])}${relative ? '%' : ''}`;
      } };
  }, [data, isProjection, topN, featureLabel, relative]);
  if (!model.items.length || !model.series.length) return <div className="placeholder"><p>暂无{featureLabel}丰度数据</p></div>;
  const updateTopN = value => { const next = clampTopN(value, legacyCount); setTopN(next); setTopNInput(String(next)); };
  return <div className="chart-plain">
    {!isProjection && <div className="chart-toolbar chart-toolbar--bar">
      <div className="chart-toolbar__control"><label htmlFor="bar-top-n">展示数量</label>
        <input id="bar-top-n" type="range" min="1" max={Math.max(1, legacyCount)} value={topN} onChange={event => updateTopN(event.target.value)} />
        <input className="chart-number-input" type="number" aria-label="展示数量" min="1" max={Math.max(1, legacyCount)} value={topNInput}
          onChange={event => setTopNInput(event.target.value)} onBlur={() => updateTopN(topNInput)}
          onKeyDown={event => { if (event.key === 'Enter') updateTopN(topNInput); }} /></div>
      <p className="chart-toolbar__summary">前 {topN} 个{featureLabel} · 全量 {legacyCount}</p>
    </div>}
    <ZoomableGroupedBarChart model={model}
      barStyleConfig={{ key: featureLabel === 'KO' ? 'function-abundance' : 'species-abundance', defaultTransposed: true, ...(relative ? { suffix: '%' } : {}) }}
      exportConfig={{ title: '导出图像', fileName: `${featureLabel}-abundance-comparison`, format: 'svg' }} />
  </div>;
}
