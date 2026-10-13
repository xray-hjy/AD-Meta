const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const mapShape = (value, fn) => Array.isArray(value) ? value.map(fn) : value == null ? value : fn(value);

export function cleanBoxStyle(values = {}) {
  const cleaned = {};
  ['points', 'pointOutline', 'medians', 'grid', 'legend', 'animation'].forEach(key => {
    if (typeof values[key] === 'boolean') cleaned[key] = values[key];
  });
  const choices = { width: ['thin', 'standard', 'thick'], pointSize: ['small', 'standard', 'large'],
    opacity: ['light', 'standard', 'strong'], font: ['small', 'standard', 'large'] };
  Object.entries(choices).forEach(([key, allowed]) => { if (allowed.includes(values[key])) cleaned[key] = values[key]; });
  return cleaned;
}

export function boxStyleDefaults(option) {
  return { points: true, medians: false,
    pointOutline: list(option?.series).some(series => series.type === 'scatter' && series.itemStyle?.borderWidth > 0),
    grid: [...list(option?.xAxis), ...list(option?.yAxis)].some(axis => axis.type === 'value' && axis.splitLine?.show !== false),
    legend: list(option?.legend).some(legend => legend.show !== false), animation: option?.animation !== false,
    width: 'standard', pointSize: 'standard', opacity: 'standard', font: 'standard' };
}

// ECharts boxplot paths do not render series.label. A silent custom series
// annotates existing medians, using the same category-band layout as the boxes.
function medianLabels(box, boxIndex, boxIndices, config, fontDelta) {
  const data = list(box.data);
  return { id: `box-median-labels-${boxIndex}`, name: box.name, type: 'custom', silent: true,
    tooltip: { show: false }, animation: false, z: 6, clip: true,
    xAxisIndex: box.xAxisIndex || 0, yAxisIndex: box.yAxisIndex || 0,
    encode: { x: 0, y: 1 }, data: data.map((point, index) => [index, (Array.isArray(point) ? point : point?.value)?.[2]]),
    renderItem(params, api) {
      const median = api.value(1);
      if (median == null || median === '-' || !Number.isFinite(Number(median))) return null;
      const activeIndices = boxIndices.filter(index => api.currentSeriesIndices().includes(index));
      if (!activeIndices.includes(boxIndex)) return null;
      const band = Math.abs(api.size([1, 0])[0]);
      const available = band * 0.8 - 2;
      const gap = available / activeIndices.length * 0.3;
      const width = (available - gap * (activeIndices.length - 1)) / activeIndices.length;
      const rank = activeIndices.indexOf(boxIndex);
      const offset = width / 2 - available / 2 + rank * (gap + width);
      const coord = api.coord([api.value(0), median]);
      const area = params.coordSys;
      if (coord[0] < area.x || coord[0] > area.x + area.width || coord[1] < area.y || coord[1] > area.y + area.height) return null;
      const bounds = list(box.boxWidth || [7, 50]);
      const bound = value => typeof value === 'string' && value.endsWith('%') ? parseFloat(value) / 100 * band : Number(value);
      const boxWidth = Math.min(Math.max(width, bound(bounds[0])), bound(bounds[1] ?? bounds[0]));
      const alignLeft = activeIndices.length === 1 || rank >= activeIndices.length / 2;
      const color = data[params.dataIndex]?.itemStyle?.borderColor || box.itemStyle?.borderColor || '#475569';
      const text = config.formatValue ? config.formatValue(Number(median)) : String(median);
      const paired = activeIndices.length > 1;
      if (paired && band / activeIndices.length < text.length * (10 + fontDelta) * 0.6 + 10) return null;
      const values = Array.isArray(data[params.dataIndex]) ? data[params.dataIndex] : data[params.dataIndex]?.value;
      const upper = paired ? api.coord([api.value(0), values[4]])[1] : coord[1];
      return { type: 'text',
        x: coord[0] + offset + (paired ? 0 : (alignLeft ? 1 : -1) * (boxWidth / 2 + 4)),
        y: paired ? Math.max(area.y + 14, upper - 8) : coord[1],
        style: { text, fill: color,
          fontSize: 10 + fontDelta, align: paired ? 'center' : alignLeft ? 'left' : 'right', verticalAlign: paired ? 'bottom' : 'middle',
          backgroundColor: 'rgba(255,255,255,0.85)', padding: [2, 3], borderRadius: 3 } };
    } };
}

// Only presentation changes: keep all five-number summaries, sample points,
// sample IDs, transforms, tooltips and zoom configuration intact.
export function applyBoxStyle(option, preferences, config = {}) {
  const settings = cleanBoxStyle(preferences);
  if (!Object.keys(settings).length) return option;
  const sourceSeries = list(option?.series);
  const boxIndices = sourceSeries.map((series, index) => series.type === 'boxplot' ? index : -1).filter(index => index >= 0);
  if (!boxIndices.length) return option;
  const fontDelta = settings.font === 'large' ? 2 : settings.font === 'small' ? -2 : 0;
  const axisStyle = axis => ({ ...axis,
    ...(settings.grid == null || axis.type !== 'value' ? {} : { splitLine: { ...axis.splitLine, show: settings.grid } }),
    ...(fontDelta ? { axisLabel: { ...axis.axisLabel, fontSize: (axis.axisLabel?.fontSize || 12) + fontDelta } } : {}) });
  const series = sourceSeries.map(item => {
    if (item.type === 'boxplot') {
      const factor = settings.width === 'thin' ? 0.65 : settings.width === 'thick' ? 1.3 : 1;
      return factor === 1 ? item : { ...item, boxWidth: list(item.boxWidth || [7, 50]).map(value => typeof value === 'number'
        ? value * factor : `${parseFloat(value) * factor}%`) };
    }
    if (item.type !== 'scatter') return item;
    const hidden = settings.points === false;
    return { ...item,
      ...(hidden ? { silent: true, symbolSize: 0, tooltip: { ...item.tooltip, show: false }, emphasis: { ...item.emphasis, disabled: true } }
        : settings.pointSize && settings.pointSize !== 'standard' ? { symbolSize: (Number(item.symbolSize) || 6) * (settings.pointSize === 'small' ? 0.65 : 1.4) } : {}),
      itemStyle: { ...item.itemStyle,
        ...(settings.pointOutline == null ? {} : { borderColor: '#404040', borderWidth: settings.pointOutline ? 1.2 : 0 }),
        ...(hidden ? { opacity: 0 }
        : settings.opacity && settings.opacity !== 'standard' ? { opacity: settings.opacity === 'light' ? 0.35 : 1 } : {}) } };
  });
  return { ...option,
    ...(settings.animation == null ? {} : { animation: settings.animation }),
    xAxis: mapShape(option.xAxis, axisStyle), yAxis: mapShape(option.yAxis, axisStyle),
    legend: mapShape(option.legend, legend => ({ ...legend, ...(settings.legend == null ? {} : { show: settings.legend }) })),
    series: [...series, ...(settings.medians ? boxIndices.map(index => medianLabels(series[index], index, boxIndices, config, fontDelta)) : [])] };
}
