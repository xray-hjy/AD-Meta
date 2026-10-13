import { researchPaletteOptions, resolveResearchPalette, isCategoricalPalette } from './magResearchPalettes';

export const DEFAULT_RESEARCH_STYLE = { palette: 'okabe-ito', labels: false, hover: true, grid: true,
  legend: true, outline: true, reference: true, band: true, metric: 'count', mappingView: 'auto', groupBy: 'disease',
  pointSize: '8', opacity: '0.75', fontSize: '11', barWidth: '24' };
const choice = (key, label, options, more = true) => ({ key, label, options: options.map(([value, text]) => ({ value, label: text })), more });
export function researchFields(kind, style = {}) {
  const fields = [{ key: 'palette', label: '配色', type: 'palette', discrete: true, options: researchPaletteOptions(kind, style),
    description: isCategoricalPalette(kind, style) ? '科研分类色板 · 名称后为原始色数，超出色数的类别循环用色。'
      : '双色摘选 · 按图例顺序对应色卡左、右颜色。' }];
  if (kind === 'taxonomy') fields.push(choice('metric', '统计', [['count', 'MAG 数量'], ['percent', '目录占比 %']], false));
  if (kind === 'mapping') fields.push(choice('mappingView', '视图', [['auto', '自动'], ['distribution', '映射分布'], ['relationship', '映射 / 阈值数量']], false));
  if (kind === 'mapping') fields.push(choice('groupBy', '分组', [['disease', 'AD / NC'], ['batch', 'HPC 批次']], false));
  if (kind === 'lineage') fields.push(choice('groupBy', '分组', [['disease', 'AD / NC'], ['source', 'CHN / CHN2']], false));
  fields.push({ key: 'labels', label: kind === 'taxonomy' ? '数值' : '标识', type: 'switch', description: '少量散点显示标识；密集散点标注点击或框选项，避免文字重叠' },
    { key: 'hover', label: '悬浮', type: 'switch' });
  if (kind === 'quality' || kind === 'lineage') fields.push({ key: 'reference', label: '参考线', type: 'switch' });
  if (kind === 'quality') fields.push({ key: 'band', label: '参考区间', type: 'switch', more: true });
  if (kind !== 'taxonomy') fields.push({ key: 'outline', label: '点描边', type: 'switch', more: true },
    choice('pointSize', '点大小', [['5', '小'], ['8', '中'], ['11', '大']]),
    choice('opacity', '不透明度', [['0.45', '45%'], ['0.75', '75%'], ['1', '100%']]));
  else fields.push(choice('barWidth', '柱宽', [['16', '细'], ['24', '中'], ['32', '宽']]));
  fields.push({ key: 'grid', label: '网格', type: 'switch', more: true },
    { key: 'legend', label: '图例', type: 'switch', more: true },
    choice('fontSize', '文字大小', [['10', '小'], ['11', '中'], ['13', '大']]));
  return fields;
}
export function researchColors(style, kind = 'quality') {
  return resolveResearchPalette(kind, style).colors;
}
export function decorateResearchOption(base, kind, preferences, selected = []) {
  const style = { ...DEFAULT_RESEARCH_STYLE, ...(kind === 'taxonomy' ? { palette: 'brewer-paired' } : {}), ...preferences };
  const colors = researchColors(style, kind);
  const selectedIds = new Set(selected);
  const sparse = base.series.reduce((total, series) => total + (series.data?.length || 0), 0) <= 30;
  const axis = value => ({ ...value, axisLabel: { ...value.axisLabel, fontSize: Number(style.fontSize) },
    splitLine: { ...value.splitLine, show: style.grid, lineStyle: { color: '#e3e9f0', type: 'dashed' } } });
  const option = { ...base, color: colors, textStyle: { fontSize: Number(style.fontSize), color: '#566477' },
    animation: false, tooltip: { ...base.tooltip, show: style.hover },
    legend: base.legend ? { ...base.legend, show: style.legend, textStyle: { fontSize: Number(style.fontSize) } } : undefined,
    xAxis: axis(base.xAxis), yAxis: axis(base.yAxis),
    series: base.series.map((series, index) => ({ ...series,
      symbolSize: Number(style.pointSize), barMaxWidth: Number(style.barWidth),
      itemStyle: { ...series.itemStyle, color: colors[index % colors.length], opacity: Number(style.opacity),
        borderColor: colors[index % colors.length], borderWidth: style.outline ? 1 : 0, ...(series.type === 'bar' ? { borderRadius: [0, 4, 4, 0] } : {}) },
      emphasis: { disabled: !style.hover, focus: style.hover ? 'series' : 'none' },
      markLine: style.reference ? series.markLine : { data: [] },
      markArea: style.band ? (series.markArea ? { ...series.markArea,
        itemStyle: { ...series.markArea.itemStyle, color: `${colors[index % colors.length]}10` } } : undefined) : { data: [] },
      label: { ...series.label, show: style.labels,
        ...(series.type === 'scatter' ? { position: 'top', formatter: p => sparse || selectedIds.has(p.data.magId || p.data.details?.magId || p.data.name) ? p.data.name : '' } : {}) },
      labelLayout: { hideOverlap: true },
    })) };
  if (kind === 'taxonomy') {
    const percent = style.metric === 'percent';
    option.xAxis = { ...option.xAxis, name: percent ? '占全部代表 MAG 的比例（%）' : 'MAG 数量', minInterval: percent ? undefined : 1 };
    option.series[0].data = base.series[0].data.map((item, index) => ({ ...item, value: percent ? item.percent : item.value,
      itemStyle: { color: colors[index % colors.length] } }));
    option.series[0].label = { show: style.labels, position: 'right', formatter: p => percent ? `${Number(p.data.percent).toFixed(1)}%` : String(p.data.count ?? p.data.value) };
    option.tooltip.formatter = p => `${p.name}\n${p.data.count ?? base.series[0].data[p.dataIndex].value} 个 MAG\n${Number(p.data.percent).toFixed(2)}%（全部代表 MAG 为分母）`;
  }
  return option;
}
