import { useMemo } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';

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

  const option = useMemo(() => {
    if (!items.length) return null;

    const chartItems = items.map(item => ({
      ...item,
      koId: item.koId || item.koName || '',
      koName: item.koName || item.koId || '',
      enrichedGroup: item.enrichedGroup === 'NC' ? 'NC' : 'AD',
      effectSize: Number(
        item.effectSize
        ?? ((item.enrichedGroup === 'NC' ? -1 : 1) * Number(item.ldaScore || 0))
      ),
      pValue: Number(item.pValue || 1),
      qValue: Number(item.qValue ?? item.pValue ?? 1),
      log2FC: Number(item.log2FC || 0),
      meanAD: Number(item.meanAD || 0),
      meanNC: Number(item.meanNC || 0),
    }));
    const maxAbsScore = Math.max(...chartItems.map(item => Math.abs(item.effectSize)), 1);
    const axisLimit = Number((maxAbsScore * 1.12).toFixed(2));

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        extraCssText: 'border-radius:8px; padding:10px 14px;',
        formatter(params) {
          const point = params.data || {};
          const effectSize = Number(point.effectSize ?? point.value ?? 0);
          return `
            <b>${point.koName || point.koId || ''}</b><br/>
            富集组: ${point.groupLabel || ''}<br/>
            rank-biserial 效应量: ${formatNumber(effectSize)}<br/>
            p 值: ${formatNumber(point.pValue)}<br/>
            q 值: ${formatNumber(point.qValue)}<br/>
            log2FC: ${formatNumber(point.log2FC)}<br/>
            AD 均值: ${compactNumber(point.meanAD)}<br/>
            NC 均值: ${compactNumber(point.meanNC)}
          `;
        },
      },
      grid: { top: 24, left: 92, right: 48, bottom: 40, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'NC 富集 ← rank-biserial effect → AD 富集',
        nameLocation: 'middle',
        nameGap: 28,
        min: -axisLimit,
        max: axisLimit,
        axisLabel: {
          color: '#64748b',
          formatter(value) {
            return formatNumber(Math.abs(value), 1);
          },
        },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: chartItems.map(item => item.koId),
        inverse: true,
        axisLabel: { color: '#334155', fontSize: 11, fontWeight: 600 },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      series: [
        {
          name: 'rank-biserial effect',
          type: 'bar',
          barMaxWidth: 18,
          data: chartItems.map(item => ({
            value: item.effectSize,
            effectSize: item.effectSize,
            koId: item.koId,
            koName: item.koName,
            enrichedGroup: item.enrichedGroup,
            groupLabel: `${item.enrichedGroup} 富集`,
            pValue: item.pValue,
            qValue: item.qValue,
            log2FC: item.log2FC,
            meanAD: item.meanAD,
            meanNC: item.meanNC,
            itemStyle: {
              color: GROUP_COLORS[item.enrichedGroup],
              borderRadius: item.enrichedGroup === 'NC' ? [5, 0, 0, 5] : [0, 5, 5, 0],
            },
            label: { position: item.enrichedGroup === 'NC' ? 'left' : 'right' },
          })),
          label: {
            show: true,
            position: 'right',
            color: '#334155',
            fontSize: 10,
            formatter(params) {
              const point = params.data || {};
              return formatNumber(point.effectSize ?? params.value, 2);
            },
          },
        },
      ],
    };
  }, [items]);

  if (!option) {
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
      <ChartViewport
        variant="data"
        minHeight={520}
        preferredHeight={Math.max(520, items.length * 26 + 120)}
      >
        <ReactECharts
          option={option}
          exportConfig={{ fileName: 'ko-lda-effect-size', format: 'svg' }}
          frameActions
          style={{ width: '100%', height: '100%' }}
        />
      </ChartViewport>
    </div>
  );
}

export default KoLdaBarChart;
