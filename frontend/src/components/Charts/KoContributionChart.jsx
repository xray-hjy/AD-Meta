import { useMemo } from 'react';
import ZoomableGroupedBarChart from './ZoomableGroupedBarChart';

const BAR_HEIGHT = 16;
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

  const model = useMemo(() => ({
    title: 'KO 相对贡献', featureLabel: 'KO', nameColumn: 'KO 名称',
    items: items.map(item => ({ ...item, label: item.feature })),
    series,
    barWidth: BAR_HEIGHT,
    barGap: '12%',
    categoryGap: '28%',
    cornerRadius: 5,
    formatValue: value => formatPercent(value, 2),
    formatTooltipValue: value => formatPercent(value, 3),
    formatAxis: value => formatPercent(value, value < 0.01 ? 2 : 1),
    axisName: '样本内相对贡献（组均值）',
    abbreviateLabel: shortLabel,
    grid: { top: 50, left: 104, right: 100, bottom: 44 },
  }), [items, series]);

  if (!items.length || !series.length) {
    return <div className="placeholder"><p>暂无 KO 相对贡献数据</p></div>;
  }

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
        <ZoomableGroupedBarChart
          model={model}
          barStyleConfig={{ key: 'function-ko-contribution', scale: 100, suffix: '%' }}
          exportConfig={{ title: '导出图像', fileName: 'ko-contribution', format: 'svg' }}
        />
    </div>
  );
}
