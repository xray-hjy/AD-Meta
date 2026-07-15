import { useEffect, useMemo, useState } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';

const COLORS = {
  AD: '#e74c3c',
  NC: '#2ecc71',
};
const DEFAULT_TOP_N = 20;

function formatTaxonomy(fullName) {
  if (!fullName) return '';

  return String(fullName)
    .split('|')
    .map(part => part.replace(/^([a-z])__/, (_, level) => `${level}: `))
    .join('<br/>');
}

function abbreviateFeatureName(label) {
  if (!label) return 'Unknown';

  const normalized = String(label).replace(/\s+/g, '_');
  const parts = normalized.split('_').filter(Boolean);

  if (parts.length >= 2) {
    const genus = parts[0];
    const species = parts.slice(1).join('_');
    const shortSpecies = species.length > 12 ? `${species.slice(0, 11)}...` : species;
    return `${genus.charAt(0)}. ${shortSpecies}`;
  }

  return normalized.length > 14 ? `${normalized.slice(0, 13)}...` : normalized;
}

function compactNumber(value) {
  const num = Number(value) || 0;
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(0);
}

function clampTopN(value, max) {
  if (!Number.isFinite(value)) return 1;
  if (max <= 0) return 1;
  return Math.max(1, Math.min(max, Math.round(value)));
}

function axisLabelInterval(count) {
  if (count <= 24) return 0;
  if (count <= 60) return 1;
  if (count <= 120) return 3;
  if (count <= 240) return 7;
  if (count <= 600) return 15;
  if (count <= 1200) return 31;
  return 63;
}

function BarChart({ data, featureLabel = '物种' }) {
  const maxFeatures = Array.isArray(data) ? data.length : 0;
  const [topN, setTopN] = useState(DEFAULT_TOP_N);
  const [topNInput, setTopNInput] = useState(String(DEFAULT_TOP_N));

  useEffect(() => {
    if (maxFeatures <= 0) return;
    const nextTopN = clampTopN(Math.min(DEFAULT_TOP_N, maxFeatures), maxFeatures);
    setTopN(nextTopN);
    setTopNInput(String(nextTopN));
  }, [maxFeatures]);

  const handleTopNChange = (nextValue) => {
    const clamped = clampTopN(nextValue, maxFeatures);
    setTopN(clamped);
    setTopNInput(String(clamped));
  };

  const handleInputChange = (event) => {
    const value = event.target.value;
    if (value === '') {
      setTopNInput(value);
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    const clamped = clampTopN(parsed, maxFeatures);
    setTopN(clamped);
    setTopNInput(String(clamped));
  };

  const handleInputBlur = () => {
    handleTopNChange(topNInput === '' ? topN : Number(topNInput));
  };

  const option = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return null;

    const chartData = data.slice(0, topN).map(item => ({
      ...item,
      shortLabel: abbreviateFeatureName(item.species || item.feature),
      adMean: Math.max(0, item.adMean || 0),
      ncMean: Math.max(0, item.ncMean || 0),
    }));
    const labelInterval = axisLabelInterval(chartData.length);

    const start = chartData.length > 10
      ? Math.max(0, 100 - (10 / chartData.length) * 100)
      : 0;

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

          const lines = [
            `<b>${item.species || item.feature}</b>`,
            item.fullName ? formatTaxonomy(item.fullName) : '',
            '<br/>',
          ];

          params.forEach(entry => {
            lines.push(`${entry.marker}${entry.seriesName}: ${compactNumber(entry.value)}`);
          });

          return lines.join('<br/>');
        },
      },
      toolbox: {
        show: true,
        right: 18,
        top: 4,
        itemSize: 16,
        iconStyle: { borderColor: '#94a3b8' },
        emphasis: { iconStyle: { borderColor: '#475569' } },
        feature: {
          dataView: { show: true, readOnly: true },
          magicType: { show: true, type: ['line', 'bar'] },
          restore: { show: true },
          saveAsImage: { show: true },
        },
      },
      legend: {
        data: ['AD 均值', 'NC 均值'],
        top: 8,
        right: 180,
        itemGap: 18,
        itemWidth: 14,
        itemHeight: 14,
        textStyle: { color: '#475569', fontSize: 12 },
      },
      grid: {
        top: 62,
        left: 76,
        right: 92,
        bottom: 148,
        containLabel: false,
      },
      xAxis: [
        {
          type: 'category',
          data: chartData.map(item => item.shortLabel),
          axisTick: { alignWithLabel: true, lineStyle: { color: '#cbd5e1' } },
          axisLine: { lineStyle: { color: '#cbd5e1' } },
          axisLabel: {
            interval: labelInterval,
            rotate: 38,
            color: '#64748b',
            fontSize: 11,
            margin: 18,
          },
        },
      ],
      yAxis: [
        {
          type: 'value',
          name: '平均丰度',
          nameLocation: 'middle',
          nameGap: 58,
          nameTextStyle: { color: '#64748b', fontSize: 12 },
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: '#94a3b8',
            fontSize: 11,
            formatter(value) {
              return compactNumber(value);
            },
          },
          splitLine: { lineStyle: { color: '#e7edf5', type: 'dashed' } },
        },
      ],
      dataZoom: [
        {
          show: chartData.length > 10,
          start,
          end: 100,
          height: 18,
          bottom: 74,
          borderColor: '#dbe3ee',
          fillerColor: 'rgba(37, 99, 235, 0.12)',
          backgroundColor: 'rgba(241, 245, 249, 0.9)',
          handleStyle: { color: '#2563eb' },
          moveHandleStyle: { color: '#2563eb' },
          textStyle: { color: '#94a3b8' },
        },
        { type: 'inside', start, end: 100 },
      ],
      series: [
        {
          name: 'AD 均值',
          type: 'bar',
          barMaxWidth: 26,
          itemStyle: { color: COLORS.AD, borderRadius: [7, 7, 0, 0] },
          emphasis: { itemStyle: { color: COLORS.AD } },
          data: chartData.map(item => item.adMean),
        },
        {
          name: 'NC 均值',
          type: 'bar',
          barMaxWidth: 26,
          itemStyle: { color: COLORS.NC, borderRadius: [7, 7, 0, 0] },
          emphasis: { itemStyle: { color: COLORS.NC } },
          data: chartData.map(item => item.ncMean),
        },
      ],
    };
  }, [data, topN]);

  if (!option) {
    return (
      <div className="placeholder">
        <p>暂无{featureLabel}丰度数据</p>
      </div>
    );
  }

  return (
    <div className="chart-plain">
      <div className="chart-toolbar chart-toolbar--bar">
        <div className="chart-toolbar__control">
          <label htmlFor="bar-top-n">展示数量</label>
          <input
            id="bar-top-n"
            type="range"
            min={1}
            max={Math.max(1, maxFeatures)}
            step={1}
            value={topN}
            onChange={(event) => handleTopNChange(Number(event.target.value))}
          />
          <input
            className="chart-number-input"
            type="number"
            aria-label="展示数量"
            min={1}
            max={Math.max(1, maxFeatures)}
            step={1}
            value={topNInput}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
          />
        </div>
        <p className="chart-toolbar__summary">前 {topN} 个{featureLabel} · 全量 {maxFeatures}</p>
      </div>

      <ChartViewport
        variant="data"
        minHeight={520}
        preferredHeight={Math.min(700, 500 + topN * 7)}
        maxHeight={700}
      >
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

export default BarChart;
