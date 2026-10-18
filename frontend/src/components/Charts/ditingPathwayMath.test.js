import { describe, expect, it } from 'vitest';
import { clusterOrder, density, empiricalCdf, summarize, swarmOffsets, zScores } from './ditingPathwayMath';
import { buildPathwayOption, PATHWAY_VIEWS, prepareHeatmap } from './ditingPathwayOptions';

describe('pathway observation and distribution calculations', () => {
  it('retains the entire mass of tied zeros in an empirical CDF', () => {
    expect(empiricalCdf([3, 0, 2, 0])).toEqual([[0, 0], [0, .5], [2, .75], [3, 1]]);
    expect(empiricalCdf([0, 0, 0])).toEqual([[0, 0], [0, 1]]);
  });
  it('does not invent a contour for constant data and keeps the reflected KDE nonnegative and normalized', () => {
    expect(density([0, 0, 0]).curve).toEqual([]);
    expect(density([2, 2, 2]).curve).toEqual([]);
    const estimate = density([0, 0, .1, .5, 1, 2], 1, 4096);
    expect(estimate.curve.every(([x, y]) => x >= 0 && y >= 0 && Number.isFinite(y))).toBe(true);
    const area = estimate.curve.slice(1).reduce((sum, [x, y], i) => sum + (x - estimate.curve[i][0]) * (y + estimate.curve[i][1]) / 2, 0);
    expect(area).toBeCloseTo(1, 3);
  });
  it('places coincident observations apart when there is enough screen space', () => {
    const points = Array.from({ length: 6 }, (_, index) => ({ id: String(index), index, v: 1 }));
    const offsets = [...swarmOffsets(points, v => v * 100, 7, 80).values()];
    offsets.forEach((x, i) => offsets.slice(i + 1).forEach(y => expect(Math.abs(x - y)).toBeGreaterThanOrEqual(7)));
    expect(swarmOffsets(points, v => v * 100, 7, 80)).toEqual(swarmOffsets(points, v => v * 100, 7, 80));
  });
  it('uses within-fence whiskers rather than the numerical fence or the extreme outlier', () => {
    const stats = summarize([0, 1, 2, 3, 4, 100]);
    expect(stats.hi).toBe(4); expect(stats.max).toBe(100);
    expect(zScores([5, 5, 5])).toEqual([0, 0, 0]);
  });
  it('average linkage merges close vectors first while preserving each leaf exactly once', () => {
    const tree = clusterOrder([[0, 0], [10, 10], [.1, .1]], ['a', 'b', 'c']);
    expect(tree.merges[0].slice(0, 2).sort()).toEqual([0, 2]);
    expect([...tree.order].sort()).toEqual([0, 1, 2]);
    expect(tree.merges.at(-1)[3]).toBe(3);
  });
});

const samples = ['AD', 'AD', 'NC', 'NC'].map((group, index) => ({ id: `S${index}`, index, group }));
const feature = (id, values) => ({ id, name: `pathway ${id}`, values, mean: values.reduce((a, b) => a + b) / values.length,
  groups: { AD: { mean: 2, median: 2, detected: 2, count: 2 }, NC: { mean: 1, median: 1, detected: 2, count: 2 } },
  effect: .25, ci: [-.2, .6], pValue: .04, qValue: .7 });
const style = { heatScale: 'z', heatPalette: 'blueRed', trees: true, smoothing: '1', outline: true, hover: true, legend: true, grid: true,
  pointSize: '6', opacity: '.65', fontSize: '11', reference: true };
it('all ten views preserve source values and the full-table p/q values', () => {
  const items = [feature('a', [0, 2, 4, 0]), feature('zero', [0, 0, 0, 0])];
  const original = JSON.stringify(items), heatmapModel = prepareHeatmap(items, samples);
  expect(heatmapModel.items.at(-1).id).toBe('zero');
  expect(heatmapModel.tree.leafIds).toEqual(['a']);
  const views = Object.values(PATHWAY_VIEWS).flat().map(([key]) => key);
  expect(views).toHaveLength(10);
  for (const view of views) {
    const option = buildPathwayOption({ view, items, samples, style, colors: { AD: '#d55e00', NC: '#0072b2' }, heatmapModel });
    expect(option.series.length).toBeGreaterThan(0);
    expect(JSON.stringify(items)).toBe(original);
  }
  const option = buildPathwayOption({ view: 'raincloud', items: [items[0]], samples, style, colors: { AD: '#d55e00', NC: '#0072b2' } });
  expect(option.series.flatMap(series => series.data).filter(point => point.sampleId).map(point => point.sampleId).sort()).toEqual(samples.map(sample => sample.id));
  const normal = buildPathwayOption({ view: 'heatmap', items, samples, style, colors: { AD: '#d55e00', NC: '#0072b2' }, heatmapModel });
  const transposed = buildPathwayOption({ view: 'heatmap', items, samples, style: { ...style, transposed: true }, colors: { AD: '#d55e00', NC: '#0072b2' }, heatmapModel });
  normal.series[0].data.forEach((cell, index) => {
    expect(transposed.series[0].data[index].value).toEqual([cell.value[1], cell.value[0], cell.value[2]]);
    expect(transposed.series[0].data[index].raw).toBe(cell.raw);
  });
});
