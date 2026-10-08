import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ZoomableGroupedBarChart, { groupedBarExportOption, groupedBarWorld } from './ZoomableGroupedBarChart';
import { nativeGroupedBarOption, nativeGroupedBarMotion, categoryZoomRange, categoryZoomInterval } from './groupedBarNativeOption';
import { useChartFrameActions } from './ChartFrameActionsContext';
import { exportEChart } from './chartExport';

const engine = vi.hoisted(() => ({ option: {}, events: {}, setOption: vi.fn(), dispatchAction: vi.fn(), resize: vi.fn(), clear: vi.fn(), dispose: vi.fn() }));
vi.mock('./CartesianEChart', () => ({ default: () => null }));
vi.mock('./EChartBase', () => ({ echarts: { init: () => ({
  setOption: engine.setOption, dispatchAction: engine.dispatchAction, resize: engine.resize, clear: engine.clear, dispose: engine.dispose,
  on: (name, callback) => { engine.events[name] = callback; }, getOption: () => engine.option,
  convertToPixel: (finder, index) => {
    const grid = engine.option.grid, range = engine.option.dataZoom[0];
    const from = range.start / 100 * engine.option.series[0].data.length;
    const count = (range.end - range.start) / 100 * engine.option.series[0].data.length;
    return (finder.xAxisIndex == null ? grid.top : grid.left) + (index - from + .5) / count * (finder.xAxisIndex == null ? grid.height : grid.width);
  },
}) } }));
vi.mock('./ChartFrameActionsContext', async importOriginal => ({ ...await importOriginal(), useChartFrameActions: vi.fn(), useChartFrameToolbarTarget: () => null }));
vi.mock('./chartExport', () => ({ exportEChart: vi.fn() }));
const model = { title: 'MAG 丰度条形图', featureLabel: 'MAG', items: Array.from({ length: 872 }, (_, i) => ({ id: `MAG_${i}`, label: `MAG_${i}`,
  fullName: `Species_long_name · MAG_${i}`, values: { AD: i / 100 + 1, NC: i === 0 ? null : .5 } })),
  series: [{ key: 'AD', label: 'AD 均值', color: '#ef4c3e' }, { key: 'NC', label: 'NC 均值', color: '#2acb70' }],
  barWidth: 11, showValues: true, axisName: '平均相对丰度（%）', formatValue: value => value == null ? '未提供' : `${value}%`, formatAxis: String };
const config = { key: 'test-bar', suffix: '%' }, exportConfig = { title: '导出 SVG', fileName: 'test', format: 'svg' };
const surface = () => document.querySelector('.mag-native-surface');
const action = id => useChartFrameActions.mock.lastCall[0].find(entry => entry.id === id);
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); engine.events = {}; engine.option = {};
  engine.setOption.mockImplementation((patch, flags) => {
    if (flags?.notMerge || !engine.option.series) engine.option = patch;
    else engine.option = { ...engine.option, ...patch, series: patch.series ? engine.option.series.map(series => ({ ...series, ...patch.series.find(entry => entry.id === series.id) })) : engine.option.series };
  });
  engine.dispatchAction.mockImplementation(payload => {
    if (payload.type === 'dataZoom') engine.option.dataZoom = engine.option.dataZoom.map(zoom => zoom.id === payload.dataZoomId ? { ...zoom, start: payload.start, end: payload.end } : zoom);
    if (payload.type === 'changeMagicType') engine.setOption(payload.newOption);
  });
  engine.clear.mockImplementation(() => { engine.option = {}; });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), setLineDash: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,fixture');
  exportEChart.mockResolvedValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('native slider and inside share the category axis; numeric slider retains positions with empty filtering', () => {
  const option = nativeGroupedBarOption({ model, option: groupedBarExportOption(model, {}, config), settings: { groupHover: true }, transposed: false,
    lineMode: false, plot: { left: 305, top: 42, width: 1000, height: 500 }, dimensions: { height: 700 }, range: { start: 40, end: 50 } });
  expect(option.dataZoom[0]).toMatchObject({ type: 'slider', orient: 'horizontal', yAxisIndex: 0, start: 40, end: 50, filterMode: 'filter' });
  expect(option.dataZoom[1]).toMatchObject({ type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: 'alt', moveOnMouseMove: false });
  expect(option.dataZoom[2]).toMatchObject({ type: 'slider', orient: 'vertical', xAxisIndex: 0, filterMode: 'empty', showDataShadow: false });
  expect(option.series[0].data).toHaveLength(872);
  expect(option.series[1].data[0]).toBeNull();
  expect(option.toolbox.feature.dataView.readOnly).toBe(true);
  expect(option.xAxis[0].max({ min: .002, max: .003 })).toBeLessThan(.005);
  expect(option.xAxis[0].min({ min: .002, max: .003 })).toBe(0);
  expect(option.tooltip.trigger).toBe('item');
  expect(option.series[0].emphasis.focus).toBe('series');
});

test('camera intervals round-trip without dropping or reordering the collection', () => {
  const range = categoryZoomRange({ x: 34 * 425, width: 34 * 24 }, true, 872);
  const interval = categoryZoomInterval(range, 872);
  expect(interval[0]).toBeCloseTo(34 * 425); expect(interval[1]).toBeCloseTo(34 * 449);
  expect(categoryZoomInterval({ start: NaN, end: 100 }, 872)).toBeNull();
});

test('composition retains its percentage formatter and bounded domain in native navigation', () => {
  const composition = { ...model, featureLabel: '分类', axisMax: 1,
    items: [{ id: 'Bacteroidota', label: 'Bacteroidota', values: { AD: .45, NC: .3 } }],
    formatValue: v => `${v * 100}%`, formatAxis: v => `${v * 100}%` };
  const option = nativeGroupedBarOption({ model: composition, option: groupedBarExportOption(composition, {}, { scale: 100, suffix: '%' }),
    settings: { groupHover: true }, transposed: false, lineMode: false, plot: { left: 305, top: 42, width: 1000, height: 500 }, dimensions: { height: 700 }, range: { start: 0, end: 100 } });
  expect(option.xAxis[0].max).toBe(1);
  expect(option.xAxis[0].axisLabel.formatter(.45)).toBe('45%');
  expect(option.series[0].data[0].value).toBe(.45);
  expect(option.tooltip.formatter({ dataIndex: 0, seriesIndex: 0, seriesName: 'AD 均值' })).toContain('45%');
});

test('signed effects overlap sparse enrichment series around a fixed symmetric zero', () => {
  const effect = { ...model, featureLabel: 'KO', overlapSeries: true, barGap: '-100%', axisMin: -1.12, axisMax: 1.12,
    items: [{ id: 'K00001', label: 'K00001', values: { AD: .8, NC: null } }, { id: 'K00002', label: 'K00002', values: { AD: null, NC: -.7 } }],
    tooltipFormatter: () => 'p 值: 0; q 值: 0.01' };
  const option = nativeGroupedBarOption({ model: effect, option: groupedBarExportOption(effect, {}, {}), settings: { groupHover: true },
    transposed: false, lineMode: false, plot: { left: 305, top: 42, width: 1000, height: 500 }, dimensions: { height: 700 }, range: { start: 0, end: 100 } });
  expect(option.xAxis[0]).toMatchObject({ min: -1.12, max: 1.12 });
  expect(option.series[0].barGap).toBe('-100%');
  expect(option.series[0].data[1]).toBeNull();
  expect(option.series[1].data[1].value).toBe(-.7);
  expect(option.tooltip.formatter({ dataIndex: 0 })).toContain('p 值: 0');
});

test('native entry/update animations respect the visible workload, the animation switch and reduced motion', () => {
  const settings = { animation: true }, range = { start: 40, end: 45 };
  expect(nativeGroupedBarMotion({ settings, count: 872, range })).toMatchObject({ animation: true, animationDuration: 1000, animationDurationUpdate: 320 });
  expect(nativeGroupedBarMotion({ settings, count: 872, range: { start: 0, end: 100 } })).toMatchObject({ animation: false, animationDurationUpdate: 0 });
  expect(nativeGroupedBarMotion({ settings: { animation: false }, count: 20, range })).toMatchObject({ animation: false, animationDuration: 0 });
  expect(nativeGroupedBarMotion({ settings, count: 20, range, reducedMotion: true }).animation).toBe(false);
  const small = { ...model, items: model.items.slice(0, 20) };
  const build = source => nativeGroupedBarOption({ model: source, option: groupedBarExportOption(source, {}, config), settings,
    transposed: false, lineMode: false, plot: { left: 305, top: 42, width: 1000, height: 500 }, dimensions: { height: 700 }, range: { start: 0, end: 100 } });
  const initial = build(small), reordered = build({ ...small, items: [...small.items].reverse() });
  expect(initial.series[0].data[0]).toMatchObject({ id: 'MAG_0', value: 1 });
  expect(reordered.series[0].data[19].id).toBe(initial.series[0].data[0].id);
  expect(initial.series[0].animationDelay).toBe(0);
  expect(initial.series[0].animationEasing).toBe('cubicInOut');
  expect(initial.series[0].universalTransition.enabled).toBe(false);
});

test('updates merge existing series and a single magicType action is not followed by a cancelling redraw', () => {
  const small = { ...model, items: model.items.slice(0, 20) };
  render(<ZoomableGroupedBarChart model={small} barStyleConfig={config} exportConfig={exportConfig} />);
  expect(engine.setOption.mock.calls.some(([, flags]) => flags?.notMerge)).toBe(false);
  expect(engine.option.animationDurationUpdate).toBe(320);
  fireEvent.click(screen.getByRole('button', { name: '交换横纵轴' }));
  expect(engine.option.dataZoom[0]).toMatchObject({ xAxisIndex: 0, yAxisIndex: [] });
  expect(engine.option.dataZoom[2]).toMatchObject({ xAxisIndex: [], yAxisIndex: 0 });
  engine.setOption.mockClear(); engine.dispatchAction.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '切换为折线图' }));
  expect(engine.dispatchAction.mock.calls.filter(([payload]) => payload.type === 'changeMagicType')).toHaveLength(1);
  expect(engine.setOption).toHaveBeenCalledTimes(1); // Only the native action's merge.
  expect(engine.option.series[0]).toMatchObject({ type: 'line', animation: true, animationDurationUpdate: 320 });
  fireEvent.click(screen.getByRole('button', { name: '更多设置' }));
  fireEvent.click(screen.getByRole('switch', { name: '动画' }));
  expect(engine.option.animation).toBe(false);
  expect(engine.option.series[0]).toMatchObject({ animation: false, animationDurationUpdate: 0 });
});

test('first entry waits for visibility and reopening replays native bar growth without changing the range', () => {
  let intersect;
  vi.stubGlobal('IntersectionObserver', class { constructor(callback) { intersect = callback; } observe() {} disconnect() {} });
  const small = { ...model, items: model.items.slice(0, 20) };
  render(<ZoomableGroupedBarChart model={small} barStyleConfig={config} exportConfig={exportConfig} />);
  expect(engine.setOption).not.toHaveBeenCalled();
  act(() => intersect([{ isIntersecting: true }]));
  expect(engine.option.series[0]).toMatchObject({ animationDuration: 1000, universalTransition: { enabled: false } });
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  const zoom = engine.option.dataZoom[0];
  expect(zoom.end - zoom.start).toBeLessThan(100);
  act(() => intersect([{ isIntersecting: false }]));
  act(() => intersect([{ isIntersecting: true }]));
  expect(engine.clear).toHaveBeenCalledOnce();
  expect(engine.option.dataZoom[0]).toMatchObject({ start: zoom.start, end: zoom.end });
  expect(engine.option.series[0].data[0]).toMatchObject({ id: 'MAG_0', value: 1 });
});

test('dense rendering suppresses labels even after per-point style edits, keeping precision and null values', () => {
  const option = nativeGroupedBarOption({ model, option: groupedBarExportOption(model, { transposed: true, values: true, precision: '2' }, config),
    settings: { values: true }, transposed: true, lineMode: false, plot: { left: 95, top: 42, width: 1000, height: 500 },
    dimensions: { height: 700 }, range: { start: 0, end: 100 } });
  expect(option.series[0].label.show).toBe(false);
  expect(option.series[0].data[0].label).not.toHaveProperty('show');
  expect(option.series[0].label.formatter({ value: 1.23456 })).toBe('1.23%');
  expect(option.series[1].data[0]).toBeNull();
});

test('camera navigation dispatches native dataZoom, and native dataZoom moves the shared camera', async () => {
  render(<ZoomableGroupedBarChart model={model} barStyleConfig={config} exportConfig={exportConfig} />);
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  expect(+surface().dataset.rangeEnd - +surface().dataset.rangeStart).toBeLessThan(20);
  expect(engine.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'dataZoom', dataZoomId: 'mag-category-zoom' }), { silent: true });
  await act(async () => {
    engine.option.dataZoom[0] = { ...engine.option.dataZoom[0], start: 40, end: 50 };
    engine.events.datazoom({ dataZoomId: 'mag-category-zoom' });
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(+surface().dataset.rangeStart).toBeCloseTo(348.8);
  expect(+surface().dataset.rangeEnd).toBeCloseTo(436);
  const before = +surface().dataset.rangeStart;
  fireEvent.keyDown(screen.getByRole('group', { name: /MAG 丰度条形图视口/ }), { key: 'ArrowDown' });
  expect(+surface().dataset.rangeStart).toBeGreaterThan(before);
});

test('orientation and magic type preserve the interval; missing values and zero remain native data', () => {
  render(<ZoomableGroupedBarChart model={model} barStyleConfig={config} exportConfig={exportConfig} />);
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  const before = [+surface().dataset.rangeStart, +surface().dataset.rangeEnd];
  fireEvent.click(screen.getByRole('button', { name: '交换横纵轴' }));
  expect(engine.option.dataZoom[0].xAxisIndex).toBe(0);
  expect(+surface().dataset.rangeStart).toBeCloseTo(before[0]); expect(+surface().dataset.rangeEnd).toBeCloseTo(before[1]);
  fireEvent.click(screen.getByRole('button', { name: '切换为折线图' }));
  expect(engine.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'changeMagicType', currentType: 'line' }));
  expect(surface()).toHaveAttribute('data-chart-type', 'line');
  expect(engine.option.series.every(series => series.type === 'line')).toBe(true);
  expect(engine.option.series[1].data[0]).toBeNull();
  expect(screen.getByRole('switch', { name: '圆角' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: '分组标记' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '切换为柱状图' }));
  expect(surface()).toHaveAttribute('data-chart-type', 'bar');
  expect(+surface().dataset.rangeStart).toBeCloseTo(before[0]);
});

test('native clicks resolve original MAG IDs, legend state changes scale input and complete export', async () => {
  const selected = vi.fn();
  render(<ZoomableGroupedBarChart model={model} barStyleConfig={config} exportConfig={exportConfig} onSelect={selected} />);
  act(() => engine.events.click({ componentType: 'series', seriesIndex: 0, dataIndex: 425 }));
  expect(selected).toHaveBeenCalledWith('MAG_425');
  act(() => engine.events.legendselectchanged({ selected: { 'AD 均值': true, 'NC 均值': false } }));
  expect(screen.getByRole('button', { name: 'NC 均值' })).toHaveAttribute('aria-pressed', 'false');
  await act(async () => action('export').onClick());
  const [source, exported] = exportEChart.mock.lastCall;
  expect(source.getOption().legend.selected['NC 均值']).toBe(false);
  expect(source.getOption().series[0].data).toHaveLength(872);
  expect(source.getOption()).not.toHaveProperty('dataZoom');
  expect(exported.pixelRatio * exported.minHeight).toBeLessThanOrEqual(16384);
});

test('hover stays on actual items, can be disabled, and exports preserve optional group markers', async () => {
  render(<ZoomableGroupedBarChart model={model} barStyleConfig={config} exportConfig={exportConfig} />);
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  fireEvent.click(screen.getByRole('switch', { name: '分组标记' }));
  expect(document.querySelector('.zoomable-bar-group-labels')).toHaveTextContent('AD');
  const tip = engine.option.tooltip.formatter({ seriesIndex: 0, dataIndex: 1, seriesName: 'AD 均值' });
  expect(tip).toContain('MAG_1'); expect(tip).toContain('1.01%'); expect(tip).not.toContain('NC 均值');
  fireEvent.click(screen.getByRole('switch', { name: '分组悬浮' }));
  expect(engine.option.tooltip.show).toBe(false);
  expect(engine.option.series[0].emphasis.disabled).toBe(true);
  expect(document.querySelector('.zoomable-bar-group-separators')).toBeInTheDocument();
  await act(async () => action('export').onClick());
  expect(exportEChart.mock.lastCall[0].getOption().graphic.filter(item => item.type === 'text')).toHaveLength(1744);
});

test('data disclosure is paginated and read-only; restore resets native view without clearing style preferences', async () => {
  const view = render(<ZoomableGroupedBarChart model={model} barStyleConfig={config} exportConfig={exportConfig} />);
  expect(screen.queryByRole('button', { name: '查看图表数据' })).toBeNull();
  fireEvent.click(screen.getByText('当前图表数据（只读）'));
  expect(await screen.findByRole('columnheader', { name: 'MAG ID' })).toBeInTheDocument();
  expect(screen.getByRole('table').querySelectorAll('tbody tr').length).toBeLessThanOrEqual(300);
  expect(screen.getByRole('table').querySelector('input')).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: '数值' }));
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  fireEvent.click(screen.getByRole('button', { name: '恢复图表视图' }));
  expect(engine.dispatchAction).toHaveBeenCalledWith({ type: 'restore' });
  expect(screen.getByRole('switch', { name: '数值' })).toHaveAttribute('aria-checked', 'false');
  expect(+surface().dataset.rangeStart).toBe(0); expect(+surface().dataset.rangeEnd).toBe(872);
  view.unmount(); expect(engine.dispose).toHaveBeenCalledOnce();
});

test('export axes retain original percentages; line gaps remain gaps and export omits navigation', () => {
  const small = { ...model, items: [{ id: 'zero', values: { AD: 0, NC: null } }] };
  const option = groupedBarExportOption(small, { transposed: true }, config, 'line');
  expect(option.series[0].type).toBe('line'); expect(option.series[0].data[0]).toBe(0);
  expect(option.series[1].data[0]).toBeNull(); expect(option.series[1].connectNulls).toBe(false);
  expect(option).not.toHaveProperty('dataZoom');
  expect(groupedBarWorld(872, true)).toEqual({ width: 29648, height: 1200 });
});
