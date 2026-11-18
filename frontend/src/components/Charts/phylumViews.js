import { escapeTooltipText } from '../../utils/tooltipHtml';

export const PHYLUM_VIEWS = [
  { key: 'grouped', name: '分组条形图', use: '逐门比较各组均值，聚焦低丰度门' },
  { key: 'stacked', name: '分组堆叠柱状图', use: '每组一柱，比较组平均组成' },
  { key: 'samples', name: '样本堆叠柱状图', use: '每样本一柱，查看个体组成与异质性' },
  { key: 'heatmap', name: '门级丰度热图', use: '逐样本查看高低丰度与检出分布' },
  { key: 'box', name: '分布箱线图', use: '选择单个门，查看零值、主体与极端值' },
  { key: 'difference', name: '均值差点图', use: 'AD 均值减 NC 均值；描述方向和幅度' },
];
const PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#6b6b24', '#8b5cf6', '#0d9488', '#a85556'];
export function phylumColor(label, accessible = false) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const index = hash % PALETTE.length;
  return accessible ? PALETTE[index] : `hsl(${hash % 360} 55% 48%)`;
}
export function precise(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number === 0) return '0';
  return Math.abs(number) < 0.001 ? number.toExponential(4) : String(Number(number.toPrecision(7)));
}
export function shownSamples(data, sort, phylum) {
  return [...(data.samples || [])].sort((a, b) => a.group.localeCompare(b.group)
    || (sort === 'abundance' ? Number(b.values[phylum] || 0) - Number(a.values[phylum] || 0) : 0)
    || a.sample.localeCompare(b.sample));
}
export function buildPhylumOption(data, view, { accessible = true, showLegend = true, showLabels = false,
  heatTransform = 'raw', sort = 'sample', selectedPhylum = '', fontSize = 11 } = {}) {
  const items = data.items || [], series = data.series || [];
  const samples = shownSamples(data, sort, selectedPhylum);
  const relative = data.semantics?.abundanceScale === 'relative_abundance';
  const scale = relative ? 100 : 1;
  const unit = relative ? '%' : '源丰度';
  const number = value => Number(value) * scale;
  const base = { animation: false, title: { text: PHYLUM_VIEWS.find(item => item.key === view)?.name, subtext: `${samples.length} 个样本 · ${items.length} 个显示门类 · ${relative ? '相对丰度 %，不重新闭合' : '输入单位未声明，保留源值'}`, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { confine: true, trigger: 'item' },
    legend: { show: showLegend, type: 'scroll', top: 52, left: 10, right: 10, textStyle: { fontSize } },
    grid: { top: 100, left: 90, right: 45, bottom: 110, outerBoundsMode: 'none' },
    toolbox: { feature: { restore: {}, saveAsImage: {} } },
    xAxis: { type: 'category', axisLabel: { fontSize, rotate: 45 } },
    yAxis: { type: 'value', min: 0, name: relative ? '相对丰度（%）' : '源丰度', axisLabel: { formatter: precise, fontSize } },
  };
  if (view === 'stacked' || view === 'samples') {
    const columns = view === 'samples' ? samples.map(row => `${row.sample} · ${row.group}`) : series.map(row => `${row.label} (n=${data.semantics?.groupCounts?.[row.group] ?? samples.length})`);
    return { ...base, xAxis: { ...base.xAxis, data: columns },
      dataZoom: view === 'samples' ? [{ type: 'slider', xAxisIndex: 0, bottom: 18, startValue: 0, endValue: Math.min(39, columns.length - 1), filterMode: 'none' }, { type: 'inside', xAxisIndex: 0, filterMode: 'none' }] : [],
      series: items.map(item => ({ name: item.feature, type: 'bar', stack: 'composition', emphasis: { focus: 'series' },
        itemStyle: { color: phylumColor(item.feature, accessible) },
        label: { show: showLabels, formatter: params => precise(params.value) },
        data: view === 'samples' ? samples.map(row => number(row.values[item.feature])) : series.map(row => number(item.values[row.key])),
        tooltip: { formatter: params => `${escapeTooltipText(params.name)}<br/>${escapeTooltipText(item.feature)}：${precise(params.value)}${unit}` },
      })) };
  }
  if (view === 'heatmap') {
    const rawValues = samples.flatMap(sample => items.map(item => number(sample.values[item.feature])));
    const max = rawValues.reduce((max, value) => Math.max(max, value), 0);
    return { ...base, legend: { show: false }, grid: { ...base.grid, left: 190, bottom: 120 },
      xAxis: { ...base.xAxis, data: samples.map(row => `${row.sample} · ${row.group}`), splitArea: { show: true } },
      yAxis: { type: 'category', data: items.map(item => item.feature), inverse: true, axisLabel: { fontSize, width: 170, overflow: 'truncate' } },
      aria: { decal: { show: false } },
      visualMap: { dimension: 2, min: 0, max: heatTransform === 'log' ? Math.log10(1 + max) : max || 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
        text: [heatTransform === 'log' ? `log10(1 + 丰度${unit})` : `丰度${unit}`, '0'], inRange: { color: ['#f8fafc', '#93c5fd', '#1e40af'] } },
      dataZoom: [{ type: 'slider', xAxisIndex: 0, bottom: 58, startValue: 0, endValue: Math.min(39, samples.length - 1), filterMode: 'none' }, { type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
      series: [{ type: 'heatmap', encode: { x: 0, y: 1, value: 2 }, itemStyle: { borderColor: '#ffffff', borderWidth: .6 }, data: samples.flatMap((sample, x) => items.map((item, y) => {
        const raw = number(sample.values[item.feature]); return [x, y, heatTransform === 'log' ? Math.log10(1 + raw) : raw, raw];
      })), label: { show: showLabels, formatter: params => precise(params.value[3]) },
        tooltip: { formatter: params => `${escapeTooltipText(samples[params.value[0]]?.sample)} · ${escapeTooltipText(samples[params.value[0]]?.group)}<br/>${escapeTooltipText(items[params.value[1]]?.feature)}：${precise(params.value[3])}${unit}` } }],
    };
  }
  if (view === 'difference') {
    return { ...base, legend: { show: false }, grid: { ...base.grid, left: 190, bottom: 60 },
      xAxis: { type: 'value', name: relative ? 'AD − NC（百分点 pp）' : 'AD − NC（源丰度差）', axisLabel: { formatter: precise } },
      yAxis: { type: 'category', inverse: true, data: items.map(item => item.feature), axisLabel: { fontSize, width: 170, overflow: 'truncate' } },
      series: [{ type: 'scatter', symbolSize: 12, data: items.map(item => [number(item.values.AD - item.values.NC), item.feature]),
        itemStyle: { color: '#0072B2' }, markLine: { symbol: 'none', label: { show: false }, data: [{ xAxis: 0 }] },
        tooltip: { formatter: params => `${escapeTooltipText(params.value[1])}<br/>AD − NC：${precise(params.value[0])}${relative ? ' pp' : ' 源丰度差'}<br/>仅描述差值，不代表统计显著性` } }],
    };
  }
  return base;
}
