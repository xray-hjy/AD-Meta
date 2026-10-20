import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import MagZoomableHeatmap, { heatmapRenderModel } from './MagZoomableHeatmap';
import { buildMagHeatmapOption } from './magHeatmapOption';
import { useChartFrameActions } from '../../components/Charts/ChartFrameActionsContext';
import { exportEChart } from '../../components/Charts/chartExport';

vi.mock('../../components/Charts/ChartFrameActionsContext', () => ({ useChartFrameActions: vi.fn() }));
vi.mock('../../components/Charts/chartExport', () => ({ exportEChart: vi.fn() }));
const data = { projectionFingerprint: 'scope', magIds: Array.from({ length: 100 }, (_, i) => `MAG_${i}`),
  samples: [{ sampleId: 'S1', disease: 'AD', batch: '1' }, { sampleId: 'S2', disease: 'NC', batch: '2' }],
  values: [Array.from({ length: 100 }, (_, i) => i), Array.from({ length: 100 }, (_, i) => i + 1)], settings: {} };
const exportConfig = { title: '导出 SVG 图形', prepareOption: () => buildMagHeatmapOption(data) };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.clearAllMocks();
  exportEChart.mockResolvedValue(true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,fixture');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('long rotated MAG labels are shortened with a visible suffix instead of a clipping region', () => {
  const source = { ...data, features: data.magIds.map(magId => ({ magId, taxonomyName: 'Very_long_species_name_with_genome_reference_information' })) };
  render(<MagZoomableHeatmap data={source} heatmapStyle={{ transposed: true }} exportConfig={exportConfig} />);
  const svg = screen.getByRole('img', { name: /横轴 MAG/ });
  const labels = svg.querySelector('.mag-heatmap-column-labels');
  expect(labels).not.toHaveAttribute('clip-path');
  const texts = labels.querySelectorAll('text');
  expect(texts.length).toBeGreaterThan(0);
  for (const label of texts) {
    expect(label.lastChild.textContent.endsWith('...')).toBe(true);
    expect(label.querySelector('title').textContent).toContain('Very_long_species_name_with_genome_reference_information');
  }
});

test('centered short matrices keep their legend, annotations and labels attached in both orientations', () => {
  const source = { ...data, samples: Array.from({ length: 50 }, (_, i) => ({ sampleId: `S${i}`, disease: 'AD', batch: '1' })),
    values: Array.from({ length: 50 }, () => data.values[0]) };
  const props = { data: source, exportConfig };
  const { rerender } = render(<MagZoomableHeatmap {...props} />);
  const check = transposed => {
    const input = screen.getByLabelText('图形缩放比例');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    const svg = screen.getByRole('img', { name: /MAG 热图，完整集合/ });
    const transform = svg.querySelector('g[transform]').getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/);
    const x = Number(transform[1]), y = Number(transform[2]), k = Number(transform[3]);
    const plot = svg.querySelector('clipPath[id$="-plot"] rect');
    const top = Number(plot.getAttribute('y')), height = Number(plot.getAttribute('height'));
    const count = transposed ? source.samples.length : source.magIds.length;
    expect(y + count * 22 * k / 2).toBeCloseTo(top + height / 2);
    expect(y).toBeGreaterThan(top);
    expect(Number(svg.querySelector('.mag-heatmap-color-legend rect').getAttribute('y'))).toBeCloseTo(y - top + 8);
    const annotation = svg.querySelector('.mag-heatmap-annotations rect');
    expect(Number(annotation.getAttribute('y'))).toBeCloseTo(transposed ? y : y - top + 43);
    const bottomLabel = svg.querySelector('.mag-heatmap-column-labels text');
    expect(Number(bottomLabel.getAttribute('y'))).toBeCloseTo(y + count * 22 * k + 15);
    fireEvent.mouseMove(svg, { clientX: x + 10 * k, clientY: y + 11 * k });
    expect(screen.getByRole('tooltip')).toHaveTextContent('S0 · AD');
    expect(screen.getByRole('tooltip')).toHaveTextContent('MAG_0');
  };
  check(false);
  rerender(<MagZoomableHeatmap {...props} heatmapStyle={{ transposed: true }} />);
  check(true);
});

test('axis swapping remaps source hover/click and minimap dimensions while retaining manual zoom', () => {
  const onSelect = vi.fn();
  const props = { data, exportConfig, onSelect };
  const { rerender } = render(<MagZoomableHeatmap {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  rerender(<MagZoomableHeatmap {...props} heatmapStyle={{ transposed: true }} />);
  const svg = screen.getByRole('img', { name: /横轴 MAG，纵轴 样本/ });
  expect(svg).toHaveAttribute('data-total-rows', '2');
  expect(screen.getByLabelText('图形缩放比例')).toHaveValue('100');
  const transform = svg.querySelector('g[transform]').getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/);
  const x = Number(transform[1]), y = Number(transform[2]), k = Number(transform[3]);
  const mag = Math.ceil((296 - x) / (20 * k)) + 1;
  fireEvent.mouseMove(svg, { clientX: x + (mag + .5) * 20 * k, clientY: y + 33 * k });
  expect(screen.getByRole('tooltip')).toHaveTextContent(`S2 · NC`);
  expect(screen.getByRole('tooltip')).toHaveTextContent(`MAG_${mag}`);
  expect(screen.getByRole('tooltip')).toHaveTextContent(`原始丰度 ${mag + 1}%`);
  fireEvent.click(svg, { clientX: x + (mag + .5) * 20 * k, clientY: y + 33 * k });
  expect(onSelect).toHaveBeenCalledWith(`MAG_${mag}`);
  const annotation = svg.querySelector('.mag-heatmap-annotations rect');
  expect(Number(annotation.getAttribute('x'))).toBeLessThan(296);
  expect(Number(annotation.getAttribute('height'))).toBeCloseTo(22.2);
  expect(svg.querySelector('.mag-heatmap-row-labels')).toHaveTextContent('S1');
  expect(svg.querySelector('.mag-heatmap-row-labels')).toHaveTextContent('S2');
});

test('tile animation completes or cancels on navigation, rapid reversal and reduced motion', () => {
  const onSelect = vi.fn();
  const frames = new Map(); let id = 0;
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', callback => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', key => frames.delete(key));
  const context = Object.fromEntries(['fillRect', 'scale', 'clearRect', 'save', 'beginPath', 'rect', 'clip', 'drawImage', 'restore'].map(key => [key, vi.fn()]));
  HTMLCanvasElement.prototype.getContext.mockReturnValue(context);
  const { rerender, container, unmount } = render(<MagZoomableHeatmap data={data} exportConfig={exportConfig} onSelect={onSelect} />);
  const swap = transposed => rerender(<MagZoomableHeatmap data={data} exportConfig={exportConfig} onSelect={onSelect} heatmapStyle={{ transposed }} />);
  const overlay = container.querySelector('.mag-heatmap-transpose-motion');
  swap(true);
  expect(overlay.hidden).toBe(false); expect(frames.size).toBe(1);
  const svg = screen.getByRole('img', { name: /MAG 热图，完整集合/ });
  expect(svg).toHaveAttribute('aria-busy', 'true');
  fireEvent.pointerDown(svg, { clientX: 400, clientY: 63 });
  fireEvent.click(svg, { clientX: 400, clientY: 63 });
  expect(onSelect).not.toHaveBeenCalled(); expect(overlay.hidden).toBe(false);
  const tick = time => { const [key, fn] = frames.entries().next().value; frames.delete(key); act(() => fn(time)); };
  tick(160); expect(overlay.hidden).toBe(false);
  tick(460); expect(overlay.hidden).toBe(true); expect(frames.size).toBe(0);
  expect(svg).not.toHaveAttribute('aria-busy');
  swap(false); expect(overlay.hidden).toBe(false);
  fireEvent.keyDown(screen.getByRole('group', { name: /MAG 热图视口/ }), { key: 'ArrowDown' });
  expect(overlay.hidden).toBe(true); expect(frames.size).toBe(0);
  swap(true); swap(false); expect(frames.size).toBe(1);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  swap(true); expect(overlay.hidden).toBe(true); expect(frames.size).toBe(0);
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  swap(false); expect(frames.size).toBe(1);
  unmount(); expect(frames.size).toBe(0);
});

test('SVG surface zooms and minimap tracks the viewport while click resolves the original MAG index', () => {
  const onSelect = vi.fn();
  render(<MagZoomableHeatmap data={data} exportConfig={exportConfig} onSelect={onSelect} />);
  const svg = screen.getByRole('img', { name: /MAG 热图，完整集合/ });
  expect(svg.tagName.toLowerCase()).toBe('svg');
  expect(svg).toHaveAttribute('data-total-rows', '100');
  const overview = screen.getByTestId('minimap-view');
  const fullHeight = Number(overview.getAttribute('height'));
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  expect(Number(overview.getAttribute('height'))).toBeLessThan(fullHeight);
  expect(Number(svg.getAttribute('data-visible-cells'))).toBeLessThan(200);
  const transform = svg.querySelector('g[transform]').getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/);
  const x = Number(transform[1]), y = Number(transform[2]), k = Number(transform[3]);
  const targetRow = Math.ceil((89 - y) / (22 * k)) + 1;
  fireEvent.mouseMove(svg, { clientX: x + 10 * k, clientY: y + (targetRow + .5) * 22 * k });
  expect(screen.getByRole('tooltip')).toHaveTextContent(`MAG_${targetRow}`);
  fireEvent.click(svg, { clientX: x + 10 * k, clientY: y + (targetRow + .5) * 22 * k });
  expect(onSelect).toHaveBeenCalledWith(`MAG_${targetRow}`);
  fireEvent.click(screen.getByRole('button', { name: '适应视口' }));
  expect(Number(overview.getAttribute('height'))).toBeCloseTo(fullHeight);
});

test('palette edits preserve manual camera and isolated export receives the full matrix', async () => {
  const props = { data, exportConfig, heatmapStyle: { palette: 'viridis' } };
  const { rerender } = render(<MagZoomableHeatmap {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  rerender(<MagZoomableHeatmap {...props} heatmapStyle={{ palette: 'magma' }} />);
  expect(screen.getByLabelText('图形缩放比例')).toHaveValue('100');
  const actions = useChartFrameActions.mock.lastCall[0];
  await act(async () => { await actions[0].onClick(); });
  expect(exportEChart).toHaveBeenCalledWith(expect.any(Object), exportConfig);
  expect(exportConfig.prepareOption().yAxis[0].data).toHaveLength(100);
});

test('render model shares the complete-matrix domain, missing cells and constant-row semantics with export', () => {
  const source = { ...data, magIds: ['MISSING', 'CONSTANT', 'VARIED'], values: [[null, 2, 5], [0, 2, 1]],
    displayValues: [[null, 0, 4], [-2, 0, -4]], constantMagIds: ['CONSTANT'], settings: { colorMode: 'rowZ' } };
  const model = heatmapRenderModel(source, {});
  const domain = buildMagHeatmapOption(source).visualMap[0];
  expect(model.min).toBe(domain.min); expect(model.max).toBe(domain.max);
  expect(model.fills[0][0]).toBe('#8f929b');
  expect(model.fills[0][1]).toBe(model.colors[8]);
  expect(model.fills[0][2]).not.toBe(model.fills[1][2]);
});

test('slider updates coalesce into one frame and an explicit fit cancels pending zoom', () => {
  const frames = new Map(); let id = 0;
  vi.stubGlobal('requestAnimationFrame', callback => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', key => frames.delete(key));
  render(<MagZoomableHeatmap data={data} exportConfig={exportConfig} />);
  const slider = screen.getByRole('slider', { name: '缩放滑动条' });
  const input = screen.getByLabelText('图形缩放比例');
  fireEvent.keyDown(slider, { key: 'End' });
  fireEvent.keyDown(slider, { key: 'Home' });
  expect(frames.size).toBe(1);
  const [key, callback] = frames.entries().next().value;
  frames.delete(key); act(() => callback(16));
  expect(input).toHaveValue('5');
  fireEvent.keyDown(slider, { key: 'End' });
  fireEvent.click(screen.getByRole('button', { name: '适应视口' }));
  expect(frames.size).toBe(0);
  expect(input).not.toHaveValue('800');
  expect(screen.getByRole('button', { name: '适应视口' })).toHaveAttribute('aria-pressed', 'true');
});

test('row labels use available space, remain next to the matrix during transitions, and live sliding cancels animation', () => {
  const source = { ...data, samples: Array.from({ length: 50 }, (_, i) => ({ sampleId: `S${i}`, disease: 'AD', batch: '1' })),
    values: Array.from({ length: 50 }, () => data.values[0]),
    features: data.magIds.map(magId => ({ magId, taxonomyName: 'Very_long_taxonomy_species_and_strain_name_with_reference_information' })) };
  const frames = new Map(); let id = 0;
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', callback => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', key => frames.delete(key));
  render(<MagZoomableHeatmap data={source} exportConfig={exportConfig} />);
  const svg = screen.getByRole('img', { name: /MAG 热图，完整集合/ });
  const labelPosition = () => {
    const label = svg.querySelector('.mag-heatmap-row-labels text');
    const transform = svg.querySelector('g[transform]').getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/);
    const left = Math.max(260, Number(transform[1]));
    expect(Number(label.getAttribute('x'))).toBeCloseTo(left - 8);
    expect(Number(svg.querySelector('clipPath[id$="-rows"] rect').getAttribute('width'))).toBeCloseTo(left - 5);
    return label.lastChild.textContent.length;
  };
  const tick = time => {
    const [key, callback] = frames.entries().next().value;
    frames.delete(key); act(() => callback(time));
  };
  const wideLength = labelPosition();
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  expect(frames.size).toBe(1);
  tick(90); labelPosition();
  tick(180);
  const minimumLength = labelPosition();
  expect(minimumLength).toBe(Math.floor((260 - 12) / (11 * .6)));
  expect(wideLength).toBeGreaterThan(minimumLength);
  fireEvent.click(screen.getByRole('button', { name: '适应视口' }));
  expect(frames.size).toBe(1);
  fireEvent.keyDown(screen.getByRole('slider', { name: '缩放滑动条' }), { key: 'End' });
  const [key, callback] = [...frames.entries()].at(-1);
  frames.delete(key); act(() => callback(200));
  expect(frames.size).toBe(0);
  expect(screen.getByLabelText('图形缩放比例')).toHaveValue('800');
  expect(labelPosition()).toBe(minimumLength);
});
