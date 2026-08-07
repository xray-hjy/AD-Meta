import { useMemo } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';

const FALLBACK_COLORS = ['#e74c3c', '#2ecc71', '#2563eb', '#f59e0b'];
const BAR_HEIGHT = 16;
const ROW_HEIGHT = 46;
const EMPTY_LIST = Object.freeze([]);

function formatPercent(value, digits = 2) {
  return `${((Number(value) || 0) * 100).toFixed(digits)}%`;
}

function shortLabel(value) {
  const label = String(value || 'Unknown');
  return label.length > 20 ? `${label.slice(0, 19)}...` : label;
}

export default function KoContributionChart({ data }) {
  const series = Array.isArray(data?.series) ? data.series : EMPTY_LIST;
  const items = Array.isArray(data?.items) ? data.items : EMPTY_LIST;
  const coverage = data?.coverageBySeries || {};

  const option = useMemo(() => {
    if (!series.length || !items.length) return null;
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
          const item = items[params?.[0]?.dataIndex ?? 0];
          if (!item) return '';
          return [
            `<b>${item.feature}</b>`,
            ...params.map(entry => `${entry.marker}${entry.seriesName}: ${formatPercent(entry.value, 3)}`),
          ].join('<br/>');
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
      grid: { top: 50, left: 104, right: 100, bottom: 44 },
      xAxis: {
        type: 'value',
        min: 0,
        name: '样本内相对贡献（组均值）',
        nameLocation: 'middle',
        nameGap: 32,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#475569',
          fontSize: 11,
          formatter: value => formatPercent(value, value < 0.01 ? 2 : 1),
        },
        splitLine: { lineStyle: { color: '#e7edf5', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: items.map(item => shortLabel(item.feature)),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: '#475569', fontSize: 12, fontWeight: 600, margin: 12 },
      },
      series: series.map((seriesItem, index) => {
        const color = seriesItem.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
        return {
          name: seriesItem.label,
          type: 'bar',
          barWidth: BAR_HEIGHT,
          barGap: '12%',
          barCategoryGap: '28%',
          itemStyle: { color, borderRadius: [0, 5, 5, 0] },
          label: {
            show: true,
            position: 'right',
            color: '#64748b',
            fontSize: 10,
            fontWeight: 700,
            formatter: params => formatPercent(params.value, 2),
          },
          emphasis: {
            focus: 'series',
            itemStyle: { color, shadowBlur: 9, shadowColor: `${color}55` },
          },
          data: items.map(item => Number(item.values?.[seriesItem.key]) || 0),
        };
      }),
    };
  }, [items, series]);

  if (!option) {
    return <div className="placeholder"><p>暂无 KO 相对贡献数据</p></div>;
  }

  const chartHeight = Math.max(480, items.length * ROW_HEIGHT + 96);
  return (
    <div className="chart-plain">
      <div className="chart-stat-strip chart-stat-strip--compact">
        <span className="chart-stat-item">
          <b>当前展示</b>
          <span className="chart-stat-value">{items.length}/{data.sourceFeatureCount || items.length}</span>
          <span>个 KO</span>
        </span>
        <span className="chart-stat-item">
          <b>未展示</b>
          <span className="chart-stat-value">{data.omittedFeatureCount || 0}</span>
          <span>个，未合并为 Other</span>
        </span>
        {series.map(item => (
          <span className="chart-stat-item" key={item.key}>
            <b style={{ color: item.color }}>{item.label} 覆盖</b>
            <span className="chart-stat-value">{formatPercent(coverage[item.key], 2)}</span>
          </span>
        ))}
      </div>
      <ChartViewport variant="data" minHeight={480} preferredHeight={chartHeight}>
        <ReactECharts
          option={option}
          opts={{ renderer: 'svg' }}
          notMerge
          lazyUpdate
          style={{ width: '100%', height: '100%' }}
        />
      </ChartViewport>
    </div>
  );
}
