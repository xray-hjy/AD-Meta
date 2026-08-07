import { useMemo, useState } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';

const FALLBACK_SERIES = [
  { key: 'AD', label: 'AD', color: '#e74c3c' },
  { key: 'NC', label: 'NC', color: '#2ecc71' },
];

function normalizeOutlierPoints(points, values) {
  if (Array.isArray(points)) {
    return points.map(point => ({ sample: point?.sample ? String(point.sample) : null, value: Number(point?.value ?? 0) }));
  }
  return Array.isArray(values) ? values.map(value => ({ sample: null, value: Number(value) })) : [];
}

function normalizeBoxplot(data) {
  if (Array.isArray(data?.series) && data.items?.some(item => item.values)) {
    return { series: data.series, items: data.items };
  }
  const items = Array.isArray(data?.items) ? data.items.map(item => ({
    fullName: item.fullName,
    shortName: item.shortName,
    total: item.total,
    values: {
      AD: {
        raw: { box: item.adBox, outliers: item.adOutliers || [], outlierPoints: normalizeOutlierPoints(item.adOutlierPoints, item.adOutliers) },
        log: { box: item.adLogBox || item.adBox, outliers: item.adLogOutliers || [], outlierPoints: normalizeOutlierPoints(item.adLogOutlierPoints, item.adLogOutliers) },
      },
      NC: {
        raw: { box: item.ncBox, outliers: item.ncOutliers || [], outlierPoints: normalizeOutlierPoints(item.ncOutlierPoints, item.ncOutliers) },
        log: { box: item.ncLogBox || item.ncBox, outliers: item.ncLogOutliers || [], outlierPoints: normalizeOutlierPoints(item.ncLogOutlierPoints, item.ncLogOutliers) },
      },
    },
  })) : [];
  return { series: FALLBACK_SERIES, items };
}

function fmtNum(value, isLogScale) {
  const number = Number(value) || 0;
  if (isLogScale) return number.toFixed(4);
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

function BoxPlot({ data, featureLabel = '物种' }) {
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [touched, setTouched] = useState(false);
  const [scaleMode, setScaleMode] = useState('log');
  const normalized = useMemo(() => normalizeBoxplot(data), [data]);
  const available = normalized.items;
  const active = useMemo(() => {
    if (selectedFeatures.length) return available.filter(item => selectedFeatures.includes(item.fullName));
    return touched ? [] : available.slice(0, 5);
  }, [available, selectedFeatures, touched]);
  const isLogScale = scaleMode === 'log';

  const option = useMemo(() => {
    if (!active.length || !normalized.series.length) return null;
    const categories = active.map(item => item.shortName);
    const boxSeries = [];
    const scatterSeries = [];
    normalized.series.forEach((seriesItem, seriesIndex) => {
      const color = seriesItem.color || FALLBACK_SERIES[seriesIndex % FALLBACK_SERIES.length].color;
      const boxes = active.map(item => item.values?.[seriesItem.key]?.[scaleMode]?.box || [0, 0, 0, 0, 0]);
      const outliers = [];
      active.forEach(item => {
        const points = item.values?.[seriesItem.key]?.[scaleMode]?.outlierPoints || [];
        points.forEach(point => outliers.push({
          value: [item.shortName, point.value],
          sample: point.sample,
          feature: item.shortName,
          group: seriesItem.label,
        }));
      });
      const boxItemStyle = { color: colorWithAlpha(color), borderColor: color, borderWidth: 2 };
      boxSeries.push({
        name: seriesItem.label,
        type: 'boxplot',
        data: boxes,
        itemStyle: boxItemStyle,
        emphasis: { itemStyle: boxItemStyle },
        boxWidth: [14, 22],
      });
      scatterSeries.push({
        name: `${seriesItem.label} 离群点`,
        type: 'scatter',
        data: outliers,
        symbolSize: 7,
        itemStyle: { color, borderColor: color, borderWidth: 1 },
      });
    });
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(30,41,59,0.92)',
        borderColor: 'transparent',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        formatter(params) {
          if (params.seriesType === 'scatter') {
            return `<b>${params.data.group} - ${params.data.feature}</b><br/>样本编号: ${params.data.sample || '未知'}<br/>离群点: ${fmtNum(params.data.value[1], isLogScale)}`;
          }
          const box = params.data;
          return `<b>${params.seriesName} - ${params.name}</b><br/>上限：${fmtNum(box[4], isLogScale)}<br/>Q3：${fmtNum(box[3], isLogScale)}<br/><b>中位数：${fmtNum(box[2], isLogScale)}</b><br/>Q1：${fmtNum(box[1], isLogScale)}<br/>下限：${fmtNum(box[0], isLogScale)}`;
        },
      },
      legend: { data: normalized.series.map(item => item.label), top: 0, textStyle: { color: '#475569' } },
      grid: { left: 70, right: 30, top: 42, bottom: 60 },
      xAxis: { type: 'category', data: categories, axisLabel: { rotate: 35, fontSize: 10, color: '#64748b', interval: 0 } },
      yAxis: {
        type: 'value',
        name: isLogScale ? 'log10(丰度 + 1)' : '丰度',
        axisLabel: { color: '#475569', formatter: value => fmtNum(value, isLogScale) },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [...boxSeries, ...scatterSeries],
    };
  }, [active, isLogScale, normalized.series, scaleMode]);

  const toggle = fullName => {
    setTouched(true);
    setSelectedFeatures(current => current.includes(fullName)
      ? current.filter(item => item !== fullName)
      : [...current, fullName]);
  };

  return (
    <div className="chart-plain">
      <div className="chart-control-strip">
        <span>默认 log10(丰度 + 1)</span>
        <span>显示离群点</span>
        <span>已选 {active.length} 个{featureLabel}</span>
        <button type="button" className={`chart-chip ${scaleMode === 'log' ? 'chart-chip--active' : ''}`} onClick={() => setScaleMode('log')}>log10(丰度 + 1)</button>
        <button type="button" className={`chart-chip ${scaleMode === 'raw' ? 'chart-chip--active' : ''}`} onClick={() => setScaleMode('raw')}>原始丰度</button>
      </div>
      <div className="chart-chip-list">
        {available.map(item => (
          <button key={item.fullName} type="button" className={`chart-chip ${active.some(activeItem => activeItem.fullName === item.fullName) ? 'chart-chip--active' : ''}`} onClick={() => toggle(item.fullName)}>
            {item.shortName}
          </button>
        ))}
      </div>
      {option ? (
        <ChartViewport variant="data" minHeight={480} preferredHeight={Math.max(480, active.length * 48 + 120)}>
          <ReactECharts option={option} opts={{ renderer: 'svg' }} style={{ width: '100%', height: '100%' }} />
        </ChartViewport>
      ) : <div className="placeholder"><p>请选择至少一个{featureLabel}</p></div>}
    </div>
  );
}

export default BoxPlot;
