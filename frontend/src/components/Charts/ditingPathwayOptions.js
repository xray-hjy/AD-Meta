import { escapeTooltipText as esc } from '../../utils/tooltipHtml';
import { density, empiricalCdf, formatPathwayValue as fmt, formatProbability as prob,
  GROUPS, shortPathway, summarize, swarmOffsets, transformValue, zScores, clusterOrder } from './ditingPathwayMath';

export const PATHWAY_VIEWS = {
  overview: [['coverage', '覆盖率—丰度'], ['dumbbell', '分组均值哑铃'], ['heatmap', '聚类热图']],
  effects: [['forest', '效应森林图'], ['significance', '效应—显著性']],
  distribution: [['raincloud', '雨云图'], ['violin', '小提琴图'], ['swarm', '箱线＋蜂群'], ['ecdf', 'ECDF'], ['ridge', '山脊图']],
};
export const HEAT_PALETTES = [
  { value: 'blueRed', label: '蓝—白—红', shortLabel: '蓝—白—红', colors: ['#466ba6', '#f7f9fb', '#b6495b'] },
  { value: 'purpleGreen', label: '紫—白—绿', shortLabel: '紫—白—绿', colors: ['#762a83', '#f7f7f7', '#1b7837'] },
  { value: 'brownTeal', label: '棕—白—青', shortLabel: '棕—白—青', colors: ['#a6611a', '#f5f5f5', '#018571'] },
];
const tip = { confine: true, trigger: 'item' };
const axis = { axisTick: { show: false }, axisLine: { lineStyle: { color: '#b6c4ce' } }, splitLine: { lineStyle: { color: '#e5ebf0', type: 'dashed' } } };
const base = () => ({ animation: false, tooltip: tip, grid: { left: 290, right: 65, top: 50, bottom: 64 },
  textStyle: { fontFamily: 'Inter, Microsoft YaHei, sans-serif', color: '#566477' } });
const rowAxis = (items, style = {}) => ({ ...axis, type: 'category', inverse: true, data: items.map(item => style.fullNames ? item.name : shortPathway(item.name)),
  axisLine: { show: false }, axisLabel: { hideOverlap: true, ...(style.fullNames ? { width: 325, overflow: 'break', lineHeight: Number(style.fontSize || 11) + 2 } : {}) }, splitLine: { show: false } });
const effectTip = item => `${esc(item.name)}<br/>Cliff’s δ ${item.effect.toFixed(3)} · 95% CI [${item.ci.map(v => v.toFixed(3)).join(', ')}]<br/>p ${prob(item.pValue)} · BH q ${prob(item.qValue)}<br/>AD 均值 ${fmt(item.groups.AD.mean)} · NC 均值 ${fmt(item.groups.NC.mean)}`;
const refLine = data => ({ silent: true, symbol: 'none', label: { show: false }, data, lineStyle: { color: '#7b8b9b', type: 'dashed' } });

function coverage(items, style, colors) {
  const zeros = items.filter(item => item.values.every(value => value === 0));
  const max = Math.max(.01, ...items.map(item => Math.abs(item.effect)));
  const option = { ...base(), grid: { left: 85, right: 100, top: 45, bottom: 70 },
    xAxis: { ...axis, type: 'value', min: 0, max: 100, name: '非零样本比例（%）', nameLocation: 'middle', nameGap: 34 },
    yAxis: { ...axis, type: 'value', min: 0, name: 'log10(全队列平均丰度 + 1)', nameGap: 22 },
    visualMap: { min: -max, max, dimension: 2, seriesIndex: 0, precision: 2, right: 8, top: 'center',
      text: ['AD 倾向较高', 'NC 倾向较高'], inRange: { color: [colors.NC, '#dce3e6', colors.AD] } },
    series: [{ type: 'scatter', name: '通路指标', encode: { x: 0, y: 1 },
      data: items.filter(item => !zeros.includes(item)).map(item => ({ name: item.name, pathwayId: item.id,
        value: [item.values.filter(value => value > 0).length / item.values.length * 100, Math.log10(item.mean + 1), item.effect],
        tooltip: { formatter: () => `${effectTip(item)}<br/>非零样本 ${item.values.filter(value => value > 0).length}/${item.values.length}` } })) },
    ...(zeros.length ? [{ type: 'scatter', name: '全零指标', symbol: 'diamond',
      data: [{ name: `${zeros.length} 项全零指标`, pathwayIds: zeros.map(item => item.id), value: [0, 0],
        tooltip: { formatter: () => `${zeros.length} 项全零指标合并在原点；点击定位结果列表。<br/>${zeros.slice(0, 7).map(item => esc(item.name)).join('<br/>')}${zeros.length > 7 ? '<br/>…完整名称见结果列表' : ''}` } }],
      itemStyle: { color: '#81919d' } }] : [])] };
  return option;
}

function dumbbell(items, colors, transform, group, style) {
  const fn = value => transformValue(value, transform), groups = group === 'all' ? GROUPS : [group];
  return { ...base(), legend: { data: groups, top: 4 },
    xAxis: { ...axis, type: 'value', min: 0, name: transform === 'log' ? 'log10(组平均丰度 + 1)' : '组平均丰度（DiTing 原值）', nameLocation: 'middle', nameGap: 35 },
    yAxis: rowAxis(items, style), tooltip: { ...tip, formatter: p => effectTip(items[p.dataIndex]) },
    series: [...(groups.length === 2 ? [{ type: 'custom', name: '组均值连接', silent: true, clip: true, encode: { x: [0, 2], y: 1 },
      data: items.map((item, index) => [fn(item.groups.AD.mean), index, fn(item.groups.NC.mean)]),
      renderItem: (_p, api) => { const a = api.coord([api.value(0), api.value(1)]), b = api.coord([api.value(2), api.value(1)]);
        return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: '#a7b5c0', lineWidth: 2 } }; } }] : []),
    ...groups.map(g => ({ type: 'scatter', name: g, itemStyle: { color: colors[g] },
      data: items.map((item, index) => ({ pathwayId: item.id, name: item.name, value: [fn(item.groups[g].mean), index], labelText: fmt(item.groups[g].mean) })) }))] };
}

function forest(items, colors, style) {
  return { ...base(), xAxis: { ...axis, type: 'value', min: -1, max: 1, name: '← NC 较高                 Cliff’s δ                 AD 较高 →', nameLocation: 'middle', nameGap: 35 },
    yAxis: rowAxis(items, style), tooltip: { ...tip, formatter: p => effectTip(items[p.dataIndex]) },
    series: [{ type: 'custom', name: '95% CI', clip: true, encode: { x: [0, 2], y: 1 },
      data: items.map((item, i) => ({ pathwayId: item.id, value: [item.ci[0], i, item.ci[1]] })),
      renderItem: (p, api) => { const a = api.coord([api.value(0), api.value(1)]), b = api.coord([api.value(2), api.value(1)]);
        const stroke = colors[items[p.dataIndex].effect >= 0 ? 'AD' : 'NC'];
        return { type: 'group', children: [{ type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke, lineWidth: 2 } },
          ...[a, b].map(point => ({ type: 'line', shape: { x1: point[0], y1: point[1] - 4, x2: point[0], y2: point[1] + 4 }, style: { stroke } }))] }; } },
    { type: 'scatter', name: 'Cliff’s δ', markLine: style.reference ? refLine([{ xAxis: 0 }]) : undefined,
      data: items.map((item, i) => ({ pathwayId: item.id, name: item.name, labelText: item.effect.toFixed(3), value: [item.effect, i],
        itemStyle: { color: item.qValue < .05 ? colors[item.effect >= 0 ? 'AD' : 'NC'] : '#fff',
          borderColor: colors[item.effect >= 0 ? 'AD' : 'NC'], borderWidth: 2 } })) }] };
}

function significance(items, colors, style) {
  return { ...base(), grid: { left: 85, right: 50, top: 45, bottom: 65 },
    xAxis: { ...axis, type: 'value', min: -1, max: 1, name: 'Cliff’s δ（正值：AD 倾向较高）', nameLocation: 'middle', nameGap: 35 },
    yAxis: { ...axis, type: 'value', min: 0, name: '−log10(BH q)' },
    tooltip: { ...tip, formatter: p => effectTip(items.find(item => item.id === p.data.pathwayId)) },
    series: [{ type: 'scatter', name: '通路效应与显著性', markLine: style.reference ? refLine([{ xAxis: 0 }, { yAxis: -Math.log10(.05), label: { show: true, formatter: 'q = 0.05' } }]) : undefined,
      data: items.map(item => ({ pathwayId: item.id, name: item.name, value: [item.effect, -Math.log10(Math.max(item.qValue, 1e-300))],
        itemStyle: { color: item.qValue < .05 ? colors[item.effect >= 0 ? 'AD' : 'NC'] : '#8c9aa6',
          borderColor: colors[item.effect >= 0 ? 'AD' : 'NC'] } })) }] };
}

export function prepareHeatmap(items, samples, clustering = 'both', heatScale = 'z') {
  const vectors = items.map(item => {
    const log = item.values.map(value => Math.log10(value + 1));
    return heatScale === 'z' ? zScores(log) : log;
  });
  const variable = items.map((item, i) => ({ item, i })).filter(({ item }) => Math.min(...item.values) !== Math.max(...item.values));
  const tree = clustering === 'rows' || clustering === 'both'
    ? clusterOrder(variable.map(({ i }) => vectors[i]), variable.map(({ item }) => item.id)) : null;
  const ordered = tree ? [...tree.order.map(index => variable[index].i), ...items.map((_, i) => i).filter(i => !variable.some(row => row.i === i))] : items.map((_, i) => i);
  const orderedSamples = GROUPS.flatMap(group => {
    const rows = samples.filter(sample => sample.group === group);
    if ((clustering !== 'samples' && clustering !== 'both') || !variable.length) return rows;
    const cluster = clusterOrder(rows.map(sample => variable.map(({ i }) => vectors[i][sample.index])), rows.map(sample => sample.id));
    return cluster.order.map(index => rows[index]);
  });
  return { items: ordered.map(i => items[i]), values: ordered.map(i => vectors[i]), samples: orderedSamples, tree };
}

function heatmap(model, colors, style) {
  const { items, values, samples, tree } = model;
  const transposed = Boolean(style.transposed), groups = GROUPS.filter(g => samples.some(sample => sample.group === g));
  const z = style.heatScale === 'z', ramp = HEAT_PALETTES.find(palette => palette.value === style.heatPalette)?.colors || HEAT_PALETTES[0].colors;
  const max = Math.max(.001, ...values.flatMap(row => row));
  const sampleAxis = { ...axis, type: 'category', data: samples.map(sample => `${sample.group} · ${sample.id}`), splitLine: { show: false }, axisLabel: { show: style.sampleLabels, hideOverlap: true } };
  return { ...base(), grid: { left: transposed ? 150 : tree && style.trees ? 365 : 290, right: 100, top: transposed && tree && style.trees ? 130 : 60, bottom: transposed ? 100 : 60 },
    legend: { data: groups, top: 3, right: 12, selectedMode: false },
    xAxis: transposed ? { ...rowAxis(items, style), inverse: false, axisLabel: { hideOverlap: true, rotate: 55, width: 170, overflow: 'truncate' } }
      : { ...sampleAxis, axisLabel: { ...sampleAxis.axisLabel, rotate: 70 } },
    yAxis: transposed ? { ...sampleAxis, inverse: true, axisLabel: { ...sampleAxis.axisLabel, margin: 18 } }
      : { ...rowAxis(items, style), axisLabel: { ...rowAxis(items, style).axisLabel, margin: tree && style.trees ? 85 : 8 } },
    visualMap: { min: z ? -3 : 0, max: z ? 3 : max, dimension: 2, seriesIndex: 0, right: 8, top: 'center',
      text: z ? ['通路 Z ≥ 3', '通路 Z ≤ −3'] : ['log 丰度高', 'log 丰度低'], inRange: { color: z ? ramp : ['#eff7f6', '#75b7b0', '#086b68'] } },
    tooltip: { ...tip, formatter: p => `${esc(p.data.name)}<br/>${esc(p.data.sampleId)} · ${p.data.group}<br/>原始丰度 ${fmt(p.data.raw)}<br/>${z ? 'log 后行 Z' : 'log10(x + 1)'} ${fmt(p.value[2])}${p.data.constant ? '<br/>无变异指标' : ''}` },
    series: [{ type: 'heatmap', name: '通路样本丰度', progressive: 0, itemStyle: { borderColor: '#ffffff80', borderWidth: style.cellBorders ? .5 : 0 }, encode: { x: 0, y: 1, value: 2 },
      data: items.flatMap((item, y) => samples.map((sample, x) => ({ name: item.name, pathwayId: item.id, sampleId: sample.id, group: sample.group,
        raw: item.values[sample.index], constant: item.values.every(value => value === item.values[0]), value: transposed ? [y, x, values[y][sample.index]] : [x, y, values[y][sample.index]] }))) },
    ...groups.map(g => ({ type: 'custom', name: g, itemStyle: { color: colors[g] }, silent: true, clip: false,
      data: samples.flatMap((sample, i) => sample.group === g ? [transposed ? [0, i] : [i, 0]] : []),
      renderItem: (p, api) => {
        if (transposed) {
          const y = api.coord([0, api.value(1)])[1], height = Math.abs(api.size([0, 1])[1]);
          const top = Math.max(p.coordSys.y, y - height / 2), bottom = Math.min(p.coordSys.y + p.coordSys.height, y + height / 2);
          return bottom > top ? { type: 'rect', shape: { x: p.coordSys.x - 12, y: top, width: 7, height: bottom - top + .2 }, style: { fill: colors[g] } } : null;
        }
        const x = api.coord([api.value(0), 0])[0], width = api.size([1, 0])[0];
        const left = Math.max(p.coordSys.x, x - width / 2), right = Math.min(p.coordSys.x + p.coordSys.width, x + width / 2);
        return right > left ? { type: 'rect', shape: { x: left, y: p.coordSys.y - 12, width: right - left + .2, height: 7 }, style: { fill: colors[g] } } : null; } })),
    ...(tree && style.trees ? [{ type: 'custom', name: '指标聚类树', silent: true, clip: false, data: [[0, 0]], renderItem: (p, api) => {
      const positions = new Map(items.map((item, index) => [item.id, transposed ? api.coord([index, 0])[0] : api.coord([0, index])[1]]));
      const nodes = tree.leafIds.map(id => ({ y: positions.get(id), distance: 0 })), maxD = Math.max(1e-12, ...tree.merges.map(merge => merge[2]));
      const children = [], x = distance => (transposed ? p.coordSys.y : p.coordSys.x) - 6 - distance / maxD * 65;
      const point = (offset, position) => transposed ? [position, offset] : [offset, position];
      tree.merges.forEach(([a, b, distance]) => { const left = nodes[a], right = nodes[b];
        children.push({ type: 'polyline', shape: { points: [point(x(left.distance), left.y), point(x(distance), left.y), point(x(distance), right.y), point(x(right.distance), right.y)] }, style: { stroke: '#718396', fill: null } });
        nodes.push({ y: (left.y + right.y) / 2, distance }); });
      return { type: 'group', clipPath: { type: 'rect', shape: transposed ? { x: p.coordSys.x, y: p.coordSys.y - 76, width: p.coordSys.width, height: 76 }
        : { x: p.coordSys.x - 76, y: p.coordSys.y, width: 76, height: p.coordSys.height } }, children }; } }] : [])] };
}

function samplePoints(item, samples, group, transform) {
  return samples.filter(sample => sample.group === group).map(sample => ({ ...sample, raw: item.values[sample.index], v: transformValue(item.values[sample.index], transform) }));
}

function distributionPanel(item, samples, view, style, colors, transform, group, highlighted) {
  const groups = group === 'all' ? GROUPS : [group], fn = value => transformValue(value, transform), series = [];
  const allValues = samples.filter(sample => groups.includes(sample.group)).map(sample => fn(item.values[sample.index]));
  const stats = summarize(allValues), upper = stats.max + (stats.max - stats.min || 1) * .1;
  const extent = Math.max(upper, ...groups.map(g => density(samplePoints(item, samples, g, transform).map(point => point.v), Number(style.smoothing)).curve.at(-1)?.[0] || 0));
  if (view === 'ecdf') {
    groups.forEach(g => {
      const points = samplePoints(item, samples, g, transform), cdf = empiricalCdf(points.map(point => point.v));
      series.push({ type: 'line', name: g, step: 'end', showSymbol: false, lineStyle: { color: colors[g], width: 2 },
        data: [[0, 0], ...cdf, [Math.max(extent, .1), 1]],
        tooltip: { formatter: p => `${esc(item.name)} · ${g}<br/>丰度 ≤ ${fmt(p.value[0])} 的样本占 ${(p.value[1] * 100).toFixed(1)}%<br/>${transform === 'log' ? '横轴已 log10(x + 1) 变换' : '横轴为 DiTing 原值'}` } });
      const point = points.find(point => point.id === highlighted);
      if (point) series.push({ type: 'scatter', name: `${g} 定位样本`, symbol: 'diamond', symbolSize: 12, itemStyle: { color: colors[g] },
        data: [{ value: [point.v, points.filter(p => p.v <= point.v).length / points.length], sampleId: point.id, name: point.id,
          tooltip: { formatter: () => `${esc(point.id)} · ${g}<br/>原始丰度 ${fmt(point.raw)}` } }] });
    });
    return { xAxis: { ...axis, type: 'value', min: 0, max: Math.max(extent, .1), name: transform === 'log' ? 'log10(丰度 + 1)' : 'DiTing 原始丰度', nameLocation: 'middle', nameGap: 32 },
      yAxis: { ...axis, type: 'value', min: 0, max: 1, axisLabel: { formatter: value => `${Math.round(value * 100)}%` }, name: '累计样本比例' }, series };
  }
  groups.forEach((g, gi) => {
    const points = samplePoints(item, samples, g, transform), estimate = density(points.map(point => point.v), Number(style.smoothing));
    const peak = Math.max(1e-12, ...estimate.curve.map(point => point[1]));
    series.push({ type: 'custom', name: `${g} 分布轮廓`, silent: true, itemStyle: { color: colors[g] }, clip: true, encode: { x: 0, y: [1, 2] }, data: [[gi, 0, Math.max(extent, .1)]],
      renderItem: (_p, api) => {
        const cx = api.coord([gi, 0])[0], y = value => api.coord([gi, value])[1], unit = Math.min(80, Math.abs(api.size([.34, 0])[0]));
        const children = [];
        if (view !== 'swarm' && estimate.curve.length) {
          const left = estimate.curve.map(([value, d]) => [cx - (view === 'raincloud' ? 14 : 0) - d / peak * unit, y(value)]);
          const right = view === 'violin' ? [...estimate.curve].reverse().map(([value, d]) => [cx + d / peak * unit, y(value)])
            : [[cx - 14, y(estimate.curve.at(-1)[0])], [cx - 14, y(estimate.curve[0][0])]];
          children.push({ type: 'polygon', shape: { points: [...left, ...right] }, style: { fill: colors[g], opacity: .25, stroke: style.outline ? colors[g] : null } });
        }
        children.push({ type: 'line', shape: { x1: cx, y1: y(estimate.lo), x2: cx, y2: y(estimate.hi) }, style: { stroke: colors[g], lineWidth: 1.5 } },
          { type: 'rect', shape: { x: cx - 5, y: y(estimate.q3), width: 10, height: Math.max(2, y(estimate.q1) - y(estimate.q3)) }, style: { fill: '#fff', stroke: colors[g], lineWidth: 1.8 } },
          { type: 'line', shape: { x1: cx - 6, y1: y(estimate.median), x2: cx + 6, y2: y(estimate.median) }, style: { stroke: colors[g], lineWidth: 2 } });
        return { type: 'group', children };
      } });
    series.push({ type: 'custom', name: g, itemStyle: { color: colors[g] }, clip: true, encode: { x: 0, y: 1 },
      data: points.map(point => ({ sampleId: point.id, name: point.id, raw: point.raw, value: [gi, point.v] })),
      tooltip: { formatter: p => `${esc(p.data.sampleId)} · ${g}<br/>${esc(item.name)}<br/>原始丰度 ${fmt(p.data.raw)}${transform === 'log' ? `<br/>log10(x + 1) ${fmt(p.value[1])}` : ''}` },
      renderItem: (p, api) => {
        const cache = `swarm-${gi}`;
        if (!p.context[cache]) p.context[cache] = swarmOffsets(points, value => api.coord([gi, value])[1], Number(style.pointSize) + 1,
          Math.min(85, Math.abs(api.size([.34, 0])[0])));
        const point = points[p.dataIndex], center = api.coord([gi, point.v]);
        const x = view === 'raincloud' ? 14 + ((point.index * 37 % 101) / 100) * Math.min(65, Math.abs(api.size([.28, 0])[0])) : p.context[cache].get(point.id);
        const active = highlighted === point.id, dim = highlighted && !active;
        return { type: 'circle', shape: { cx: center[0] + x, cy: center[1], r: Number(style.pointSize) / 2 * (active ? 1.6 : 1) },
          style: { fill: colors[g], stroke: style.outline ? '#fff' : null, lineWidth: .7,
            opacity: dim ? .12 : active ? 1 : Number(style.opacity) },
          ...(style.labels && active ? { textContent: { type: 'text', style: { text: point.id, fill: colors[g], fontSize: Number(style.fontSize) } }, textConfig: { position: 'top' } } : {}) };
      } });
  });
  return { xAxis: { ...axis, type: 'value', min: -.65, max: groups.length - .35, interval: 1, axisLine: { show: false }, axisLabel: { formatter: value => groups[value] || '' }, splitLine: { show: false } },
    yAxis: { ...axis, type: 'value', min: 0, max: Math.max(extent, .1), axisLine: { show: false }, name: transform === 'log' ? 'log10(丰度 + 1)' : 'DiTing 原始丰度' }, series };
}

function ridge(items, samples, style, colors, transform, group) {
  const groups = group === 'all' ? GROUPS : [group], all = items.flatMap(item => samples.filter(sample => groups.includes(sample.group)).map(sample => transformValue(item.values[sample.index], transform)));
  const max = Math.max(.1, ...all), series = [];
  groups.forEach((g, gi) => series.push({ type: 'custom', name: g, itemStyle: { color: colors[g] }, clip: true, encode: { x: [0, 2], y: 1 },
    data: items.map((item, i) => ({ name: item.name, pathwayId: item.id, value: [0, i, max],
      tooltip: { formatter: () => `${esc(item.name)} · ${g}<br/>样本 ${samples.filter(s => s.group === g).length}<br/>组均值 ${fmt(item.groups[g].mean)} · 中位数 ${fmt(item.groups[g].median)}` } })),
    renderItem: (p, api) => {
      const estimate = density(samplePoints(items[p.dataIndex], samples, g, transform).map(point => point.v), Number(style.smoothing));
      const peak = Math.max(1e-12, ...estimate.curve.map(point => point[1])), cy = api.coord([0, p.dataIndex])[1], h = Math.abs(api.size([0, 1])[1]) * .28;
      const y = cy + (groups.length === 2 ? gi === 0 ? -2 : h + 5 : h / 2);
      if (!estimate.curve.length) return { type: 'circle', shape: { cx: api.coord([estimate.min, p.dataIndex])[0], cy: y, r: 3 }, style: { fill: colors[g] } };
      return { type: 'polygon', shape: { points: [[api.coord([estimate.curve[0][0], p.dataIndex])[0], y],
        ...estimate.curve.map(([value, d]) => [api.coord([value, p.dataIndex])[0], y - d / peak * h]), [api.coord([estimate.curve.at(-1)[0], p.dataIndex])[0], y]] },
        style: { fill: colors[g], opacity: .45, stroke: style.outline ? colors[g] : null } };
    } }));
  return { ...base(), xAxis: { ...axis, type: 'value', min: 0, max: max * 1.15, name: transform === 'log' ? 'log10(丰度 + 1) · 所有通路共享横轴' : '原始丰度 · 所有通路共享横轴', nameLocation: 'middle', nameGap: 36 },
    yAxis: rowAxis(items, style), legend: { data: groups, top: 0 }, series };
}

export function buildPathwayOption({ view, items, samples, style, colors, transform = 'log', group = 'all', highlighted = '', heatmapModel, width = 1200, height = 600 }) {
  if (!items.length) return { ...base(), xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [] };
  let option;
  if (view === 'coverage') option = coverage(items, style, colors);
  else if (view === 'dumbbell') option = dumbbell(items, colors, transform, group, style);
  else if (view === 'forest') option = forest(items, colors, style);
  else if (view === 'significance') option = significance(items, colors, style);
  else if (view === 'heatmap') option = heatmap(heatmapModel, colors, style);
  else if (view === 'ridge') option = ridge(items, samples, style, colors, transform, group);
  else {
    const columns = items.length > 1 ? 2 : 1, rows = Math.ceil(items.length / columns), panels = [];
    const grids = [], xAxes = [], yAxes = [], titles = [];
    items.forEach((item, i) => {
      const panel = distributionPanel(item, samples, view, style, colors, transform, group, highlighted);
      const col = i % columns, row = Math.floor(i / columns), cellWidth = width / columns, cellHeight = height / rows;
      grids.push({ left: col * cellWidth + 80, top: row * cellHeight + 65, width: cellWidth - 115, height: Math.max(80, cellHeight - 125) });
      titles.push({ text: style.fullNames ? item.name : shortPathway(item.name), subtext: `AD n=${samples.filter(s => s.group === 'AD').length} · NC n=${samples.filter(s => s.group === 'NC').length} · q ${prob(item.qValue)}`,
        left: col * cellWidth + 60, top: row * cellHeight + 6, textStyle: { fontSize: 12, width: cellWidth - 115, overflow: 'break', lineHeight: 15 }, subtextStyle: { fontSize: 10 } });
      xAxes.push({ ...panel.xAxis, gridIndex: i }); yAxes.push({ ...panel.yAxis, gridIndex: i });
      panels.push(...panel.series.map(series => ({ ...series, xAxisIndex: i, yAxisIndex: i })));
    });
    option = { ...base(), title: titles, grid: grids, xAxis: xAxes, yAxis: yAxes, legend: { data: group === 'all' ? GROUPS : [group], top: 3, right: 10, icon: 'circle' }, series: panels };
  }
  const decorateAxis = current => ({ ...current, axisLabel: { ...(current.type === 'value' ? { formatter: fmt } : {}), ...current.axisLabel, fontSize: Number(style.fontSize) },
    splitLine: { ...current.splitLine, show: style.grid && current.splitLine?.show !== false } });
  const axes = current => Array.isArray(current) ? current.map(decorateAxis) : decorateAxis(current);
  return { ...option, ...(style.fullNames && ['forest', 'dumbbell', 'ridge', 'heatmap'].includes(view) && !(view === 'heatmap' && style.transposed) ? { grid: { ...option.grid, left: view === 'heatmap' && style.trees ? 465 : 390 } } : {}),
    aria: { enabled: true, decal: { show: false } }, color: [colors.AD, colors.NC], textStyle: { ...option.textStyle, fontSize: Number(style.fontSize) },
    tooltip: { ...option.tooltip, show: style.hover }, xAxis: axes(option.xAxis), yAxis: axes(option.yAxis),
    title: option.title?.map(title => ({ ...title, textStyle: { ...title.textStyle, fontSize: Number(style.fontSize) + 1 }, subtextStyle: { ...title.subtextStyle, fontSize: Number(style.fontSize) - 1 } })),
    legend: option.legend ? { ...option.legend, show: style.legend, textStyle: { fontSize: Number(style.fontSize) } } : undefined,
    series: option.series.map(series => ({ ...series, tooltip: { ...series.tooltip, show: style.hover },
      ...(series.type === 'scatter' ? { symbolSize: Number(style.pointSize),
        itemStyle: { ...series.itemStyle, opacity: Number(style.opacity), ...(style.outline ? { borderWidth: 1 } : {}) },
        label: { show: style.labels, position: 'top', formatter: p => p.data.labelText || shortPathway(p.data.name || '') }, labelLayout: { hideOverlap: true } } : {}),
    })) };
}
