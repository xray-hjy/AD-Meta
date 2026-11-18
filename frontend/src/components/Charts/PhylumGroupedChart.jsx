import { useMemo } from 'react';
import ZoomableGroupedBarChart from './ZoomableGroupedBarChart';

const BAR_HEIGHT = 22;
const ROW_GAP = 6;

function formatSource(value) { return Number(value).toPrecision(6); }

function formatPercent(value) {
  const percent = (Number(value) || 0) * 100;
  return `${percent !== 0 && Math.abs(percent) < 0.001 ? percent.toExponential(3) : Number(percent.toPrecision(6))}%`;
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

function buildDifferenceSummary(items, series, relative = true) {
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
    difference: relative ? `${formatPercent(difference.absolute).replace('%', '')} pp` : `${formatSource(difference.absolute)} 源丰度差`,
  };
}

function PhylumGroupedChart({ data, featureKind = 'taxonomy', focusMax = null, showDataTable = true }) {
  const normalized = useMemo(() => normalizeComposition(data), [data]);
  const { series, items } = normalized;
  const isKo = featureKind === 'ko';
  const relative = Array.isArray(data) || !data?.semantics || data.semantics.abundanceScale === 'relative_abundance';
  const formatValue = relative ? formatPercent : formatSource;

  const model = useMemo(() => ({
    title: '门级组成', featureLabel: '分类', nameColumn: '分类名称',
    items: items.map(item => ({ ...item, label: item.feature })),
    series,
    barWidth: BAR_HEIGHT,
    rowGap: ROW_GAP,
    axisName: relative ? '相对丰度（%）' : '源丰度（单位未声明）',
    axisMax: focusMax ?? (relative ? Math.max(1, ...items.flatMap(item => Object.values(item.values || {}))) : undefined),
    formatValue,
    formatAxis: formatValue,
    abbreviateLabel,
  }), [items, series, focusMax, relative, formatValue]);

  if (!items.length || !series.length) {
    return <div className="placeholder"><p>{isKo ? '暂无 KO 功能组成数据' : '暂无门级组成数据'}</p></div>;
  }

  const summaryItems = series.map(seriesItem => {
    const top = topItem(items, seriesItem.key);
    return {
      key: seriesItem.key,
      label: summaryLabel(seriesItem),
      value: top?.feature || 'NA',
      ratio: formatValue(top?.values?.[seriesItem.key]),
      color: seriesItem.color,
    };
  });
  const differenceSummary = buildDifferenceSummary(items, series, relative);

  return (
    <div className="chart-plain">
      <div className="chart-stat-strip chart-stat-strip--compact">
        <span className="chart-stat-item">
          <b>展示项</b>
          <span className="chart-stat-value">{items.length} 项</span>
          <span>{isKo ? 'Top KO 功能' : '全部门级组成'}</span>
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
            <b>最大均值差（描述性）</b>
            <span className="chart-stat-value" title={differenceSummary.feature}>{differenceSummary.feature}</span>
            <span>{differenceSummary.direction} {differenceSummary.difference}</span>
          </span>
        ) : null}
      </div>
        <ZoomableGroupedBarChart
          model={model}
          showDataTable={showDataTable}
          barStyleConfig={{ key: isKo ? 'function-composition' : 'species-phylum', preserveNonzero: true, scale: relative ? 100 : 1, suffix: relative ? '%' : '' }}
          exportConfig={{
            fileName: (isKo ? 'ko-composition' : 'phylum-composition') + (focusMax == null ? '-full' : `-focus-0-${focusMax * 100}pct`),
            title: '导出图像',
            format: 'svg',
          }}
        />
    </div>
  );
}

export default PhylumGroupedChart;
