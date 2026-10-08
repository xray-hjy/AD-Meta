import { GROUP_COLORS } from '../../components/Charts/groupPalette';
import { dendrogramSegments, heatmapTrees, treeMaximum, TREE_DEPTH, TREE_SPACE } from './magDendrogram';
import { interpolateViridis, interpolateCividis, interpolateMagma, interpolateBlues, interpolatePuBuGn, interpolateYlOrBr,
  interpolateRdBu, interpolateBrBG, interpolatePuOr, interpolatePRGn } from 'd3';

const sample = (interpolate, start = 0, end = 1) => Array.from({ length: 17 }, (_, i) => interpolate(start + (end - start) * i / 16));
// ColorBrewer / Matplotlib families, sampled from d3-scale-chromatic.
// Pale ends of the three Brewer sequential families are omitted explicitly.
export const HEATMAP_PALETTE_OPTIONS = [
  { value: 'pubugn', label: 'PuBuGn · 紫蓝—青绿（去浅端）', shortLabel: 'PuBuGn', colors: sample(interpolatePuBuGn, 0.15) },
  { value: 'blues', label: 'Blues · 单色蓝（去浅端）', shortLabel: 'Blues', colors: sample(interpolateBlues, 0.15) },
  { value: 'viridis', label: 'Viridis · 紫—绿—黄', shortLabel: 'Viridis', colors: sample(interpolateViridis) },
  { value: 'cividis', label: 'Cividis · 蓝灰—金黄', shortLabel: 'Cividis', colors: sample(interpolateCividis) },
  { value: 'magma', label: 'Magma · 深紫—红—浅黄', shortLabel: 'Magma', colors: sample(interpolateMagma) },
  { value: 'ylorbr', label: 'YlOrBr · 黄—橙—棕（去浅端）', shortLabel: 'YlOrBr', colors: sample(interpolateYlOrBr, 0.15) },
];
export const ROW_Z_PALETTE_OPTIONS = [
  { value: 'rdbu', label: 'RdBu_r · 蓝—浅灰—红', shortLabel: 'RdBu_r', colors: sample(interpolateRdBu, 1, 0) },
  { value: 'brbg', label: 'BrBG · 棕—浅灰—青绿', shortLabel: 'BrBG', colors: sample(interpolateBrBG) },
  { value: 'puor', label: 'PuOr · 橙—浅灰—紫', shortLabel: 'PuOr', colors: sample(interpolatePuOr) },
  { value: 'prgn', label: 'PRGn · 紫—浅灰—绿', shortLabel: 'PRGn', colors: sample(interpolatePRGn) },
];
export const HEATMAP_PALETTES = Object.fromEntries(HEATMAP_PALETTE_OPTIONS.map(p => [p.value, p.colors]));
export const ROW_Z_PALETTES = Object.fromEntries(ROW_Z_PALETTE_OPTIONS.map(p => [p.value, p.colors]));
export const ROW_Z_PALETTE = ROW_Z_PALETTES.rdbu;
export const HEATMAP_STYLE_DEFAULTS = { palette: 'pubugn', divergingPalette: 'rdbu', annotations: true, demographics: false, labels: true, borders: false, dendrograms: true, font: 'standard', transposed: false };
export function heatmapColors(style, isZScore) {
  return isZScore ? ROW_Z_PALETTES[style.divergingPalette] || ROW_Z_PALETTE : HEATMAP_PALETTES[style.palette] || HEATMAP_PALETTES.pubugn;
}
const BATCH_COLORS = ['#a8805c', '#8f81ad', '#77a388', '#729cb6', '#9d949b'];
const shortMag = id => id.replace(/__(CRR\d+)_cleanbin_/, ' · ');
const format = value => value == null ? '缺失' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });

// Fill wider viewports by scaling both cell dimensions. The natural size is the
// minimum for scrolling in narrow viewports; fitted exports use a bounded canvas.
export function magHeatmapLayout(sampleCount, rowCount, preferences = {}, viewportWidth = 0, trees = { top: [], left: [] }) {
  const style = { ...HEATMAP_STYLE_DEFAULTS, ...preferences };
  const annotationCount = style.annotations ? (style.demographics ? 4 : 2) : 0;
  const top = (!style.transposed && annotationCount ? 64 + annotationCount * 15 : 62) + (trees.top.length ? TREE_SPACE : 0);
  const left = 275 + (style.transposed && annotationCount ? annotationCount * 15 + 8 : 0) + (trees.left.length ? TREE_SPACE : 0);
  const columns = Math.max(1, style.transposed ? rowCount : sampleCount);
  const rows = Math.max(1, style.transposed ? sampleCount : rowCount);
  const plotWidth = Math.max(columns * 20, viewportWidth - left - 45);
  const plotHeight = rows * (plotWidth / columns) * 1.1;
  return { left, top, plotWidth, plotHeight, width: plotWidth + left + 45, height: top + plotHeight + 90 };
}

// Fit the full matrix while keeping text, annotation strips and tree depth in
// output pixels, just as the interactive viewport does when fitting the chart.
export function magHeatmapExportLayout(sampleCount, rowCount, preferences = {}, width = 1800, height = 1000, trees = { top: [], left: [] }) {
  const natural = magHeatmapLayout(sampleCount, rowCount, preferences, 0, trees);
  const availableWidth = Math.max(1, width - natural.left - 45);
  const availableHeight = Math.max(1, height - natural.top - 100);
  const scale = Math.min(availableWidth / natural.plotWidth, availableHeight / natural.plotHeight);
  const plotWidth = natural.plotWidth * scale, plotHeight = natural.plotHeight * scale;
  return { ...natural, left: natural.left + (availableWidth - plotWidth) / 2,
    top: natural.top + (availableHeight - plotHeight) / 2, plotWidth, plotHeight, width, height,
    headerOffset: (availableHeight - plotHeight) / 2 };
}

export function buildMagHeatmapOption(data, preferences = {}, { start = 0, count = data.magIds.length, width = 0, height = 0, fit = false } = {}) {
  const style = { ...HEATMAP_STYLE_DEFAULTS, ...preferences };
  const z = data.settings?.colorMode === 'rowZ';
  const colors = heatmapColors(style, z);
  const shown = data.magIds.slice(start, start + count);
  const features = new Map((data.features || []).map(row => [row.magId, row]));
  const constant = new Set(data.constantMagIds || []);
  const display = data.displayValues || data.values.map(row => row.map(v => v == null ? null : Math.log10(1 + v)));
  let min = 0, max = 0.001;
  display.forEach(row => row.forEach(v => { if (v != null && Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); } }));
  if (z) { max = Math.max(Math.abs(min), max, 1); min = -max; }
  const annotationRows = style.annotations ? ['疾病', '批次', ...(style.demographics ? ['年龄', '性别'] : [])] : [];
  const trees = heatmapTrees(data, style);
  const layout = fit ? magHeatmapExportLayout(data.samples.length, shown.length, style, width || 1800, height || 1000, trees)
    : magHeatmapLayout(data.samples.length, shown.length, style, width, trees);
  const { top } = layout;
  const cells = data.samples.flatMap((sample, x) => shown.map((id, y) => {
    const v = display[x][start + y];
    if (v == null || !Number.isFinite(v)) return { value: [x, y, min], itemStyle: { color: '#8f929b' } };
    return z && constant.has(id) ? { value: [x, y, 0], itemStyle: { color: colors[8] } } : [x, y, v];
  }));
  const labelSize = { small: 9, standard: 11, large: 13 }[style.font] || 11;
  const label = id => {
    const name = features.get(id)?.taxonomyName;
    const text = name ? `${name} · ${shortMag(id)}` : shortMag(id);
    return text.length > 36 ? `${text.slice(0, 35)}…` : text;
  };
  const tooltip = { trigger: 'item', renderMode: 'richText', confine: true, formatter: p => {
    const [x, y] = p.value;
    const sample = data.samples[x];
    if (!sample) return '';
    const identity = `${sample.sampleId} · ${sample.disease} · Batch ${sample.batch}\n年龄 ${sample.age ?? '—'} · 性别 ${sample.gender ?? '—'}`;
    if (p.seriesIndex > 0) return identity;
    const id = shown[y];
    const row = features.get(id);
    return `${identity}\n${id}${row?.taxonomyName ? `\n${row.taxonomyName}` : ''}\n原始丰度 ${format(data.values[x][start + y])}%\n${z ? `行 Z-score ${format(display[x][start + y])}${constant.has(id) ? '（无变异）' : ''}` : `log10(1 + 丰度%) ${format(display[x][start + y])}`}\n点击查看该 MAG 分布与证据`;
  } };
  const x = { type: 'category', data: data.samples.map(s => s.sampleId), splitArea: { show: false },
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { show: style.labels, rotate: 45, fontSize: labelSize - 1, interval: Math.max(0, Math.ceil(data.samples.length / 24) - 1) } };
  const grid = [{ left: layout.left, width: layout.plotWidth, top, height: layout.plotHeight }];
  const xAxis = [x];
  const yAxis = [{ type: 'category', inverse: true, data: shown, axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { show: style.labels, formatter: label, fontSize: labelSize, width: 250, overflow: 'truncate', margin: trees.left.length ? TREE_SPACE + 8 : 8 } }];
  const series = [{ name: 'MAG 丰度', type: 'heatmap', progressive: 0, xAxisIndex: 0, yAxisIndex: 0, data: cells,
    itemStyle: { borderWidth: style.borders ? 0.5 : 0, borderColor: '#727d8660' }, emphasis: { itemStyle: { borderColor: '#485265', borderWidth: 1 } } }];
  if (data.settings?.sampleOrder !== 'cluster') {
    const boundary = data.samples.findIndex((s, i) => i > 0 && s.disease !== data.samples[i - 1].disease);
    if (boundary > 0) series[0].markLine = { silent: true, symbol: 'none', label: { show: false },
      lineStyle: { color: '#586677', type: 'dashed', width: 1 }, data: [{ xAxis: boundary - 0.5 }] };
  }
  if (annotationRows.length) {
    grid.push({ left: layout.left, width: layout.plotWidth, top: 47 + (layout.headerOffset || 0), height: annotationRows.length * 15 });
    xAxis.push({ ...x, gridIndex: 1, axisLabel: { show: false } });
    yAxis.push({ type: 'category', gridIndex: 1, inverse: true, data: annotationRows, axisLabel: { fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false } });
    const ages = data.samples.map(s => s.age).filter(Number.isFinite);
    const ageMin = Math.min(...ages), ageMax = Math.max(...ages);
    series.push({ name: '样本注释', type: 'heatmap', xAxisIndex: 1, yAxisIndex: 1, progressive: 0,
      data: data.samples.flatMap((s, x) => annotationRows.map((label, y) => {
        const color = label === '疾病' ? GROUP_COLORS[s.disease] : label === '批次' ? BATCH_COLORS[(Number(s.batch) - 1) % 5]
          : label === '性别' ? (s.gender === 'F' ? '#957698' : '#6d9ba5')
            : Number.isFinite(s.age) ? `hsl(38 40% ${78 - 35 * ((s.age - ageMin) / (ageMax - ageMin || 1))}%)` : '#8f929b';
        return { value: [x, y, 1], itemStyle: { color } };
      })) });
  }
  if (style.transposed) {
    const transposeCell = cell => Array.isArray(cell) ? [cell[1], cell[0], cell[2]]
      : { ...cell, value: [cell.value[1], cell.value[0], cell.value[2]] };
    series[0].data = cells.map(transposeCell);
    xAxis[0] = { ...x, data: shown, axisLabel: { ...x.axisLabel, formatter: id => {
      const text = label(id); return text.length > 20 ? `${text.slice(0, 19)}…` : text;
    }, interval: Math.max(0, Math.ceil(shown.length / 24) - 1) } };
    yAxis[0] = { ...yAxis[0], data: data.samples.map(s => s.sampleId), axisLabel: { show: style.labels, fontSize: labelSize,
      margin: annotationRows.length * 15 + 16 + (trees.left.length ? TREE_SPACE : 0), width: 250, overflow: 'truncate' } };
    if (series[0].markLine) series[0].markLine.data = series[0].markLine.data.map(item => ({ yAxis: item.xAxis }));
    if (annotationRows.length) {
      grid[1] = { left: layout.left - annotationRows.length * 15 - 8, width: annotationRows.length * 15, top, height: layout.plotHeight };
      xAxis[1] = { ...xAxis[1], data: annotationRows, position: 'top', axisLabel: { show: true, fontSize: 9, rotate: 90, interval: 0, margin: 5 } };
      yAxis[1] = { ...yAxis[1], data: data.samples.map(s => s.sampleId), axisLabel: { show: false } };
      series[1].data = series[1].data.map(transposeCell);
    }
    const formatter = tooltip.formatter;
    tooltip.formatter = p => formatter({ ...p, value: [p.value[1], p.value[0], p.value[2]] });
  }
  if (fit) {
    // Sparse labels stay readable; this never filters matrix cells or leaves.
    const columnStep = Math.max(1, Math.ceil(68 / (layout.plotWidth / Math.max(1, xAxis[0].data.length))));
    const rowStep = Math.max(1, Math.ceil((labelSize + 4) / (layout.plotHeight / Math.max(1, yAxis[0].data.length))));
    xAxis[0].axisLabel = { ...xAxis[0].axisLabel, interval: columnStep - 1, hideOverlap: true, color: '#64748b' };
    yAxis[0].axisLabel = { ...yAxis[0].axisLabel, interval: rowStep - 1, hideOverlap: true, color: '#64748b' };
  }
  const graphic = [];
  for (const orientation of ['top', 'left']) {
    const ids = orientation === 'top' ? xAxis[0].data : yAxis[0].data;
    const step = (orientation === 'top' ? layout.plotWidth : layout.plotHeight) / Math.max(1, ids.length);
    const origin = orientation === 'top' ? layout.left : layout.top;
    const annotationWidth = style.transposed ? annotationRows.length * 15 + (annotationRows.length ? 8 : 0) : 0;
    const baseline = orientation === 'top' ? layout.top - 8 : layout.left - annotationWidth - 8;
    const maxDistance = treeMaximum(trees[orientation]);
    trees[orientation].forEach((tree, group) => dendrogramSegments(tree, ids, {
      orientation, center: i => origin + (i + .5) * step, baseline, depth: TREE_DEPTH, maxDistance,
    }).forEach(segment => graphic.push({ id: `tree-${orientation}-${group}-${segment.id}`, type: 'polyline', silent: true,
      shape: { points: segment.points }, style: { stroke: '#64748b', lineWidth: 1, fill: 'none' }, z: 5 })));
  }
  return { animation: false, aria: { enabled: true, decal: { show: false } }, tooltip, grid, xAxis, yAxis, graphic,
    visualMap: [{ min, max, orient: 'horizontal', left: layout.left, top: 6 + (layout.headerOffset || 0), seriesIndex: 0, calculable: false,
      itemWidth: 12, itemHeight: 140, textStyle: { fontSize: 10, color: '#64748b' },
      text: z ? [`+${format(max)} · 按 MAG 标准化 Z-score`, `${format(min)}`] : [`${format(max)} · log10(1 + 丰度%)`, '0'],
      inRange: { color: colors } },
      ...(annotationRows.length ? [{ show: false, seriesIndex: 1, min: 0, max: 1, inRange: { color: ['#9d949b', '#9d949b'] } }] : [])], series };
}
