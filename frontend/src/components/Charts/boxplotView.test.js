// @vitest-environment node
import { init, use as registerCharts } from 'echarts/core';
import { BoxplotChart, ScatterChart, CustomChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, GraphicComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { boxplotRanges, boxplotTable, buildBoxplotView, facetHeight, facetLayout, formatAbundance, outsidePoints } from './boxplotView';
import { applyBoxStyle } from './boxStyle';

registerCharts([BoxplotChart, ScatterChart, CustomChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, GraphicComponent, SVGRenderer]);
const series = [{ key: 'AD', label: 'AD', color: '#e74c3c' }, { key: 'NC', label: 'NC', color: '#2ecc71' }];
function item(id, multiplier = 1) {
  return { featureId: id, shortName: id, fullName: `s__${id}`, groupStats: Object.fromEntries(series.map(group => {
    const n = group.key === 'AD' ? 20 : 18;
    return [group.key, { sampleCount: n, validCount: n, missingCount: 0, detectedCount: multiplier ? n / 2 : 0,
      zeroCount: multiplier ? n / 2 : n, detectionRate: multiplier ? 0.5 : 0 }];
  })), values: Object.fromEntries(series.map(group => [group.key, {
    raw: { box: [0, 1, 2, 3, 4].map(value => value * multiplier), outlierPoints: [{ sample: `${group.key}-${id}`, value: 100 * multiplier }] },
  }])) };
}
const available = Array.from({ length: 8 }, (_, index) => item(`species-${index}`, index + 1));
const model = { available, series, activeTransform: { key: 'raw', label: '相对丰度（%）' }, groupCounts: { AD: 20, NC: 18 }, page: 1, pageSize: 6, columns: 2, width: 1100 };

test('independent extents differ; shared extents cover all pages, including the largest last species', () => {
  const independent = boxplotRanges(available, series, 'raw', 'independent', false);
  const shared = boxplotRanges(available, series, 'raw', 'shared', false);
  expect(independent[0].max).toBeLessThan(independent[7].max);
  expect(new Set(shared.map(range => range.max)).size).toBe(1);
  expect(shared[0].max).toBeGreaterThanOrEqual(800);
  const page1 = buildBoxplotView({ ...model, axisMode: 'shared' });
  const page2 = buildBoxplotView({ ...model, axisMode: 'shared', page: 2 });
  expect(page2.yAxis[0].max).toBe(page1.yAxis[0].max);
  expect(page2.grid).toHaveLength(2);
});

test('focused viewport retains every box and outlier ID and exports its limits and counts', () => {
  const full = buildBoxplotView(model);
  const focused = buildBoxplotView({ ...model, focus: true });
  expect(focused.series).toEqual(full.series);
  expect(focused.yAxis[0].max).toBeLessThan(full.yAxis[0].max);
  expect(focused.graphic.find(entry => entry.id === 'range-0').style.text).toContain('视野外 AD 1 / NC 1');
  const ranges = boxplotRanges(available, series, 'raw', 'independent', true);
  expect(outsidePoints(available[0], series, 'raw', ranges[0])[0]).toMatchObject({ sample: 'AD-species-0', value: 100 });
  const table = boxplotTable(available, series, model.activeTransform, ranges);
  expect(table.rows).toHaveLength(32);
  expect(table.rows.find(row => row.sample === 'NC-species-7')).toMatchObject({ viewport: '视野外（数据保留）' });
  const chart = init(null, null, { renderer: 'svg', ssr: true, width: 1100, height: facetHeight(6, 2) });
  try {
    chart.setOption(applyBoxStyle(focused, { medians: true }, { formatValue: formatAbundance }));
    const svg = chart.renderToSVGString();
    expect(svg).toContain('视野外 AD 1 / NC 1');
    expect(svg).toContain('纵轴独立');
    expect(svg).toContain('AD (n=20)');
    expect(svg).toContain('species-5');
    expect(svg).toContain('>12</text>'); // sixth facet's existing median, independent of other grids
  } finally { chart.dispose(); }
});

test('all-zero boxes retain nonzero outliers, use a valid full-range fallback and disclose degeneracy', () => {
  const zero = item('zero', 0);
  zero.values.AD.raw.outlierPoints = [{ sample: 'rare', value: 0.000008 }];
  const option = buildBoxplotView({ ...model, available: [zero], focus: true });
  expect(option.yAxis[0].max).toBeGreaterThan(0.000008);
  expect(option.graphic.find(entry => entry.id === 'range-0').style.text).toContain('箱须为零');
  expect(option.graphic.find(entry => entry.id === 'zero-0').style.text).toContain('箱体及箱须均为 0');
  expect(option.series[1].data[0].value[1]).toBe(0.000008);
  expect(formatAbundance(0.000008)).toBe('8.00e-6');
  expect(formatAbundance(0)).toBe('0');
});

test('focus contains interpolated quartiles even when they exceed the last inlier in a small sparse group', () => {
  const sparse = item('sparse');
  sparse.values.AD.raw.box = [0, 0, 0.5, 25.75, 1];
  const [range] = boxplotRanges([sparse], series, 'raw', 'independent', true);
  expect(range.max).toBeGreaterThanOrEqual(25.75);
  expect(range.max).toBeLessThan(100);
});

test('missing observations have no box and report effective versus scoped sample counts', () => {
  const missing = item('missing');
  missing.values.AD.raw.box = null;
  missing.values.AD.raw.outlierPoints = [];
  missing.groupStats.AD = { sampleCount: 20, validCount: 0, missingCount: 20, detectedCount: 0, zeroCount: 0, detectionRate: null };
  const option = buildBoxplotView({ ...model, available: [missing] });
  expect(option.series[0].data[0].value).toEqual(['-', '-', '-', '-', '-']);
  expect(option.xAxis[0].axisLabel.formatter('AD')).toBe('AD (n=0/20)');
  expect(option.graphic.find(entry => entry.id === 'detection-0').style.text).toContain('AD —');
  expect(option.graphic.find(entry => entry.id === 'zero-0').style.text).toContain('无有效数值');
});

test('responsive pagination and unreported sample counts do not fabricate zero sample sizes', () => {
  expect(facetLayout(1100)).toEqual({ columns: 2, pageSize: 6 });
  expect(facetLayout(800)).toEqual({ columns: 2, pageSize: 4 });
  expect(facetLayout(350)).toEqual({ columns: 1, pageSize: 2 });
  const option = buildBoxplotView({ ...model, available: available.map(item => ({ ...item, groupStats: undefined })), groupCounts: undefined });
  expect(option.xAxis[0].axisLabel.formatter('AD')).toBe('AD');
  const narrow = buildBoxplotView({ ...model, columns: 1, width: 350 });
  expect(narrow.graphic.find(entry => entry.id === 'axis-note').y).toBe(64);
  expect(narrow.grid[0].top).toBeGreaterThan(160);
  expect(facetHeight(2, 1, 350)).toBe(940);
  const single = buildBoxplotView({ ...model, available: [available[0]] });
  expect(single.grid[0].width).toBe(1100 - 86);
});
