import { useMemo } from 'react';
import ReactECharts from './HeatmapEChart';
import ChartViewport from './ChartViewport';

const ABUNDANCE_COLORS = ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'];

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function matrixExtent(matrix) {
  const values = [];
  matrix.forEach(row => {
    if (!Array.isArray(row)) return;
    row.forEach(value => {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) values.push(numericValue);
    });
  });

  if (!values.length) return { min: 0, max: 1 };

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function DetectionHeatmap({ data }) {
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const adGroup = groups.find(group => group.group === 'AD');
  const ncGroup = groups.find(group => group.group === 'NC');

  const option = useMemo(() => {
    const rowLabels = Array.isArray(data?.rowLabels) ? data.rowLabels : [];
    const colLabels = Array.isArray(data?.colLabels) ? data.colLabels : [];
    const matrix = Array.isArray(data?.matrix) ? data.matrix : [];
    const items = Array.isArray(data?.items) ? data.items : [];

    if (!rowLabels.length || !colLabels.length || !items.length || matrix.length < 2) {
      return null;
    }

    const visualExtent = matrixExtent(matrix);

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        position: 'top',
        formatter(params) {
          const point = params.data || {};
          return `
            <b>${point.koName || point.koId || ''}</b><br/>
            组别: ${point.group || ''}<br/>
            检出样本数: ${point.detectedSamples}/${point.sampleCount}<br/>
            检出率: ${pct(point.value?.[2])}<br/>
            AD-NC rateGap: ${Number(point.rateGap || 0).toFixed(4)}
          `;
        },
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        extraCssText: 'border-radius:8px; padding:10px 14px;',
      },
      grid: {
        height: 144,
        top: '24%',
        left: 82,
        right: 28,
      },
      xAxis: {
        type: 'category',
        data: colLabels,
        splitArea: { show: true },
        axisLabel: { interval: 0, rotate: 45, fontSize: 10, color: '#64748b' },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: {
        type: 'category',
        data: rowLabels,
        splitArea: { show: true },
        axisLabel: { fontSize: 12, color: '#334155', fontWeight: 600 },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      visualMap: {
        min: visualExtent.min,
        max: visualExtent.max,
        orient: 'horizontal',
        left: 'center',
        bottom: '16%',
        calculable: true,
        text: ['高检出率', '低检出率'],
        textStyle: { color: '#64748b', fontSize: 11 },
        inRange: { color: ABUNDANCE_COLORS },
      },
      series: [
        {
          type: 'heatmap',
          data: items.flatMap((item, colIndex) => [
            {
              value: [colIndex, 0, matrix[0]?.[colIndex] ?? 0],
              koId: item.koId,
              koName: item.koName,
              group: 'AD',
              detectedSamples: item.adDetectedSamples,
              sampleCount: adGroup?.sampleCount ?? 0,
              rateGap: item.rateGap,
            },
            {
              value: [colIndex, 1, matrix[1]?.[colIndex] ?? 0],
              koId: item.koId,
              koName: item.koName,
              group: 'NC',
              detectedSamples: item.ncDetectedSamples,
              sampleCount: ncGroup?.sampleCount ?? 0,
              rateGap: item.rateGap,
            },
          ]),
          label: {
            show: true,
            fontSize: 10,
            color: '#0f172a',
            formatter(params) {
              return String(params.data?.detectedSamples ?? '');
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    };
  }, [adGroup?.sampleCount, data, ncGroup?.sampleCount]);

  if (!option) {
    return <div className="placeholder"><p>暂无 KO 检出率数据</p></div>;
  }

  return (
    <div className="chart-plain">
      <div className="chart-stat-strip chart-stat-strip--compact">
        <span><b>AD 样本数:</b> {adGroup?.sampleCount ?? 0}</span>
        <span><b>NC 样本数:</b> {ncGroup?.sampleCount ?? 0}</span>
        <span><b>Top 50 KO</b></span>
        <span><b>排序:</b> 按 AD/NC 检出率差异排序</span>
      </div>
      <ChartViewport
        variant="fit"
        minHeight={440}
        maxHeight={560}
        className="chart-viewport--detection"
      >
        <ReactECharts
          option={option}
          opts={{ renderer: 'svg' }}
          style={{ width: '100%', height: '100%' }}
        />
      </ChartViewport>
    </div>
  );
}

export default DetectionHeatmap;
