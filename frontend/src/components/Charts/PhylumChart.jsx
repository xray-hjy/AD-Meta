import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import ChartViewport from './ChartViewport';

const COLORS = {
  AD: '#e74c3c',
  NC: '#2ecc71',
};

const BAR_HEIGHT = 22;
const ROW_GAP = 6;

function formatPercent(value) {
  const number = Number(value) || 0;
  return `${(number * 100).toFixed(1)}%`;
}

function formatPointGap(value) {
  const number = Math.abs(Number(value) || 0);
  return `${(number * 100).toFixed(1)} pp`;
}

function topBy(data, key) {
  return data.reduce((best, item) => {
    if (!best) return item;
    return Number(item[key] || 0) > Number(best[key] || 0) ? item : best;
  }, null);
}

function abbreviateLabel(label) {
  const text = String(label || 'Unknown');
  return text.length > 18 ? `${text.slice(0, 17)}...` : text;
}

function buildSummaryItems(data, isKo) {
  const adTop = topBy(data, 'adRatio');
  const ncTop = topBy(data, 'ncRatio');
  const gapTop = data.reduce((best, item) => {
    const gap = Math.abs(Number(item.adRatio || 0) - Number(item.ncRatio || 0));
    if (!best || gap > best.gap) {
      return { ...item, gap };
    }
    return best;
  }, null);
  const gapDirection = Number(gapTop?.adRatio || 0) >= Number(gapTop?.ncRatio || 0) ? 'AD 高' : 'NC 高';
  const itemLabel = isKo ? 'KO' : '门';

  return [
    { label: '展示项', value: `${data.length} 项`, hint: isKo ? 'Top KO 功能' : 'Top 门级组成' },
    { label: 'AD 最高', value: adTop?.phylum || 'NA', hint: `${formatPercent(adTop?.adRatio)} · ${itemLabel}`, tone: COLORS.AD },
    { label: 'NC 最高', value: ncTop?.phylum || 'NA', hint: `${formatPercent(ncTop?.ncRatio)} · ${itemLabel}`, tone: COLORS.NC },
    { label: '最大组间差异', value: gapTop?.phylum || 'NA', hint: `${gapDirection} ${formatPointGap(gapTop?.gap)}` },
  ];
}

function PhylumChart({ data, featureKind = 'taxonomy', featureLabel = '物种' }) {
  const isKo = featureKind === 'ko';
  const summaryItems = data && data.length ? buildSummaryItems(data, isKo) : [];

  const option = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return null;

    const chartData = data.map(item => ({
      label: item.phylum || item.feature || 'Unknown',
      shortLabel: abbreviateLabel(item.phylum || item.feature),
      adRatio: Math.max(0, Number(item.adRatio) || 0),
      ncRatio: Math.max(0, Number(item.ncRatio) || 0),
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: { color: 'rgba(148, 163, 184, 0.08)' },
          label: { show: true, backgroundColor: '#475569' },
        },
        backgroundColor: 'rgba(15,23,42,0.96)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12, lineHeight: 18 },
        extraCssText: 'border-radius:10px; padding:12px 14px;',
        formatter(params) {
          const index = params?.[0]?.dataIndex ?? 0;
          const item = chartData[index];
          if (!item) return '';

          const lines = [`<b>${item.label}</b>`, '<br/>'];
          params.forEach(entry => {
            lines.push(`${entry.marker}${entry.seriesName}: ${formatPercent(entry.value)}`);
          });
          return lines.join('<br/>');
        },
      },
      legend: {
        data: ['AD 组', 'NC 组'],
        top: 8,
        right: 24,
        itemGap: 18,
        itemWidth: 14,
        itemHeight: 14,
        textStyle: { color: '#475569', fontSize: 12 },
      },
      grid: {
        top: 52,
        left: 116,
        right: 92,
        bottom: 42,
        containLabel: false,
      },
      xAxis: [
        {
          type: 'value',
          min: 0,
          max: 1,
          name: '平均占比',
          nameLocation: 'middle',
          nameGap: 30,
          nameTextStyle: { color: '#64748b', fontSize: 12 },
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: '#94a3b8',
            fontSize: 11,
            formatter(value) {
              return `${Math.round(Number(value) * 100)}%`;
            },
          },
          splitLine: { lineStyle: { color: '#e7edf5', type: 'dashed' } },
        },
      ],
      yAxis: [
        {
          type: 'category',
          inverse: true,
          data: chartData.map(item => item.shortLabel),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: {
            color: '#475569',
            fontSize: 12,
            fontWeight: 500,
            margin: 12,
          },
        },
      ],
      series: [
        {
          name: 'AD 组',
          type: 'bar',
          barWidth: BAR_HEIGHT,
          barGap: '0%',
          barCategoryGap: `${ROW_GAP}px`,
          itemStyle: { color: COLORS.AD, borderRadius: [0, 6, 6, 0] },
          label: {
            show: true,
            position: 'right',
            color: '#64748b',
            fontSize: 10,
            fontWeight: 700,
            formatter(params) {
              return formatPercent(params.value);
            },
          },
          emphasis: {
            itemStyle: {
              color: COLORS.AD,
              shadowBlur: 10,
              shadowColor: 'rgba(231, 76, 60, 0.24)',
            },
            label: { color: '#0f172a' },
          },
          data: chartData.map(item => item.adRatio),
        },
        {
          name: 'NC 组',
          type: 'bar',
          barWidth: BAR_HEIGHT,
          barGap: '0%',
          barCategoryGap: `${ROW_GAP}px`,
          itemStyle: { color: COLORS.NC, borderRadius: [0, 6, 6, 0] },
          label: {
            show: true,
            position: 'right',
            color: '#64748b',
            fontSize: 10,
            fontWeight: 700,
            formatter(params) {
              return formatPercent(params.value);
            },
          },
          emphasis: {
            itemStyle: {
              color: COLORS.NC,
              shadowBlur: 10,
              shadowColor: 'rgba(46, 204, 113, 0.24)',
            },
            label: { color: '#0f172a' },
          },
          data: chartData.map(item => item.ncRatio),
        },
      ],
    };
  }, [data]);

  if (!option) {
    return <div className="placeholder"><p>{isKo ? '暂无 KO 功能组成数据' : '暂无门级组成数据'}</p></div>;
  }

  const chartHeight = Math.max(360, data.length * (BAR_HEIGHT * 2 + ROW_GAP) + 96);

  return (
    <div className="chart-plain">
      <div className="chart-stat-strip chart-stat-strip--compact">
        {summaryItems.map(item => (
          <span className="chart-stat-item" key={item.label}>
            <b style={{ color: item.tone || undefined }}>{item.label}</b>
            <span className="chart-stat-value" title={item.value}>{item.value}</span>
            <span>{item.hint}</span>
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

export default PhylumChart;
