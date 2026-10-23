import { HEATMAP_PALETTE_OPTIONS } from './magHeatmapOption';
import { GROUP_COLORS } from '../../components/Charts/groupPalette';
import { researchColors } from './magResearchStyle';

const fmt = value => value == null ? '不可评价' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 5 });
const tip = { trigger: 'item', confine: true, renderMode: 'richText' };
const axis = { axisLine: { lineStyle: { color: '#d9dee7' } }, axisTick: { show: false }, axisLabel: { color: '#526075', fontSize: 11 } };
const base = { animation: false, textStyle: { color: '#526075', fontSize: 11 }, grid: { left: 90, right: 65, top: 40, bottom: 70 } };
const palette = style => HEATMAP_PALETTE_OPTIONS.find(p => p.value === style.palette)?.colors || HEATMAP_PALETTE_OPTIONS[0].colors;
const label = id => id.replace(/__(CRR\d+)_cleanbin_/, ' · ');
const groupColors = style => style.discretePalette && style.discretePalette !== 'current-groups'
  ? Object.fromEntries(['AD', 'NC'].map((group, index) => [group, researchColors({ palette: style.discretePalette }, 'quality')[index]])) : GROUP_COLORS;

function matrixOverlay(id, data, missing = false) {
  return { id, type: 'custom', clip: true, data, encode: { x: 0, y: 1 }, renderItem: (params, api) => {
    const point = api.coord([api.value(0), api.value(1)]), size = api.size([1, 1]), item = data[params.dataIndex];
    return { type: 'rect', shape: { x: point[0] - Math.abs(size[0]) / 2, y: point[1] - Math.abs(size[1]) / 2, width: Math.abs(size[0]), height: Math.abs(size[1]) },
      style: { fill: missing ? '#a2aab5' : item.itemStyle.color, stroke: '#fff', lineWidth: missing ? 1 : 0 } };
  } };
}

function functionalDendrogram(tree, orderedIds, orientation, offset = 0) {
  if (!tree?.merges?.length) return null;
  const positions = new Map(orderedIds.map((id, i) => [id, i + offset]));
  const nodes = tree.leafIds.map(id => ({ index: positions.get(id), distance: 0 })), segments = [];
  const maximum = Math.max(...tree.merges.map(r => r.distance), Number.EPSILON);
  tree.merges.forEach(merge => {
    const a = nodes[merge.left], b = nodes[merge.right];
    const node = { index: (a.index + b.index) / 2, distance: merge.distance };
    segments.push([a.index, a.distance, a.index, node.distance], [a.index, node.distance, b.index, node.distance], [b.index, node.distance, b.index, b.distance]);
    nodes.push(node);
  });
  return { id: `functional-tree-${orientation}`, type: 'custom', silent: true, clip: false,
    data: segments.map(segment => ({ value: [0, 0], segment })),
    renderItem: (params, api) => {
      const segment = segments[params.dataIndex], box = params.coordSys, origin = api.coord([0, 0]);
      const width = Math.abs(api.size([1, 0])[0]), height = Math.abs(api.size([0, 1])[1]);
      const point = (index, distance) => orientation === 'top' ? [origin[0] + index * width, box.y - 8 - distance / maximum * 44]
        : [box.x - 8 - distance / maximum * 44, origin[1] + index * height];
      const a = point(segment[0], segment[1]), b = point(segment[2], segment[3]);
      return { type: 'group', clipPath: { type: 'rect', shape: orientation === 'top' ? { x: box.x, y: box.y - 58, width: box.width, height: 58 }
        : { x: box.x - 58, y: box.y, width: 58, height: box.height } },
      children: [{ type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: '#8793a3', lineWidth: 1 } }] };
    } };
}

export function functionMatrixOption(data, style = {}) {
  const transposed = Boolean(style.transposed), binary = data.valueKind === 'presence';
  const tracks = style.annotations && !transposed ? ['完整度 %', '污染率 %'] : [];
  const columns = transposed ? data.mags.map(r => r.magId) : [...tracks, ...data.features.map(r => r.featureId)];
  const rows = transposed ? data.features.map(r => r.featureId) : data.mags.map(r => r.magId);
  const items = [], missing = [], annotation = [];
  data.values.forEach((row, m) => row.forEach((raw, f) => {
    const point = { id: `${data.mags[m].magId}|${data.namespace}|${data.features[f].featureId}`,
      magId: data.mags[m].magId, featureId: data.features[f].featureId, namespace: data.namespace,
      rawCount: raw, description: data.features[f].description, role: 'cell',
      value: [transposed ? m : f + tracks.length, transposed ? f : m, raw == null ? 0 : binary ? Number(raw > 0) : Math.log1p(raw)] };
    (raw == null ? missing : items).push(point);
  }));
  if (tracks.length) data.mags.forEach((r, i) => tracks.forEach((name, j) => {
    const raw = r.quality?.[j ? 'contaminationPercent' : 'completenessPercent'];
    annotation.push({ magId: r.magId, role: 'annotation', name, rawCount: raw, value: [j, i, raw ?? 0],
      itemStyle: { color: raw == null ? '#9da5ae' : j ? `rgba(164,64,96,${Math.max(.08, Math.min(1, raw / 10))})` : `rgba(40,120,110,${Math.max(.08, raw / 100)})` } });
  }));
  const colors = palette(style);
  const maximum = Math.max(1, ...items.map(d => d.value[2]));
  const trees = style.dendrograms === false ? [] : [
    functionalDendrogram(data.dendrograms?.[transposed ? 'mags' : 'features'], transposed ? data.mags.map(r => r.magId) : data.features.map(r => r.featureId), 'top', tracks.length),
    functionalDendrogram(data.dendrograms?.[transposed ? 'features' : 'mags'], transposed ? data.features.map(r => r.featureId) : data.mags.map(r => r.magId), 'left'),
  ].filter(Boolean);
  const leftTree = trees.some(r => r.id.endsWith('left')), topTree = trees.some(r => r.id.endsWith('top'));
  return { ...base, aria: { enabled: true, decal: { show: false } }, grid: { left: (transposed ? 150 : 210) + (leftTree ? 60 : 0), right: 90, top: topTree ? 102 : 45, bottom: 90 },
    tooltip: { ...tip, show: style.hover !== false, formatter: p => p.data?.role === 'annotation'
      ? `${p.data.magId}\n${p.data.name}：${fmt(p.data.rawCount)}`
      : `${p.data?.magId || ''}\n${p.data?.featureId || ''}\n${p.data?.description || ''}\n注释基因计数：${fmt(p.data?.rawCount)}` },
    xAxis: { ...axis, type: 'category', data: columns, triggerEvent: true, axisLabel: { ...axis.axisLabel, show: style.labels !== false, rotate: 45, width: 115, overflow: 'truncate', formatter: label } },
    yAxis: { ...axis, type: 'category', data: rows, inverse: true, triggerEvent: true, axisLabel: { ...axis.axisLabel, show: style.labels !== false, margin: leftTree ? 68 : 8, width: transposed ? 130 : 190, overflow: 'truncate', formatter: label } },
    visualMap: binary ? { type: 'piecewise', seriesIndex: 0, dimension: 2, right: 0, top: 50,
      pieces: [{ value: 0, label: '本次未命中', color: '#edf0f4' }, { value: 1, label: '命中', color: colors[colors.length - 1] }] }
      : { type: 'continuous', seriesIndex: 0, dimension: 2, min: 0, max: maximum, calculable: false,
        right: 0, top: 'middle', text: ['log1p(计数)', '0'], inRange: { color: colors } },
    series: [{ id: 'functional-values', type: 'heatmap', data: items,
      itemStyle: { borderWidth: style.borders ? .5 : 0, borderColor: '#fff' }, emphasis: { itemStyle: { borderColor: '#a44060', borderWidth: 1 } },
      label: { show: Boolean(style.values) && items.length <= 1500, formatter: p => String(p.data.rawCount), fontSize: Number(style.fontSize || 11) } },
    matrixOverlay('functional-missing', missing, true), matrixOverlay('functional-annotations', annotation), ...trees],
  };
}

export function functionOverviewOption(data, style = {}) {
  const colors = researchColors({ palette: style.discretePalette || 'brewer-paired' }, 'taxonomy');
  const groups = [...new Set(data.items.map(r => r.taxonomy?.phylum || r.domain))].sort();
  return { ...base, tooltip: { ...tip, show: style.hover !== false, formatter: p => `${p.data.magId}\n${p.data.label}\n预测基因：${fmt(p.value[0])}\n联合注释比例：${fmt(p.value[1])}%\n完整度：${fmt(p.data.quality?.completenessPercent)}%` },
    xAxis: { ...axis, type: 'value', name: '预测基因数', min: 0, nameLocation: 'middle', nameGap: 35 },
    yAxis: { ...axis, type: 'value', name: '联合注释基因比例（%）', min: 0, max: 100 },
    legend: { show: style.legend !== false, type: 'scroll', bottom: 0 },
    brush: { toolbox: [], brushMode: 'single', xAxisIndex: 0, yAxisIndex: 0 },
    series: groups.map((group, i) => ({ id: group, name: group, type: 'scatter', symbolSize: Number(style.pointSize || 7),
      itemStyle: { color: colors[i % colors.length], opacity: .75 },
      data: data.items.filter(r => (r.taxonomy?.phylum || r.domain) === group).map(r => ({ ...r, value: [r.geneCount, r.annotationPercent] })) })) };
}

export function functionBarOption(items, style = {}, valueKey = 'carrierCount', unit = '携带 MAG 数') {
  const color = style.discretePalette && style.discretePalette !== 'mag-accent' ? researchColors({ palette: style.discretePalette }, 'quality')[0] : '#a44060';
  return { ...base, grid: { left: 230, right: 55, top: 25, bottom: 60 },
    tooltip: { ...tip, show: style.hover !== false, formatter: p => `${p.data.featureId || p.data.magId}\n${p.data.description || p.data.taxonomyName || ''}\n${unit}：${fmt(p.value)}` },
    xAxis: { ...axis, type: 'value', min: 0, minInterval: 1, name: unit, nameLocation: 'middle', nameGap: 35, splitLine: { show: style.grid !== false, lineStyle: { color: '#e3e9f0', type: 'dashed' } } },
    yAxis: { ...axis, type: 'category', inverse: true, data: items.map(r => r.featureId || r.magId), axisLabel: { ...axis.axisLabel, width: 210, overflow: 'truncate', formatter: label } },
    series: [{ id: 'functional-ranking', type: 'bar', barMaxWidth: 16, itemStyle: { color, borderRadius: [0, 3, 3, 0] },
      label: { show: style.values === true, position: 'right', fontSize: 11 }, data: items.map(r => ({ ...r, value: r[valueKey] })) }] };
}

export function geneTrackOption(items, style = {}, regions = false) {
  const groups = [...new Set(items.map(r => r.contigId))];
  const values = items.map((r, i) => ({ ...r, value: [Math.min(r.start, r.end), Math.max(r.start, r.end), groups.indexOf(r.contigId), r.strand || 0], id: r.geneId || r.id || String(i) }));
  return { ...base, grid: { left: 140, right: 45, top: 35, bottom: 85 },
    tooltip: { ...tip, show: style.hover !== false, formatter: p => `${p.data.geneId || p.data.id}\n${p.data.contigId}\n原坐标：${p.data.start}–${p.data.end}\n${regions ? p.data.products.join(', ') : `链向：${p.data.strand}`}` },
    xAxis: { ...axis, type: 'value', scale: true, name: 'Contig 原始坐标（bp）', nameLocation: 'middle', nameGap: 35 },
    yAxis: { ...axis, type: 'category', data: groups, inverse: true, axisLabel: { ...axis.axisLabel, width: 120, overflow: 'truncate' } },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter', zoomOnMouseWheel: 'alt' }, { type: 'slider', xAxisIndex: 0, filterMode: 'weakFilter', bottom: 5, height: 22 }],
    series: [{ id: regions ? 'bgc-regions' : 'gene-track', type: 'custom', clip: true,
      encode: { x: [0, 1], y: 2 }, data: values,
      renderItem: (_params, api) => {
        const a = api.coord([api.value(0), api.value(2)]), b = api.coord([api.value(1), api.value(2)]);
        const h = Math.min(18, Math.abs(api.size([0, 1])[1]) * .55), w = Math.max(.8, b[0] - a[0]), head = Math.min(7, w / 2);
        const reverse = api.value(3) === -1;
        const points = regions ? [[a[0], a[1] - h / 2], [b[0], a[1] - h / 2], [b[0], a[1] + h / 2], [a[0], a[1] + h / 2]]
          : reverse ? [[a[0], a[1]], [a[0] + head, a[1] - h / 2], [b[0], a[1] - h / 2], [b[0], a[1] + h / 2], [a[0] + head, a[1] + h / 2]]
            : [[a[0], a[1] - h / 2], [b[0] - head, a[1] - h / 2], [b[0], a[1]], [b[0] - head, a[1] + h / 2], [a[0], a[1] + h / 2]];
        return { type: 'polygon', shape: { points }, style: { fill: '#a44060', opacity: .8 } };
      } }] };
}

export function coverageOption(data, style = {}, metric = 'coveredFraction') {
  const colors = groupColors(style);
  return { ...base, tooltip: { ...tip, show: style.hover !== false, formatter: p => `${p.data.sampleId} · ${p.data.disease}\n丰度 ${fmt(p.data.abundancePercent)}%\n覆盖广度 ${fmt(p.data.coveredFraction * 100)}%\n平均深度 ${fmt(p.data.meanCoverage)}×\nReads ${fmt(p.data.readCount)}` },
    xAxis: { ...axis, type: 'value', name: 'MAG 相对丰度（%）', nameLocation: 'middle', nameGap: 35, min: 0 },
    yAxis: { ...axis, type: 'value', name: metric === 'coveredFraction' ? '覆盖广度（%）' : '平均深度（×）', min: 0, ...(metric === 'coveredFraction' ? { max: 100 } : {}) },
    legend: { data: ['AD', 'NC'] }, series: ['AD', 'NC'].map(group => ({ id: group, name: group, type: 'scatter',
      symbol: group === 'AD' ? 'circle' : 'diamond', symbolSize: Number(style.pointSize || 8), itemStyle: { color: colors[group], opacity: .75 },
      data: data.items.filter(r => r.disease === group).map(r => ({ ...r, value: [r.abundancePercent, metric === 'coveredFraction' ? r.coveredFraction * 100 : r.meanCoverage] })) })) };
}

export function phylogenyTrackOption(tree, matrix, style = {}, mode = 'topology') {
  const leaves = [], segments = [], leafPoints = [];
  const visit = (node, depth, distance) => {
    const x = mode === 'length' ? distance : depth;
    if (!node.children?.length) {
      const y = leaves.length; leaves.push(node.name); leafPoints.push({ magId: node.name, value: [x, y], role: 'leaf' }); return { x, y };
    }
    const children = node.children.map(child => visit(child, depth + 1, distance + (Number(child.branchLength) || 0)));
    const y = children.reduce((sum, child) => sum + child.y, 0) / children.length;
    segments.push([x, Math.min(...children.map(c => c.y)), x, Math.max(...children.map(c => c.y))]);
    children.forEach(child => segments.push([x, child.y, child.x, child.y]));
    return { x, y };
  };
  visit(tree.tree, 0, 0);
  const index = new Map(matrix?.mags.map((r, i) => [r.magId, i]) || []);
  const fields = [{ featureId: '完整度 %', role: 'quality' }, { featureId: '污染率 %', role: 'quality' }, ...(matrix?.features || [])];
  const cells = leaves.flatMap((mid, y) => fields.map((f, x) => {
    const i = index.get(mid), value = i == null ? null : x < 2 ? matrix.mags[i].quality?.[x === 0 ? 'completenessPercent' : 'contaminationPercent'] ?? null : matrix.values[i][x - 2];
    return { magId: mid, featureId: f.role === 'quality' ? '' : f.featureId, name: f.featureId, role: f.role || 'function', rawCount: value, value: [x, y, value] };
  }));
  const axisY = { ...axis, type: 'value', inverse: true, min: -.5, max: leaves.length - .5, interval: 1,
    splitLine: { show: false }, axisLabel: { show: false } };
  return { ...base, grid: [{ left: 20, right: '60%', top: 35, bottom: 85 }, { left: '62%', right: 30, top: 35, bottom: 85 }],
    tooltip: { ...tip, show: style.hover !== false, formatter: p => p.data?.role === 'leaf' ? p.data.magId : p.data?.magId ? `${p.data.magId}\n${p.data.name}\n${p.data.role === 'quality' ? '来源值' : '基因计数'}：${fmt(p.data.rawCount)}` : 'IQ-TREE 原始拓扑分支' },
    xAxis: [{ ...axis, type: 'value', name: mode === 'length' ? '累计分支长度' : '拓扑层级', splitLine: { show: false } },
      { ...axis, type: 'value', gridIndex: 1, min: -.5, max: Math.max(.5, fields.length - .5), interval: 1,
        axisLabel: { ...axis.axisLabel, rotate: 45, formatter: value => fields[value]?.featureId || '' } }],
    yAxis: [axisY, { ...axisY, gridIndex: 1 }],
    dataZoom: [{ type: 'inside', yAxisIndex: [0, 1], filterMode: 'none', zoomOnMouseWheel: 'alt' },
      { type: 'slider', yAxisIndex: [0, 1], filterMode: 'none', right: 0, top: 35, bottom: 85, width: 16 }],
    series: [{ id: 'phylogeny-branches', type: 'custom', silent: true, clip: true, data: segments,
      renderItem: (_p, api) => { const a = api.coord([api.value(0), api.value(1)]), b = api.coord([api.value(2), api.value(3)]);
        return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: '#7e8493', lineWidth: 1 } }; } },
    { id: 'phylogeny-leaves', type: 'custom', clip: true, data: leafPoints, renderItem: (p, api) => {
      const point = api.coord([api.value(0), api.value(1)]), pitch = Math.abs(api.size([0, 1])[1]);
      const datum = leafPoints[p.dataIndex];
      return { type: 'group', children: [{ type: 'circle', shape: { cx: point[0], cy: point[1], r: 3 }, style: { fill: '#a44060' } },
        ...(style.labels !== false && pitch >= 12 ? [{ type: 'text', style: { x: point[0] + 6, y: point[1], text: label(datum.magId), fill: '#526075', fontSize: Number(style.fontSize || 11), verticalAlign: 'middle', width: Math.min(130, p.coordSys.width * .45), overflow: 'truncate' } }] : [])] };
    } },
    { id: 'phylogeny-functions', type: 'custom', xAxisIndex: 1, yAxisIndex: 1, clip: true, data: cells,
      renderItem: (params, api) => { const point = api.coord([api.value(0), api.value(1)]), size = api.size([1, 1]), value = cells[params.dataIndex].rawCount;
        return { type: 'rect', shape: { x: point[0] - size[0] / 2, y: point[1] - Math.abs(size[1]) / 2, width: size[0], height: Math.abs(size[1]) },
          style: { fill: value == null ? '#a2aab5' : api.value(0) === 0 ? `rgba(40,120,110,${Math.max(.08, value / 100)})` : api.value(0) === 1 ? `rgba(164,64,96,${Math.max(.08, Math.min(1, value / 10))})` : value > 0 ? '#a44060' : '#edf0f4' } }; } }],
  };
}

export function signalOption(data, style = {}) {
  const groups = ['AD', 'NC'];
  const colors = groupColors(style);
  return { ...base, legend: { data: groups }, tooltip: { ...tip, show: style.hover !== false, formatter: p => `${p.data.sampleId}\n${fmt(p.value[1])} ${data.unit}` },
    xAxis: { ...axis, type: 'category', data: groups }, yAxis: { ...axis, type: 'value', name: data.unit, min: 0 },
    series: groups.map((group, i) => ({ name: group, type: 'scatter', symbolSize: Number(style.pointSize || 7),
      symbol: group === 'AD' ? 'circle' : 'diamond', itemStyle: { color: colors[group], opacity: .7 }, data: data.samples.filter(r => r.disease === group).map(r => ({ ...r, value: [i, r.value], symbolOffset: [([...r.sampleId].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 0) % 17 - 8) * 2, 0] })) })) };
}

export function themeEvidenceOption(data, style = {}) {
  const row = data.values[data.selectedIndex || 0] || [];
  const fields = data.features.map((r, i) => ({ ...r, magId: data.mags[data.selectedIndex || 0]?.magId,
    namespace: data.namespace, rawCount: row[i], value: [i % 3, Math.floor(i / 3)] }));
  return { ...base, grid: { left: 20, right: 20, top: 25, bottom: 25 },
    xAxis: { type: 'value', min: -.6, max: 2.6, show: false }, yAxis: { type: 'value', min: -.6, max: Math.max(.6, Math.ceil(fields.length / 3) - .4), inverse: true, show: false },
    tooltip: { ...tip, show: style.hover !== false, formatter: p => `${p.data.featureId}\n${p.data.description}\n注释基因计数：${fmt(p.data.rawCount)}` },
    series: [{ id: 'theme-genes', type: 'custom', data: fields,
      renderItem: (params, api) => {
        const point = api.coord([api.value(0), api.value(1)]), size = api.size([.9, .7]), field = fields[params.dataIndex];
        return { type: 'group', children: [{ type: 'rect', shape: { x: point[0] - size[0] / 2, y: point[1] - Math.abs(size[1]) / 2, width: size[0], height: Math.abs(size[1]), r: 5 }, style: { fill: field.rawCount > 0 ? '#f0e3e9' : '#edf0f4', stroke: '#d9dee7', lineWidth: 1 } },
          ...(style.labels === false ? [] : [{ type: 'text', style: { x: point[0], y: point[1], text: `${field.featureId}\n${field.rawCount > 0 ? `${field.rawCount} 个注释基因` : '本次未命中'}`, fontSize: Number(style.fontSize || 11), lineHeight: 18, fill: '#526075', align: 'center', verticalAlign: 'middle' } }])] };
      } }] };
}

export function coverageSensitivityOption(data, style = {}) {
  const colors = groupColors(style);
  return { ...base, tooltip: { ...tip, trigger: 'axis', show: style.hover !== false }, legend: { data: ['AD', 'NC'] },
    xAxis: { ...axis, type: 'value', min: 0, max: 100, name: '覆盖广度参考阈值（%）', nameLocation: 'middle', nameGap: 35 },
    yAxis: { ...axis, type: 'value', min: 0, minInterval: 1, name: '满足阈值的样本数' },
    series: ['AD', 'NC'].map(group => ({ id: group, name: group, type: 'line', symbol: 'none', step: 'end', lineStyle: { color: colors[group], type: group === 'AD' ? 'solid' : 'dashed' },
      data: Array.from({ length: 101 }, (_, threshold) => [threshold, data.items.filter(r => r.disease === group && r.coveredFraction * 100 >= threshold).length]) })) };
}

export function comparisonDistributionOption(data, style = {}) {
  const colors = groupColors(style);
  const columns = style.containerWidth > 900 ? 2 : 1;
  const slot = style.containerHeight ? style.containerHeight / Math.max(1, Math.ceil(data.items.length / columns)) : 270;
  const grid = [], xAxis = [], yAxis = [], series = [], title = [];
  data.items.forEach((item, index) => {
    const row = Math.floor(index / columns), col = index % columns;
    const top = row * slot + 45;
    grid.push({ left: `${col * 50 + (columns === 1 ? 10 : 7)}%`, width: columns === 1 ? '84%' : '38%', top, height: Math.max(25, slot - 95) });
    title.push({ text: item.feature.taxonomyName || item.magId, subtext: item.magId, left: `${col * 50 + 7}%`, top: row * slot + 2,
      textStyle: { fontSize: 12, color: '#172033', fontWeight: 500 }, subtextStyle: { fontSize: 10, color: '#526075', width: 270, overflow: 'truncate' } });
    xAxis.push({ ...axis, type: 'category', gridIndex: index, data: ['AD', 'NC'] });
    yAxis.push({ ...axis, type: 'value', gridIndex: index, min: 0, name: '相对丰度（%）' });
    series.push({ id: `box-${item.magId}`, type: 'boxplot', xAxisIndex: index, yAxisIndex: index, boxWidth: [25, 50],
      data: ['AD', 'NC'].map(group => { const box = item.boxes.find(b => b.group === group); return box ? { value: box.values, itemStyle: { color: `${colors[group]}30`, borderColor: colors[group] } } : { value: [null, null, null, null, null] }; }) });
    ['AD', 'NC'].forEach((group, i) => series.push({ id: `points-${item.magId}-${group}`, name: group, type: 'scatter', xAxisIndex: index, yAxisIndex: index, symbolSize: 4,
      symbol: group === 'AD' ? 'circle' : 'diamond', itemStyle: { color: colors[group], opacity: .6 }, data: item.samples.filter(s => s.disease === group).map(s => ({ ...s, magId: item.magId,
        value: [i, s.abundancePercent], symbolOffset: [([...s.sampleId].reduce((n, c) => n * 31 + c.charCodeAt(0), 0) % 17 - 8) * 2, 0] })) }));
  });
  return { ...base, grid, xAxis, yAxis, title, series,
    tooltip: { ...tip, show: style.hover !== false, formatter: p => p.data?.sampleId ? `${p.data.magId}\n${p.data.sampleId} · ${p.data.disease}\n${fmt(p.data.abundancePercent)}%` : '箱体：后端分位数与 1.5×IQR 须；散点含零丰度。' } };
}
