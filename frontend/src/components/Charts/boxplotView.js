import { buildBoxScatterOption } from './BoxScatterChart';

export function formatAbundance(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (!number) return '0';
  if (Math.abs(number) < 0.001 || Math.abs(number) >= 1e5) return number.toExponential(2);
  return String(Number(number.toPrecision(4)));
}

export function facetLayout(width) {
  return { columns: width >= 720 ? 2 : 1, pageSize: width >= 1000 ? 6 : width >= 720 ? 4 : 2 };
}

export function outlierPoints(summary) {
  return summary?.outlierPoints || (summary?.outliers || []).map(value => ({ sample: null, value }));
}

function niceMax(value) {
  if (!(value > 0)) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step * 4) / 4 * step;
}

// Only set viewport bounds. Never filter points or recalculate summaries.
export function boxplotRanges(items, groups, transformKey, axisMode, focus) {
  const extents = items.map(item => {
    const summaries = groups.map(group => item.values?.[group.key]?.[transformKey]);
    const finite = values => values.filter(value => value != null && value !== '-' && Number.isFinite(Number(value))).map(Number);
    const all = summaries.flatMap(value => finite([...(value?.box || []), ...outlierPoints(value).map(point => point.value)]));
    // Small zero-heavy samples can have an interpolated Q3 above the last inlier.
    // Include the whole box as well as whiskers so focus never cuts off a summary.
    const upper = Math.max(0, ...summaries.flatMap(value => finite(value?.box || [])));
    return { min: Math.min(0, ...all), max: Math.max(0, ...all), upper };
  });
  const shared = {
    min: Math.min(0, ...extents.map(item => item.min)),
    max: Math.max(0, ...extents.map(item => item.max)),
    upper: Math.max(0, ...extents.map(item => item.upper)),
  };
  return extents.map(extent => {
    const source = axisMode === 'shared' ? shared : extent;
    const canFocus = source.upper > 0;
    const max = niceMax((focus && canFocus ? Math.min(source.max, source.upper * 1.08) : source.max * 1.08));
    return { min: source.min, max, focusFallback: focus && !canFocus && source.max > 0 };
  });
}

export function outsidePoints(item, groups, transformKey, range) {
  return groups.flatMap(group => outlierPoints(item.values?.[group.key]?.[transformKey])
    .filter(point => Number(point.value) > range.max || Number(point.value) < range.min)
    .map(point => ({ feature: item.fullName || item.shortName, group: group.label, sample: point.sample || '未知',
      value: point.value, direction: Number(point.value) > range.max ? '上方' : '下方', ...range })));
}

export function facetHeight(count, columns, width = 1100) {
  return (width < 720 ? 160 : 96) + Math.ceil(count / columns) * 390;
}

function text(id, x, y, value, width, extras = {}) {
  return { id, type: 'text', x, y, silent: true,
    style: { text: value, width, overflow: 'break', lineHeight: 16, fontSize: 11, fill: '#475569', ...extras } };
}

export function buildBoxplotView({ available, series, activeTransform, visibleCount, groupCounts,
  view = 'facets', axisMode = 'independent', focus = false, page = 1, pageSize = 6, columns: requestedColumns = 2, width = 1100, unitNote = '' }) {
  if (!available.length || !series.length) return null;
  const columns = available.length === 1 ? 1 : requestedColumns;
  const compact = width < 720;
  const panelTop = compact ? 160 : 96;
  const overview = view === 'overview' && available.length > 1;
  const ranges = boxplotRanges(available, series, activeTransform.key, overview ? 'shared' : axisMode, focus);
  const rangeLabel = range => `${formatAbundance(range.min)}–${formatAbundance(range.max)}`;
  const header = `${overview ? '共享纵轴总览' : available.length === 1 ? '单物种组间比较' : `物种分面 · 第 ${page}/${Math.ceil(available.length / pageSize)} 页（共 ${available.length} 个）`} · ${activeTransform.label} · ${focus ? '主体分布放大' : '完整范围'}${unitNote ? ` · ${unitNote}` : ''}`;
  const axisNote = available.length === 1 ? '同一物种内，各组共用纵轴。' : !overview && axisMode === 'independent'
    ? '各分面纵轴独立；仅在同一物种内比较组间分布，请勿用跨物种箱体高度比较丰度。'
    : '所有物种使用相同纵轴范围（覆盖全部分页）。';
  const legendData = series.map(group => ({ name: group.label, icon: 'roundRect',
    itemStyle: { color: group.color || '#64748b', opacity: 1, borderWidth: 0 } }));
  if (overview) {
    const option = buildBoxScatterOption({ available, series, activeTransform, visibleCount, groupCounts, formatValue: formatAbundance });
    const outside = available.flatMap((item, index) => outsidePoints(item, series, activeTransform.key, ranges[index]));
    return { ...option, animation: false,
      series: option.series.map(entry => entry.type === 'scatter' ? { ...entry,
        name: series.find(group => entry.name.startsWith(group.label))?.label || entry.name } : entry),
      grid: { ...option.grid, top: compact ? 164 : 110 }, legend: { ...option.legend, data: legendData, top: compact ? 128 : 65 },
      yAxis: { ...option.yAxis, min: ranges[0].min, max: ranges[0].max },
      graphic: [text('heading', 16, 8, header, width - 32, { fontSize: 13, fontWeight: 'bold' }),
        text('overview-range', 16, compact ? 64 : 32, `纵轴 ${rangeLabel(ranges[0])}；${outside.length ? `视野外 ${outside.length} 个离群样本点，详见页面明细；` : ''}箱须：1.5×IQR；零值计入统计。`, width - 32)],
    };
  }
  const start = (page - 1) * pageSize;
  const items = available.slice(start, start + pageSize);
  const panelWidth = width / columns;
  const option = { animation: false, grid: [], xAxis: [], yAxis: [], series: [], dataZoom: [],
    legend: { show: true, selectedMode: false, top: compact ? 128 : 62, right: 20, data: legendData },
    graphic: [text('heading', 16, 8, header, width - 32, { fontSize: 13, fontWeight: 'bold' }),
      text('axis-note', 16, compact ? 64 : 32, `${axisNote} 箱须：1.5×IQR；零值计入统计。`, width - 32, { fill: axisMode === 'independent' && available.length > 1 ? '#92400e' : '#475569' })] };
  const tooltips = [];
  items.forEach((item, index) => {
    const range = ranges[start + index];
    const outside = outsidePoints(item, series, activeTransform.key, range);
    const col = index % columns;
    const top = panelTop + Math.floor(index / columns) * 390;
    const left = col * panelWidth;
    const base = buildBoxScatterOption({ available: [item], series, activeTransform, visibleCount: 1,
      layout: 'groups', groupCounts, boxWidth: [20, 58], formatValue: formatAbundance });
    tooltips.push(base.tooltip.formatter);
    option.grid.push({ left: left + 62, width: panelWidth - 86, top: top + 105, height: 190 });
    option.xAxis.push({ ...base.xAxis, gridIndex: index, axisLabel: { ...base.xAxis.axisLabel, formatter(value) {
      const group = series.find(entry => entry.key === value);
      const stats = item.groupStats?.[value];
      if (!stats) return groupCounts?.[value] == null ? group?.label || value : `${group?.label || value} (组内=${groupCounts[value]})`;
      return `${group?.label || value} (n=${stats.validCount}${stats.validCount === stats.sampleCount ? '' : `/${stats.sampleCount}`})`;
    } } });
    option.yAxis.push({ ...base.yAxis, gridIndex: index, min: range.min, max: range.max, splitNumber: 4,
      name: activeTransform.label, nameTextStyle: { fontSize: 10 }, axisLabel: { ...base.yAxis.axisLabel, fontSize: 10 } });
    // Series names match legend entries. Grouped boxes retain per-item colors.
    option.series.push(...base.series.map(entry => ({ ...entry, name: entry.type === 'scatter'
      ? series.find(group => entry.name.startsWith(group.label))?.label || entry.name : entry.name,
    xAxisIndex: index, yAxisIndex: index, clip: true })));
    const notices = series.map(group => {
      const count = outside.filter(point => point.group === group.label).length;
      return count ? `${group.label} ${count}` : null;
    }).filter(Boolean).join(' / ');
    const degenerate = series.filter(group => {
      const box = item.values?.[group.key]?.[activeTransform.key]?.box;
      return box?.length === 5 && box.every(value => value === 0);
    }).map(group => group.label);
    const detection = series.map(group => {
      const stats = item.groupStats?.[group.key];
      return `${group.label} ${stats?.detectionRate == null ? '—' : `${stats.detectedCount}/${stats.validCount} (${(stats.detectionRate * 100).toFixed(1)}%)`}`;
    }).join(' · ');
    const missing = series.filter(group => item.groupStats?.[group.key]?.validCount === 0).map(group => group.label);
    const note = `${notices ? `↑ 视野外 ${notices}；` : ''}纵轴 ${rangeLabel(range)}${range.focusFallback ? '（箱须为零，保留完整范围）' : ''}`;
    option.graphic.push(text(`name-${index}`, left + 16, top, `${start + index + 1}. ${item.shortName || item.fullName}`, panelWidth - 32,
      { fontSize: 12, fontWeight: 'bold', height: 46, overflow: 'break', lineOverflow: 'truncate' }),
    text(`range-${index}`, left + 16, top + 50, note, panelWidth - 32, { fill: notices ? '#92400e' : '#475569' }),
    text(`detection-${index}`, left + 16, top + 326, `检出 ${detection}`, panelWidth - 32, { fontSize: 10 }),
    text(`zero-${index}`, left + 16, top + 348, missing.length ? `${missing.join(' / ')}：无有效数值。` : degenerate.length ? `${degenerate.join(' / ')}：箱体及箱须均为 0；离群值仍保留。` : '', panelWidth - 32, { fill: '#64748b', fontSize: 10 }));
  });
  option.tooltip = { trigger: 'item', confine: true, formatter(params) {
    const entry = option.series[params.seriesIndex];
    return tooltips[entry?.xAxisIndex || 0]?.(params) || '';
  } };
  return option;
}

export function boxplotTable(items, groups, transform, ranges) {
  const rows = items.flatMap((item, index) => groups.flatMap(group => {
    const value = item.values?.[group.key]?.[transform.key];
    const common = { feature: item.fullName || item.shortName, group: group.label, transform: transform.label };
    return [
      { ...common, kind: '箱线（下须 / Q1 / 中位数 / Q3 / 上须）', sample: '—', value: value?.box ? value.box.join(' / ') : '无有效数值', viewport: value?.box ? '箱线统计保留' : '不可计算' },
      ...outlierPoints(value).map(point => ({ ...common, kind: '离群点', sample: point.sample || '未知', value: point.value,
        viewport: point.value > ranges[index].max || point.value < ranges[index].min ? '视野外（数据保留）' : '视野内' })),
    ];
  }));
  return { ariaLabel: '全部已选物种图表数据，可滚动', rows,
    columns: [{ key: 'feature', label: '完整名称' }, { key: 'group', label: '组别' }, { key: 'transform', label: '当前尺度' },
      { key: 'kind', label: '记录类型' }, { key: 'sample', label: '样本编号' }, { key: 'value', label: '数值' }, { key: 'viewport', label: '视野状态' }],
    footer: '包含全部已选物种及全部离群点，不受图表分页、视野范围或散点开关影响；这不是逐样本完整丰度表。' };
}
