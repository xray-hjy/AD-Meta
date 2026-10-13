import { useMemo } from 'react';
import CartesianEChart from './CartesianEChart';
import { escapeTooltipText } from '../../utils/tooltipHtml';

const FALLBACK_SERIES = [{ color: '#e74c3c' }, { color: '#2ecc71' }];

function fmtNum(value, transformKey) {
  const number = Number(value) || 0;
  if (transformKey === 'log') return number.toFixed(4);
  if (number >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(2)}K`;
  return number.toFixed(2);
}

function colorWithAlpha(color, alpha = 0.24) {
  const match = String(color || '').match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function sampleOffset(sample, fallbackIndex) {
  const key = String(sample ?? fallbackIndex);
  const hash = [...key].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 17, 0);
  return [(hash - 8) * 2, 0];
}

export function buildBoxScatterOption({ available, series, activeTransform, visibleCount,
  layout = 'features', scatterMode = 'outliers', boxWidth = [12, 22],
  tooltipAppearance = 'dark', formatValue, groupCounts = {} }) {
    if (!available.length || !series.length) return null;
    const grouped = layout === 'groups';
    const format = formatValue || (value => fmtNum(value, activeTransform.key));
    const light = tooltipAppearance === 'light';
    const categories = grouped ? series.map(group => group.key) : available.map(item => String(item.featureId || item.fullName));
    const itemByFeatureId = new Map(categories.map((featureId, index) => [featureId, available[index]]));
    const boxSeries = [];
    const scatterSeries = [];
    series.forEach((seriesItem, seriesIndex) => {
      const color = seriesItem.color || FALLBACK_SERIES[seriesIndex % FALLBACK_SERIES.length].color;
      const boxes = available.map(item => (
        item.values?.[seriesItem.key]?.[activeTransform.key]?.box || [0, 0, 0, 0, 0]
      ));
      const outliers = [];
      available.forEach(item => {
        const points = item.values?.[seriesItem.key]?.[activeTransform.key]?.[scatterMode === 'all' ? 'samplePoints' : 'outlierPoints'] || [];
        points.forEach((point, index) => outliers.push({
          value: [grouped ? seriesItem.key : String(item.featureId || item.fullName), point.value],
          sample: point.sample,
          feature: item.shortName,
          group: seriesItem.label,
          ...(scatterMode === 'all' ? { symbolOffset: sampleOffset(point.sample, index) } : {}),
        }));
      });
      const boxItemStyle = {
        color: colorWithAlpha(color),
        borderColor: color,
        borderWidth: 2,
      };
      if (!grouped) boxSeries.push({
        name: seriesItem.label,
        type: 'boxplot',
        data: boxes,
        itemStyle: boxItemStyle,
        emphasis: { itemStyle: boxItemStyle },
        boxWidth,
      });
      scatterSeries.push({
        name: `${seriesItem.label} ${scatterMode === 'all' ? '样本' : '离群点'}`,
        type: 'scatter',
        data: outliers,
        symbolSize: scatterMode === 'all' ? 6 : 7,
        itemStyle: { color, borderColor: '#404040', borderWidth: scatterMode === 'all' ? 0 : 1.2, opacity: scatterMode === 'all' ? 0.7 : 1 },
      });
    });
    if (grouped) boxSeries.push({
      name: '箱线：1.5×IQR 须', type: 'boxplot', boxWidth,
      data: series.map((group, index) => {
        const color = group.color || FALLBACK_SERIES[index % FALLBACK_SERIES.length].color;
        return { value: available[0].values?.[group.key]?.[activeTransform.key]?.box || ['-', '-', '-', '-', '-'],
          itemStyle: { color: colorWithAlpha(color), borderColor: color, borderWidth: 1 } };
      }),
    });
    return {
      animationDurationUpdate: 320,
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: light ? 'rgba(255,255,255,0.96)' : 'rgba(30,41,59,0.92)',
        borderColor: light ? '#d1d5db' : 'transparent',
        textStyle: { color: light ? '#64748b' : '#f1f5f9', fontSize: 12 },
        extraCssText: 'border-radius:6px; padding:10px;',
        formatter(params) {
          if (params.seriesType === 'scatter') {
            return `<b>${escapeTooltipText(params.data.group)} - ${escapeTooltipText(params.data.feature)}</b><br/>样本编号: ${escapeTooltipText(params.data.sample || '未知')}<br/>${scatterMode === 'all' ? '丰度' : '离群点'}: ${escapeTooltipText(format(params.data.value[1]))}`;
          }
          const box = Array.isArray(params.data) ? params.data : params.data.value;
          const item = grouped ? available[0] : available[params.dataIndex];
          const group = grouped ? series[params.dataIndex]?.label : params.seriesName;
          const detectionNote = item?.detectedInScope === false ? '<br/><b>当前范围未检出</b>' : '';
          return `<b>${escapeTooltipText(group)} - ${escapeTooltipText(item?.shortName || params.name)}</b><br/>上须: ${format(box[4])}<br/>Q3: ${format(box[3])}<br/><b>中位数: ${format(box[2])}</b><br/>Q1: ${format(box[1])}<br/>下须: ${format(box[0])}${detectionNote}`;
        },
      },
      legend: {
        show: !grouped,
        data: series.map(item => item.label),
        top: 0,
        right: 18,
        textStyle: { color: '#475569' },
      },
      grid: { left: 70, right: 30, top: 42, bottom: grouped ? 48 : 100 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          rotate: grouped ? 0 : 35,
          fontSize: grouped ? 12 : 10,
          color(value) {
            return itemByFeatureId.get(String(value))?.detectedInScope === false ? '#94a3b8' : '#64748b';
          },
          interval: 0,
          formatter(value) {
            if (grouped) return `${series.find(group => group.key === value)?.label || value} (n=${groupCounts[value] || 0})`;
            const item = itemByFeatureId.get(String(value));
            if (!item) return value;
            return item.detectedInScope === false ? `${item.shortName}（未检出）` : item.shortName;
          },
        },
      },
      yAxis: {
        type: 'value',
        name: activeTransform.label,
        axisLabel: {
          color: '#475569',
          formatter: value => formatValue ? formatValue(value) : fmtNum(value, activeTransform.key),
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      dataZoom: grouped ? [] : [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
          startValue: 0,
          endValue: Math.max(0, visibleCount - 1),
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          filterMode: 'none',
          startValue: 0,
          endValue: Math.max(0, visibleCount - 1),
          bottom: 18,
          height: 18,
          brushSelect: false,
          showDetail: false,
          borderColor: '#d7e0ec',
          fillerColor: 'rgba(37, 99, 235, 0.12)',
          handleStyle: { color: '#2563eb', borderColor: '#2563eb' },
        },
      ],
      series: [...boxSeries, ...scatterSeries],
    };
}

export default function BoxScatterChart({ model, boxStyleConfig, ...chartProps }) {
  const option = useMemo(() => buildBoxScatterOption(model), [model]);
  const styleConfig = useMemo(() => boxStyleConfig ? { ...boxStyleConfig,
    formatValue: model.formatValue || (value => fmtNum(value, model.activeTransform.key)) } : null, [boxStyleConfig, model]);
  return <CartesianEChart option={option} boxStyleConfig={styleConfig} {...chartProps} />;
}
