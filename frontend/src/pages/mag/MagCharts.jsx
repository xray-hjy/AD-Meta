import { useMemo } from 'react';
import CartesianEChart from '../../components/Charts/CartesianEChart';
import HeatmapEChart from '../../components/Charts/HeatmapEChart';
import ChartViewport from '../../components/Charts/ChartViewport';

const GROUP_COLORS = { AD: '#c05a48', NC: '#357e96' };
export const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const shortMag = id => id.replace(/__(CRR\d+)_cleanbin_/, ' · ');
const tooltip = { trigger: 'item', renderMode: 'richText', confine: true };

export function comparisonOption(items) {
  return {
    animation: false, tooltip: { ...tooltip, trigger: 'axis' },
    legend: { top: 0 }, grid: { left: 200, right: 40, top: 36, bottom: 48 },
    xAxis: { type: 'value', name: '相对丰度（%）', nameLocation: 'middle', nameGap: 28 },
    yAxis: { type: 'category', inverse: true, data: items.map(r => r.magId), axisLabel: { formatter: shortMag, fontSize: 10 } },
    series: ['AD', 'NC'].map(group => ({ name: group, type: 'bar', itemStyle: { color: GROUP_COLORS[group] },
      data: items.map(r => r[`${group.toLowerCase()}MeanPercent`]) })),
  };
}

export function distributionOption(data) {
  return {
    animation: false, tooltip,
    grid: { left: 65, right: 35, top: 40, bottom: 48 },
    xAxis: { type: 'category', data: ['AD', 'NC'], axisLabel: { formatter: group => `${group} (n=${data.provenance.groupCounts[group]})` } },
    yAxis: { type: 'value', name: '相对丰度（%）' },
    series: [
      { name: '箱线：1.5×IQR 须', type: 'boxplot', boxWidth: [35, 90],
        data: ['AD', 'NC'].map(group => ({ value: data.boxes.find(b => b.group === group)?.values || ['-', '-', '-', '-', '-'],
          itemStyle: { color: `${GROUP_COLORS[group]}40`, borderColor: GROUP_COLORS[group] } })) },
      ...['AD', 'NC'].map(group => ({ name: `${group} 样本`, type: 'scatter', symbolSize: 6,
        itemStyle: { color: GROUP_COLORS[group], opacity: 0.7 },
        data: data.samples.filter(s => s.disease === group).map((s, i) => ({
          name: s.sampleId, value: [group, s.abundancePercent], symbolOffset: [((i * 7) % 17 - 8) * 2, 0],
        })) })),
    ],
  };
}

export function heatmapOption(data) {
  return {
    animation: false,
    // A single continuous series: a uniform decal obscures the abundance scale.
    // The sequential blue scale and raw-value tooltip carry the information.
    aria: { enabled: true, decal: { show: false } },
    tooltip: { ...tooltip, formatter: p => {
      const [x, y] = p.value;
      const sample = data.samples[x];
      return `${sample.sampleId} · ${sample.disease} · Batch ${sample.batch}\n${data.magIds[y]}\n${number(data.values[x][y])}%`;
    } },
    grid: { left: 200, right: 30, top: 62, bottom: 115 },
    xAxis: { type: 'category', data: data.samples.map(s => `${s.disease} / B${s.batch} / ${s.sampleId}`), axisLabel: { rotate: 60, fontSize: 9 } },
    yAxis: { type: 'category', data: data.magIds, axisLabel: { formatter: shortMag, fontSize: 10 } },
    visualMap: { min: 0, max: Math.max(0.001, ...data.values.flat().map(v => Math.log10(1 + v))),
      orient: 'horizontal', left: 'center', top: 6, calculable: false,
      text: ['log10(1 + 丰度%)', '0'], inRange: { color: ['#f2f6f9', '#b6dce1', '#4696a9', '#164965'] } },
    series: [{ name: 'MAG 丰度', type: 'heatmap', progressive: 0,
      data: data.values.flatMap((row, x) => row.map((value, y) => [x, y, Math.log10(1 + value)])) }],
  };
}

export function mappingOption(data) {
  return {
    animation: false,
    tooltip: { ...tooltip, formatter: p => `${p.name}\n映射 ${number(p.value[0])}%\n超过丰度阈值 ${p.value[1]} 个 MAG` },
    legend: { top: 0 }, grid: { left: 70, right: 30, top: 46, bottom: 48 },
    xAxis: { type: 'value', min: 0, max: 100, name: '映射到代表 MAG 的比例（%）', nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: 'value', name: '超过丰度阈值的 MAG 数', min: 0, max: data.provenance.magCount },
    series: ['AD', 'NC'].map(group => ({ name: group, type: 'scatter', symbolSize: 8,
      itemStyle: { color: GROUP_COLORS[group] },
      data: data.items.filter(s => s.disease === group).map(s => ({
        name: `${s.sampleId} · ${group} · Batch ${s.batch}`, value: [s.mappedPercent, s.aboveThresholdMagCount],
      })) })),
  };
}

export function taxonomyOption(data) {
  return {
    animation: false,
    aria: { enabled: true, decal: { show: false } },
    tooltip: { ...tooltip, formatter: p => `${p.name}\n${p.value.toLocaleString('en-US')} 个 MAG\n${number(p.data.percent)}%` },
    grid: { left: 210, right: 45, top: 24, bottom: 54 },
    xAxis: { type: 'value', min: 0, name: 'MAG 数量', nameLocation: 'middle', nameGap: 32, minInterval: 1 },
    yAxis: { type: 'category', inverse: true, data: data.items.map(item => item.label), axisLabel: { width: 190, overflow: 'truncate' } },
    series: [{
      name: 'MAG 数量',
      type: 'bar',
      barMaxWidth: 24,
      itemStyle: { color: '#357e96', borderColor: '#164965', borderWidth: 0.8 },
      label: { show: true, position: 'right', color: '#334155', formatter: p => p.value.toLocaleString('en-US') },
      data: data.items.map(item => ({ value: item.count, name: item.label, percent: item.percent })),
    }],
  };
}

export function qualityOption(data) {
  const point = item => ({
    name: item.magId,
    value: [item.completenessPercent, item.contaminationPercent],
    details: item,
  });
  const reference = data.items.filter(item => item.inReferenceBand).map(point);
  const remaining = data.items.filter(item => !item.inReferenceBand).map(point);
  const tooltipFormatter = p => {
    const item = p.data.details;
    return `${item.magId}\n完整度 ${number(item.completenessPercent)}%\n污染率 ${number(item.contaminationPercent)}%\nN50 ${item.contigN50Bp.toLocaleString('en-US')} bp\nContigs ${item.totalContigs.toLocaleString('en-US')}\n基因组 ${item.genomeSizeBp.toLocaleString('en-US')} bp`;
  };
  return {
    animation: false,
    aria: { enabled: true, decal: { show: true } },
    tooltip: { ...tooltip, formatter: tooltipFormatter },
    legend: { top: 0 },
    grid: { left: 70, right: 35, top: 58, bottom: 58 },
    xAxis: { type: 'value', min: 50, max: 100, name: '完整度（%，横轴从 50% 起）', nameLocation: 'middle', nameGap: 34 },
    yAxis: { type: 'value', min: 0, max: 10, name: '污染率（%）' },
    series: [
      {
        name: '完整度≥90% 且污染率≤5%',
        type: 'scatter',
        symbol: 'circle',
        symbolSize: 7,
        itemStyle: { color: '#357e96', opacity: 0.7, borderColor: '#164965', borderWidth: 0.6 },
        data: reference,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#475569', type: 'dashed', width: 1 },
          label: { color: '#475569', fontSize: 10 },
          data: [
            { xAxis: 90, label: { formatter: '完整度 90%' } },
            { yAxis: 5, label: { formatter: '污染率 5%' } },
          ],
        },
      },
      {
        name: '其余已筛选代表 MAG',
        type: 'scatter',
        symbol: 'emptyCircle',
        symbolSize: 7,
        itemStyle: { color: '#b7863c', opacity: 0.8, borderColor: '#7a5625', borderWidth: 1 },
        data: remaining,
      },
    ],
  };
}

export default function MagChart({ view, data, format, size }) {
  const option = useMemo(() => {
    if (view === 'distribution') return distributionOption(data);
    if (view === 'heatmap') return heatmapOption(data);
    if (view === 'taxonomy') return taxonomyOption(data);
    if (view === 'quality') return qualityOption(data);
    if (view === 'mapping') return mappingOption(data);
    return comparisonOption(data.items.slice(0, 15));
  }, [view, data]);
  const exportConfig = useMemo(() => ({
    fileName: `ADMeta-${data.provenance.version}-${view}-${data.provenance.requestFingerprint.slice(0, 12)}${view === 'distribution' ? `-${data.feature.magId}` : view === 'heatmap' ? `-top${data.magIds.length}` : view === 'features' ? `-${data.sortBy}-${data.direction}-p${Math.floor(data.offset / data.limit) + 1}-${data.query || 'all'}` : ''}`,
    format, minWidth: size === 'large' ? 1800 : 1100, minHeight: size === 'large' ? 1000 : 640,
    fullDataZoom: true, title: `导出 ${format.toUpperCase()} 图形`,
  }), [data, format, size, view]);
  const Chart = view === 'heatmap' ? HeatmapEChart : CartesianEChart;
  const height = view === 'features' ? 550
    : view === 'heatmap' ? Math.max(520, data.magIds.length * 24 + 140)
      : view === 'taxonomy' ? Math.max(500, data.items.length * 28 + 120)
        : view === 'quality' ? 560 : 430;
  return <ChartViewport variant="data" minHeight={height + 18} minWidth={680} ariaLabel="MAG 图表，可横向滚动">
    <Chart option={option} notMerge frameActions showDataTable={false} exportConfig={exportConfig}
      ariaLabel={`MAG ${view} 图表`} style={{ height }} />
  </ChartViewport>;
}
