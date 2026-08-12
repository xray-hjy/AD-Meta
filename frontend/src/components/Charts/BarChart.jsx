import { useEffect, useMemo, useState } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';
import DataTableViewport from '../data-display/DataTableViewport';

const COLORS = { AD: '#e74c3c', NC: '#2ecc71' };
const DEFAULT_TOP_N = 20;

function formatTaxonomy(fullName) {
  if (!fullName) return '';
  return String(fullName)
    .split('|')
    .map(part => part.replace(/^([a-z])__/, (_, level) => `${level}: `))
    .join('<br/>');
}

function abbreviateFeatureName(label) {
  if (!label) return 'Unknown';
  const normalized = String(label).replace(/\s+/g, '_');
  const parts = normalized.split('_').filter(Boolean);
  if (parts.length >= 2) {
    const species = parts.slice(1).join('_');
    return `${parts[0].charAt(0)}. ${species.length > 12 ? `${species.slice(0, 11)}...` : species}`;
  }
  return normalized.length > 14 ? `${normalized.slice(0, 13)}...` : normalized;
}

function compactNumber(value) {
  const num = Number(value) || 0;
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(0);
}

function preciseNumber(value) {
  const number = Number(value) || 0;
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
}

function clampTopN(value, max) {
  if (!Number.isFinite(value) || max <= 0) return 1;
  return Math.max(1, Math.min(max, Math.round(value)));
}

function axisLabelInterval(count) {
  if (count <= 24) return 0;
  if (count <= 60) return 1;
  if (count <= 120) return 3;
  if (count <= 240) return 7;
  return 15;
}

function normalizeProjection(data) {
  if (!Array.isArray(data?.items) || !Array.isArray(data?.series)) return null;
  return {
    items: data.items.map(item => ({
      feature: item.feature,
      fullName: item.fullName,
      shortLabel: abbreviateFeatureName(item.feature),
      values: item.values || {},
    })),
    series: data.series.map(series => ({
      ...series,
      color: series.color || COLORS[series.group] || '#2563eb',
    })),
  };
}

function normalizeLegacy(data, topN) {
  if (!Array.isArray(data)) return null;
  return {
    items: data.slice(0, topN).map(item => ({
      feature: item.species || item.feature,
      fullName: item.fullName,
      shortLabel: abbreviateFeatureName(item.species || item.feature),
      values: {
        AD: { mean: Math.max(0, item.adMean || 0) },
        NC: { mean: Math.max(0, item.ncMean || 0) },
      },
    })),
    series: [
      { key: 'AD', label: 'AD 均值', color: COLORS.AD },
      { key: 'NC', label: 'NC 均值', color: COLORS.NC },
    ],
  };
}

function ProjectionDataTable({ normalized, featureLabel }) {
  return (
    <details className="chart-data-table">
      <summary>查看当前展示数据</summary>
      <DataTableViewport ariaLabel="当前展示数据，可滚动">
          <thead>
            <tr>
              <th>{featureLabel}</th>
              {normalized.series.map(series => <th key={series.key}>{series.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {normalized.items.map(item => (
              <tr key={item.feature}>
                <td title={item.fullName || item.feature}>{item.feature}</td>
                {normalized.series.map(series => (
                  <td key={series.key}>{preciseNumber(item.values[series.key]?.mean)}</td>
                ))}
              </tr>
            ))}
          </tbody>
      </DataTableViewport>
    </details>
  );
}

export default function BarChart({ data, featureLabel = '物种' }) {
  const isProjection = Boolean(data?.projection && Array.isArray(data?.items));
  const legacyCount = Array.isArray(data) ? data.length : 0;
  const [topN, setTopN] = useState(DEFAULT_TOP_N);
  const [topNInput, setTopNInput] = useState(String(DEFAULT_TOP_N));

  useEffect(() => {
    if (isProjection || legacyCount <= 0) return;
    const next = clampTopN(Math.min(DEFAULT_TOP_N, legacyCount), legacyCount);
    setTopN(next);
    setTopNInput(String(next));
  }, [isProjection, legacyCount]);

  const normalized = useMemo(
    () => isProjection ? normalizeProjection(data) : normalizeLegacy(data, topN),
    [data, isProjection, topN]
  );

  const option = useMemo(() => {
    if (!normalized?.items.length || !normalized.series.length) return null;
    const count = normalized.items.length;
    const start = count > 10 ? Math.max(0, 100 - (10 / count) * 100) : 0;
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: { color: 'rgba(148, 163, 184, 0.08)' },
          label: { show: true, backgroundColor: '#475569' },
        },
        backgroundColor: 'rgba(15,23,42,0.96)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12, lineHeight: 18 },
        extraCssText: 'border-radius:8px; padding:12px 14px;',
        formatter(params) {
          const item = normalized.items[params?.[0]?.dataIndex ?? 0];
          if (!item) return '';
          const lines = [
            `<b>${item.feature}</b>`,
            item.fullName && item.fullName !== item.feature ? formatTaxonomy(item.fullName) : '',
          ].filter(Boolean);
          params.forEach(entry => lines.push(`${entry.marker}${entry.seriesName}: ${compactNumber(entry.value)}`));
          return lines.join('<br/>');
        },
      },
      toolbox: {
        show: true,
        right: 18,
        top: 4,
        itemSize: 16,
        iconStyle: { borderColor: '#94a3b8' },
        emphasis: { iconStyle: { borderColor: '#475569' } },
        feature: {
          dataView: { show: true, readOnly: true },
          magicType: { show: true, type: ['line', 'bar'] },
          restore: { show: true },
          saveAsImage: { show: true },
        },
      },
      legend: {
        data: normalized.series.map(series => series.label),
        top: 8,
        right: 180,
        itemGap: 18,
        itemWidth: 14,
        itemHeight: 14,
        textStyle: { color: '#475569', fontSize: 12 },
      },
      grid: { top: 62, left: 76, right: 92, bottom: 148, containLabel: false },
      xAxis: [{
        type: 'category',
        data: normalized.items.map(item => item.shortLabel),
        axisTick: { alignWithLabel: true, lineStyle: { color: '#cbd5e1' } },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: {
          interval: axisLabelInterval(count),
          rotate: 38,
          color: '#64748b',
          fontSize: 11,
          margin: 18,
        },
      }],
      yAxis: [{
        type: 'value',
        name: isProjection && data.scope?.mode === 'sample' ? '样本丰度' : '平均丰度',
        nameLocation: 'middle',
        nameGap: 58,
        nameTextStyle: { color: '#64748b', fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#475569', fontSize: 11, formatter: compactNumber },
        splitLine: { lineStyle: { color: '#e7edf5', type: 'dashed' } },
      }],
      dataZoom: [
        {
          show: count > 10,
          start,
          end: 100,
          height: 18,
          bottom: 74,
          borderColor: '#dbe3ee',
          fillerColor: 'rgba(37, 99, 235, 0.12)',
          backgroundColor: 'rgba(241, 245, 249, 0.9)',
          handleStyle: { color: '#2563eb' },
          moveHandleStyle: { color: '#2563eb' },
          textStyle: { color: '#475569' },
        },
        { type: 'inside', start, end: 100 },
      ],
      series: normalized.series.map(series => ({
        name: series.label,
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: series.color, borderRadius: [6, 6, 0, 0] },
        emphasis: { itemStyle: { color: series.color } },
        data: normalized.items.map(item => item.values[series.key]?.mean || 0),
      })),
    };
  }, [data, isProjection, normalized]);

  if (!option) return <div className="placeholder"><p>暂无{featureLabel}丰度数据</p></div>;

  const updateLegacyTopN = value => {
    const next = clampTopN(value, legacyCount);
    setTopN(next);
    setTopNInput(String(next));
  };

  return (
    <div className="chart-plain">
      {!isProjection ? (
        <div className="chart-toolbar chart-toolbar--bar">
          <div className="chart-toolbar__control">
            <label htmlFor="bar-top-n">展示数量</label>
            <input
              id="bar-top-n"
              type="range"
              min={1}
              max={Math.max(1, legacyCount)}
              value={topN}
              onChange={event => updateLegacyTopN(Number(event.target.value))}
            />
            <input
              className="chart-number-input"
              type="number"
              aria-label="展示数量"
              min={1}
              max={Math.max(1, legacyCount)}
              value={topNInput}
              onChange={event => {
                setTopNInput(event.target.value);
                if (event.target.value) setTopN(clampTopN(Number(event.target.value), legacyCount));
              }}
              onBlur={() => updateLegacyTopN(Number(topNInput) || topN)}
            />
          </div>
          <p className="chart-toolbar__summary">前 {topN} 个{featureLabel} · 全量 {legacyCount}</p>
        </div>
      ) : null}

      <ChartViewport
        variant="data"
        minHeight={520}
        preferredHeight={Math.min(700, 500 + normalized.items.length * 7)}
        maxHeight={700}
      >
        <ReactECharts
          option={option}
          opts={{ renderer: 'svg' }}
          notMerge
          lazyUpdate
          style={{ width: '100%', height: '100%' }}
        />
      </ChartViewport>
      {isProjection ? (
        <div className="chart-plain__supplement">
          <ProjectionDataTable normalized={normalized} featureLabel={featureLabel} />
        </div>
      ) : null}
    </div>
  );
}
