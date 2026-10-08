import { useEffect, useMemo, useRef, useState } from 'react';
import BoxScatterChart from './BoxScatterChart';
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

  const model = useMemo(() => ({
    available, series: normalized.series, activeTransform, visibleCount,
  }), [activeTransform, available, normalized.series, visibleCount]);

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
      {available.length && normalized.series.length ? (
        <ChartViewport variant="data" minHeight={500} preferredHeight={550}>
          <BoxScatterChart
            model={model}
            boxStyleConfig={{ key: 'species-boxplot', pointLabel: '离群点', pointDescription: '显示或隐藏箱须范围外的离群样本点；不改变箱线统计' }}
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
