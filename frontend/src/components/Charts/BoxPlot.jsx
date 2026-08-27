import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';

const FALLBACK_SERIES = [
  { key: 'AD', label: 'AD', color: '#e74c3c' },
  { key: 'NC', label: 'NC', color: '#2ecc71' },
];

const DEFAULT_TRANSFORMS = [
  { key: 'raw', label: '输入丰度', formula: 'x' },
  { key: 'sqrt', label: 'sqrt(丰度)', formula: 'sqrt(max(x, 0))' },
  { key: 'log', label: 'log10(丰度 + 1)', formula: 'log10(max(x, 0) + 1)' },
];

function normalizeOutlierPoints(points, values) {
  if (Array.isArray(points)) {
    return points.map(point => ({
      sample: point?.sample ? String(point.sample) : null,
      value: Number(point?.value ?? 0),
    }));
  }
  return Array.isArray(values)
    ? values.map(value => ({ sample: null, value: Number(value) }))
    : [];
}

function summary(box, outliers, outlierPoints) {
  return {
    box: Array.isArray(box) ? box : [0, 0, 0, 0, 0],
    outliers: Array.isArray(outliers) ? outliers : [],
    outlierPoints: normalizeOutlierPoints(outlierPoints, outliers),
  };
}

function normalizeBoxplot(data) {
  if (Array.isArray(data?.series) && data.items?.some(item => item.values)) {
    return {
      series: data.series,
      items: data.items,
      transforms: Array.isArray(data.valueTransforms) && data.valueTransforms.length
        ? data.valueTransforms
        : DEFAULT_TRANSFORMS,
      defaultTransform: data.defaultValueTransform || 'log',
      transformNote: data.valueTransformNote || '',
    };
  }
  const items = Array.isArray(data?.items) ? data.items.map(item => ({
    featureId: item.featureId || item.fullName,
    fullName: item.fullName,
    shortName: item.shortName,
    total: item.total,
    detectedInScope: item.detectedInScope !== false,
    values: {
      AD: {
        raw: summary(item.adBox, item.adOutliers, item.adOutlierPoints),
        sqrt: summary(item.adSqrtBox || item.adBox, item.adSqrtOutliers, item.adSqrtOutlierPoints),
        log: summary(item.adLogBox || item.adBox, item.adLogOutliers, item.adLogOutlierPoints),
      },
      NC: {
        raw: summary(item.ncBox, item.ncOutliers, item.ncOutlierPoints),
        sqrt: summary(item.ncSqrtBox || item.ncBox, item.ncSqrtOutliers, item.ncSqrtOutlierPoints),
        log: summary(item.ncLogBox || item.ncBox, item.ncLogOutliers, item.ncLogOutlierPoints),
      },
    },
  })) : [];
  return {
    series: FALLBACK_SERIES,
    items,
    transforms: DEFAULT_TRANSFORMS,
    defaultTransform: 'log',
    transformNote: '数值变换仅用于箱线图展示，不改变物种选择。',
  };
}

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

function visibleItemCount(width, total) {
  if (!total) return 0;
  const estimated = Math.floor((Math.max(width, 720) - 110) / 112);
  return Math.min(total, Math.max(8, Math.min(15, estimated)));
}

function BoxPlot({ data, featureLabel = '物种', featureSelectionConfig = {} }) {
  const hostRef = useRef(null);
  const normalized = useMemo(() => normalizeBoxplot(data), [data]);
  const available = normalized.items;
  const [transformKey, setTransformKey] = useState(normalized.defaultTransform);
  const [visibleCount, setVisibleCount] = useState(() => visibleItemCount(1200, available.length));
  const warningThreshold = Number(featureSelectionConfig?.warningThreshold) || 30;
  const strongWarningThreshold = Number(featureSelectionConfig?.strongWarningThreshold) || 100;
  const itemIdentity = available.map(item => item.featureId || item.fullName).join('|');

  useEffect(() => {
    if (normalized.transforms.some(item => item.key === normalized.defaultTransform)) {
      setTransformKey(normalized.defaultTransform);
    }
  }, [itemIdentity, normalized.defaultTransform, normalized.transforms]);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return undefined;
    const update = width => setVisibleCount(visibleItemCount(width, available.length));
    update(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      update(entry?.contentRect?.width || element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [available.length]);

  const activeTransform = normalized.transforms.find(item => item.key === transformKey)
    || normalized.transforms[0]
    || DEFAULT_TRANSFORMS[0];

  const option = useMemo(() => {
    if (!available.length || !normalized.series.length) return null;
    const categories = available.map(item => String(item.featureId || item.fullName));
    const itemByFeatureId = new Map(categories.map((featureId, index) => [featureId, available[index]]));
    const boxSeries = [];
    const scatterSeries = [];
    normalized.series.forEach((seriesItem, seriesIndex) => {
      const color = seriesItem.color || FALLBACK_SERIES[seriesIndex % FALLBACK_SERIES.length].color;
      const boxes = available.map(item => (
        item.values?.[seriesItem.key]?.[activeTransform.key]?.box || [0, 0, 0, 0, 0]
      ));
      const outliers = [];
      available.forEach(item => {
        const points = item.values?.[seriesItem.key]?.[activeTransform.key]?.outlierPoints || [];
        points.forEach(point => outliers.push({
          value: [String(item.featureId || item.fullName), point.value],
          sample: point.sample,
          feature: item.shortName,
          group: seriesItem.label,
        }));
      });
      const boxItemStyle = {
        color: colorWithAlpha(color),
        borderColor: color,
        borderWidth: 2,
      };
      boxSeries.push({
        name: seriesItem.label,
        type: 'boxplot',
        data: boxes,
        itemStyle: boxItemStyle,
        emphasis: { itemStyle: boxItemStyle },
        boxWidth: [12, 22],
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
      animationDurationUpdate: 320,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(30,41,59,0.92)',
        borderColor: 'transparent',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        formatter(params) {
          if (params.seriesType === 'scatter') {
            return `<b>${params.data.group} - ${params.data.feature}</b><br/>样本编号: ${params.data.sample || '未知'}<br/>离群点: ${fmtNum(params.data.value[1], activeTransform.key)}`;
          }
          const box = params.data;
          const item = available[params.dataIndex];
          const detectionNote = item?.detectedInScope === false ? '<br/><b>当前范围未检出</b>' : '';
          return `<b>${params.seriesName} - ${item?.shortName || params.name}</b><br/>上限: ${fmtNum(box[4], activeTransform.key)}<br/>Q3: ${fmtNum(box[3], activeTransform.key)}<br/><b>中位数: ${fmtNum(box[2], activeTransform.key)}</b><br/>Q1: ${fmtNum(box[1], activeTransform.key)}<br/>下限: ${fmtNum(box[0], activeTransform.key)}${detectionNote}`;
        },
      },
      legend: {
        data: normalized.series.map(item => item.label),
        top: 0,
        right: 18,
        textStyle: { color: '#475569' },
      },
      grid: { left: 70, right: 30, top: 42, bottom: 100 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          rotate: 35,
          fontSize: 10,
          color(value) {
            return itemByFeatureId.get(String(value))?.detectedInScope === false ? '#94a3b8' : '#64748b';
          },
          interval: 0,
          formatter(value) {
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
          formatter: value => fmtNum(value, activeTransform.key),
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      dataZoom: [
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
  }, [activeTransform, available, normalized.series, visibleCount]);

  const densityMessage = available.length > strongWarningThreshold
    ? `共 ${available.length} 个${featureLabel}，绘制内容较多，拖动或缩放时可能出现短暂延迟。`
    : available.length > warningThreshold
      ? `共 ${available.length} 个${featureLabel}，请使用底部滑块连续浏览。`
      : `共 ${available.length} 个${featureLabel}，首屏约显示 ${visibleCount} 个，可拖动底部滑块浏览。`;
  const undetectedCount = available.filter(item => item.detectedInScope === false).length;

  return (
    <div ref={hostRef} className="chart-plain boxplot-chart">
      <div className="boxplot-chart__toolbar">
        <div className="chart-control-strip" aria-label="箱线图数值变换">
          <span>{densityMessage}</span>
          {undetectedCount ? (
            <span className="boxplot-chart__scope-note">其中 {undetectedCount} 个在当前范围未检出</span>
          ) : null}
          {normalized.transforms.map(transform => (
            <button
              type="button"
              key={transform.key}
              className={`chart-chip ${activeTransform.key === transform.key ? 'chart-chip--active' : ''}`}
              onClick={() => setTransformKey(transform.key)}
              title={transform.formula || transform.label}
            >
              {transform.label}
            </button>
          ))}
          {normalized.transformNote ? (
            <span className="boxplot-chart__transform-note">{normalized.transformNote}</span>
          ) : null}
        </div>
      </div>
      {option ? (
        <ChartViewport variant="data" minHeight={500} preferredHeight={550}>
          <ReactECharts
            option={option}
            exportConfig={{
              fileName: `${featureLabel}-boxplot-${activeTransform.key}`,
              format: 'svg',
              fullDataZoom: true,
              grid: { bottom: 72 },
              widthPerCategory: 112,
              horizontalPadding: 180,
              maxWidth: 14000,
            }}
            frameActions
            opts={{ renderer: 'canvas' }}
            style={{ width: '100%', height: '100%' }}
          />
        </ChartViewport>
      ) : (
        <div className="placeholder"><p>当前选择没有可展示的{featureLabel}</p></div>
      )}
    </div>
  );
}

export default BoxPlot;
