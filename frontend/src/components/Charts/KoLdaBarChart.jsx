import { useMemo } from 'react';
import ZoomableGroupedBarChart from './ZoomableGroupedBarChart';

import { escapeTooltipText } from '../../utils/tooltipHtml';

const GROUP_COLORS = {
  AD: '#e74c3c',
  NC: '#2ecc71',
};
const GROUP_TEXT_COLORS = {
  AD: '#b42318',
  NC: '#067647',
};

function formatNumber(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Math.abs(number) > 0 && Math.abs(number) < 0.001) {
    return number.toExponential(2);
  }
  return number.toFixed(digits);
}

function compactNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return number.toFixed(2);
}

function KoLdaBarChart({ data }) {
  const items = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data]);
  const filter = data?.filter || {};
  const summary = useMemo(() => {
    const fallback = items.reduce(
      (acc, item) => {
        const group = item.enrichedGroup === 'NC' ? 'NC' : 'AD';
        acc.significantCount += 1;
        acc.displayedCount += 1;
        if (group === 'AD') {
          acc.adEnrichedCount += 1;
          acc.adDisplayedCount += 1;
        } else {
          acc.ncEnrichedCount += 1;
          acc.ncDisplayedCount += 1;
        }
        return acc;
      },
      {
        significantCount: 0,
        adEnrichedCount: 0,
        ncEnrichedCount: 0,
        displayedCount: 0,
        adDisplayedCount: 0,
        ncDisplayedCount: 0,
      }
    );

    return { ...fallback, ...(data?.summary || {}) };
  }, [data?.summary, items]);

  const model = useMemo(() => {
    const chartItems = items.map(item => ({ ...item,
      id: item.koId || item.koName, label: item.koId || item.koName,
      fullName: item.koName || item.koId, enrichedGroup: item.enrichedGroup === 'NC' ? 'NC' : 'AD',
      effectSize: Number(item.effectSize ?? ((item.enrichedGroup === 'NC' ? -1 : 1) * Number(item.ldaScore || 0))),
      pValue: Number(item.pValue ?? 1), qValue: Number(item.qValue ?? item.pValue ?? 1),
      log2FC: Number(item.log2FC ?? 0), meanAD: Number(item.meanAD ?? 0), meanNC: Number(item.meanNC ?? 0),
    })).map(item => ({ ...item, values: { AD: item.enrichedGroup === 'AD' ? item.effectSize : null,
      NC: item.enrichedGroup === 'NC' ? item.effectSize : null } }));
    const limit = Number((Math.max(1, ...chartItems.map(item => Math.abs(item.effectSize))) * 1.12).toFixed(2));
    return { title: 'KO 差异特征效应', featureLabel: 'KO', nameColumn: 'KO 名称',
      items: chartItems, series: ['AD', 'NC'].map(group => ({ key: group, label: `${group} 富集`, color: GROUP_COLORS[group] })),
      overlapSeries: true, barGap: '-100%', zeroLine: true,
      axisName: 'NC 富集 ← rank-biserial effect → AD 富集', axisMin: -limit, axisMax: limit,
      formatAxis: value => formatNumber(Math.abs(value), 1), formatValue: value => formatNumber(value, 2),
      pointOptions: item => ({ ...item, label: { position: item.effectSize < 0 ? 'left' : 'right' },
        itemStyle: { color: GROUP_COLORS[item.enrichedGroup], borderRadius: item.effectSize < 0 ? [5, 0, 0, 5] : [0, 5, 5, 0] } }),
      tooltipAppearance: 'light', tooltipFormatter: params => {
        const entry = Array.isArray(params) ? params[0] : params;
        const item = chartItems[entry?.dataIndex];
        if (!item) return '';
        return `<b>${escapeTooltipText(item.label)} · ${escapeTooltipText(item.fullName)}</b><br/>
          富集组: ${item.enrichedGroup} 富集<br/>rank-biserial 效应量: ${formatNumber(item.effectSize)}<br/>
          p 值: ${formatNumber(item.pValue)}<br/>q 值: ${formatNumber(item.qValue)}<br/>
          log2FC: ${formatNumber(item.log2FC)}<br/>AD 均值: ${compactNumber(item.meanAD)}<br/>NC 均值: ${compactNumber(item.meanNC)}`;
      } };
  }, [items]);
  if (!model.items.length) {
    return (
      <div className="placeholder">
        <p>没有 KO 通过 BH-FDR 校正阈值</p>
        <small>当前结果不会回填未经校正的候选 KO。</small>
      </div>
    );
  }

  return (
    <div className="chart-plain">
      <div className="chart-stat-strip chart-stat-strip--compact">
        <span><b>Q &lt;</b> {filter.qValueMax ?? 0.05}</span>
        <span><b>显著 KO:</b> {summary.significantCount}</span>
        <span><b style={{ color: GROUP_TEXT_COLORS.AD }}>AD 富集:</b> {summary.adEnrichedCount}</span>
        <span><b style={{ color: GROUP_TEXT_COLORS.NC }}>NC 富集:</b> {summary.ncEnrichedCount}</span>
        <span><b>展示 AD Top {summary.adDisplayedCount} + NC Top {summary.ncDisplayedCount}</b></span>
      </div>
      <ZoomableGroupedBarChart model={model}
        barStyleConfig={{ key: 'function-ko-effect', allowLine: false, allowOrientation: false }}
        exportConfig={{ title: '导出图像', fileName: 'ko-rank-biserial-effect-size', format: 'svg' }} />
    </div>
  );
}

export default KoLdaBarChart;

