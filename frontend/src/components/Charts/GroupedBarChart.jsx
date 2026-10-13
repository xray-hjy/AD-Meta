import { useMemo } from 'react';
import CartesianEChart from './CartesianEChart';
import { escapeTooltipText } from '../../utils/tooltipHtml';

const COLORS = ['#e74c3c', '#2ecc71', '#2563eb', '#f59e0b'];

export function buildGroupedBarOption({ items, series, barWidth = 22, rowGap = 6,
  formatValue = value => String(value), axisName = '', axisMin = 0, axisMax, formatAxis = formatValue,
  formatTooltipValue = formatValue, barGap = '0%', categoryGap, cornerRadius = 6,
  abbreviateLabel = label => label, tooltipAppearance = 'dark', pointer = 'shadow',
  showValues = true, onSelect = null, pointOptions, tooltipFormatter, zeroLine = false, grid = {} }) {
  const light = tooltipAppearance === 'light';
  const chartItems = items.map(item => ({ ...item, label: item.label || item.feature || item.id }));
  return {
    backgroundColor: 'transparent',
    animationDuration: 500,
    animationDurationUpdate: 320,
    tooltip: {
      trigger: 'axis', confine: true,
      axisPointer: pointer === 'line'
        ? { type: 'line', lineStyle: { color: '#94a3b8', type: 'dashed', width: 1 } }
        : { type: 'shadow', shadowStyle: { color: 'rgba(148, 163, 184, 0.08)' } },
      backgroundColor: light ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.96)',
      borderColor: light ? '#d1d5db' : 'transparent',
      textStyle: { color: light ? '#64748b' : '#f8fafc', fontSize: 12, lineHeight: 18 },
      extraCssText: light ? 'border-radius:6px; padding:10px; box-shadow:0 3px 12px rgba(15,23,42,.15);' : 'border-radius:10px; padding:12px 14px;',
      formatter(params) {
        if (tooltipFormatter) return tooltipFormatter(params);
        const item = chartItems[params?.[0]?.dataIndex ?? 0];
        if (!item) return '';
        return [escapeTooltipText(item.fullName || item.label),
          ...params.map(entry => `${entry.marker}${escapeTooltipText(entry.seriesName)}: <b>${escapeTooltipText(formatTooltipValue(entry.value))}</b>`)].join('<br/>');
      },
    },
    legend: { data: series.map(item => item.label), top: 8, right: 24, itemGap: 18, itemWidth: 14, itemHeight: 14,
      textStyle: { color: '#475569', fontSize: 12 } },
    grid: { top: 52, left: 116, right: 92, bottom: 42, ...grid },
    xAxis: [{ type: 'value', min: axisMin, ...(axisMax == null ? {} : { max: axisMax }), name: axisName,
      nameLocation: 'middle', nameGap: 30, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 11, formatter: formatAxis },
      splitLine: { lineStyle: { color: '#e7edf5', type: 'dashed' } } }],
    yAxis: [{ type: 'category', inverse: true, data: chartItems.map(item => abbreviateLabel(item.label)),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: '#475569', fontSize: 12, fontWeight: 500, margin: 12 } }],
    series: series.map((group, index) => {
      const color = group.color || COLORS[index % COLORS.length];
      return { name: group.label, type: 'bar', barWidth, barGap, barCategoryGap: categoryGap || `${rowGap}px`,
        cursor: onSelect ? 'pointer' : 'default',
        itemStyle: { color, borderRadius: [0, cornerRadius, cornerRadius, 0] },
        label: { show: showValues, position: 'right', color: '#64748b', fontSize: 10, fontWeight: 700,
          formatter: params => formatValue(params.value) },
        emphasis: { focus: 'series', itemStyle: { color, shadowBlur: 10, shadowColor: `${color}66` } },
        ...(zeroLine && index === 0 ? { markLine: { silent: true, symbol: 'none', label: { show: false },
          lineStyle: { color: '#94a3b8', width: 1 }, data: [{ xAxis: 0 }] } } : {}),
        data: chartItems.map(item => item.values[group.key] == null ? null
          : pointOptions ? { value: item.values[group.key], ...pointOptions(item, group) } : item.values[group.key]),
      };
    }),
  };
}

export default function GroupedBarChart({ model, onSelect, ...chartProps }) {
  const option = useMemo(() => buildGroupedBarOption({ ...model, onSelect }), [model, onSelect]);
  const events = useMemo(() => onSelect ? { click: event => {
    const item = model.items[event.dataIndex];
    if (item) onSelect(item.id || item.feature);
  } } : undefined, [model.items, onSelect]);
  return <CartesianEChart option={option} onEvents={events} {...chartProps} />;
}
