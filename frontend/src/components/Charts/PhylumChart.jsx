import { useMemo } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';

const FALLBACK_COLORS = ['#e74c3c', '#2ecc71', '#2563eb', '#f59e0b'];
const BAR_HEIGHT = 22;
const ROW_GAP = 6;

function formatPercent(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function abbreviateLabel(label) {
  const text = String(label || 'Unknown');
  return text.length > 18 ? `${text.slice(0, 17)}...` : text;
}

function normalizeComposition(data) {
  if (Array.isArray(data)) {
    return {
      series: [
        { key: 'AD', label: 'AD 组', color: '#e74c3c' },
        { key: 'NC', label: 'NC 组', color: '#2ecc71' },
      ],
      items: data.map(item => ({
        feature: item.phylum || item.feature || 'Unknown',
        values: { AD: Number(item.adRatio) || 0, NC: Number(item.ncRatio) || 0 },
      })),
    };
  }
  return {
    series: Array.isArray(data?.series) ? data.series : [],
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

function topItem(items, seriesKey) {
  return items.reduce((best, item) => {
    if (!best) return item;
    return Number(item.values?.[seriesKey] || 0) > Number(best.values?.[seriesKey] || 0) ? item : best;
  }, null);
}

function summaryLabel(seriesItem) {
  return String(seriesItem.label || seriesItem.key || '').replace(/\s*组$/, '');
}

function buildDifferenceSummary(items, series) {
  if (series.length !== 2) return null;
  const [left, right] = series;
  const difference = items.reduce((best, item) => {
    const leftValue = Number(item.values?.[left.key]) || 0;
    const rightValue = Number(item.values?.[right.key]) || 0;
    const absolute = Math.abs(leftValue - rightValue);
    return !best || absolute > best.absolute
      ? { item, leftValue, rightValue, absolute }
      : best;
  }, null);
  if (!difference) return null;
  const leader = difference.leftValue >= difference.rightValue ? left : right;
  return {
    feature: difference.item.feature || 'NA',
    direction: `${summaryLabel(leader)} 高`,
    difference: `${(difference.absolute * 100).toFixed(1)} pp`,
  };
}

function PhylumChart({ data, featureKind = 'taxonomy' }) {
  const normalized = useMemo(() => normalizeComposition(data), [data]);
  const { series, items } = normalized;
  const isKo = featureKind === 'ko';

  const option = useMemo(() => {
    if (!items.length || !series.length) return null;
    const chartItems = items.map(item => ({
      label: item.feature || 'Unknown',
      shortLabel: abbreviateLabel(item.feature),
      values: item.values || {},
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148, 163, 184, 0.08)' } },
        backgroundColor: 'rgba(15,23,42,0.96)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12, lineHeight: 18 },
        extraCssText: 'border-radius:10px; padding:12px 14px;',
        formatter(params) {
          const item = chartItems[params?.[0]?.dataIndex ?? 0];
          if (!item) return '';
          return [`<b>${item.label}</b>`, ...params.map(entry => `${entry.marker}${entry.seriesName}: ${formatPercent(entry.value)}`)].join('<br/>');
        },
      },
      legend: {
        data: series.map(item => item.label),
        top: 8,
        right: 24,
        itemGap: 18,
        itemWidth: 14,
        itemHeight: 14,
        textStyle: { color: '#475569', fontSize: 12 },
      },
      grid: { top: 52, left: 116, right: 92, bottom: 42 },
      xAxis: [{
        type: 'value',
        min: 0,
        max: 1,
        name: '相对丰度占比',
        nameLocation: 'middle',
        nameGap: 30,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#475569', fontSize: 11, formatter: value => `${Math.round(Number(value) * 100)}%` },
        splitLine: { lineStyle: { color: '#e7edf5', type: 'dashed' } },
      }],
      yAxis: [{
        type: 'category',
        inverse: true,
        data: chartItems.map(item => item.shortLabel),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: '#475569', fontSize: 12, fontWeight: 500, margin: 12 },
      }],
      series: series.map((seriesItem, index) => {
        const color = seriesItem.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
        return {
          name: seriesItem.label,
          type: 'bar',
          barWidth: BAR_HEIGHT,
          barGap: '0%',
          barCategoryGap: `${ROW_GAP}px`,
          itemStyle: {
            color,
            borderRadius: [0, 6, 6, 0],
          },
          label: {
            show: true,
            position: 'right',
            color: '#64748b',
            fontSize: 10,
            fontWeight: 700,
            formatter: params => formatPercent(params.value),
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              color,
              shadowBlur: 10,
              shadowColor: `${color}66`,
            },
          },
          data: chartItems.map(item => Number(item.values[seriesItem.key]) || 0),
        };
      }),
    };
  }, [items, series]);

  if (!option) {
    return <div className="placeholder"><p>{isKo ? '暂无 KO 功能组成数据' : '暂无门级组成数据'}</p></div>;
  }

  const summaryItems = series.map(seriesItem => {
    const top = topItem(items, seriesItem.key);
    return {
      key: seriesItem.key,
      label: summaryLabel(seriesItem),
      value: top?.feature || 'NA',
      ratio: formatPercent(top?.values?.[seriesItem.key]),
      color: seriesItem.color,
    };
  });
  const differenceSummary = buildDifferenceSummary(items, series);
  const chartHeight = Math.max(360, items.length * (BAR_HEIGHT * series.length + ROW_GAP) + 96);

  return (
    <div className="chart-plain">
      <div className="chart-stat-strip chart-stat-strip--compact">
        <span className="chart-stat-item">
          <b>展示项</b>
          <span className="chart-stat-value">{items.length} 项</span>
          <span>{isKo ? 'Top KO 功能' : 'Top 门级组成'}</span>
        </span>
        {summaryItems.map(item => (
          <span className="chart-stat-item" key={item.key}>
            <b style={{ color: item.color }}>{item.label} 最高</b>
            <span className="chart-stat-value" title={item.value}>{item.value}</span>
            <span>{item.ratio}</span>
          </span>
        ))}
        {differenceSummary ? (
          <span className="chart-stat-item">
            <b>最大组间差异</b>
            <span className="chart-stat-value" title={differenceSummary.feature}>{differenceSummary.feature}</span>
            <span>{differenceSummary.direction} {differenceSummary.difference}</span>
          </span>
        ) : null}
      </div>
      <ChartViewport variant="data" minHeight={480} preferredHeight={chartHeight}>
        <ReactECharts option={option} opts={{ renderer: 'svg' }} notMerge lazyUpdate style={{ width: '100%', height: '100%' }} />
      </ChartViewport>
    </div>
  );
}

export default PhylumChart;
