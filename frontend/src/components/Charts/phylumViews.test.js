import { buildPhylumOption, phylumColor, precise, shownSamples } from './phylumViews';
const data = { semantics: { abundanceScale: 'relative_abundance', groupCounts: { AD: 1, NC: 1 } },
  items: [{ feature: 'Rare', values: { AD: 1e-10, NC: 2e-10 } }, { feature: 'Main', values: { AD: .3, NC: .4 } }],
  series: [{ key: 'AD', group: 'AD', label: 'AD' }, { key: 'NC', group: 'NC', label: 'NC' }],
  samples: [{ sample: '<img>', group: 'AD', values: { Rare: 1e-10, Main: .3 } }, { sample: 'NC1', group: 'NC', values: { Rare: 2e-10, Main: .4 } }] };

test('tiny values remain nonzero and colors are stable across views', () => {
  expect(precise(1e-10)).not.toBe('0');
  const stacked = buildPhylumOption(data, 'stacked');
  const samples = buildPhylumOption(data, 'samples');
  expect(stacked.series[0].itemStyle.color).toBe(samples.series[0].itemStyle.color);
  expect(phylumColor('Rare', true)).toBe(samples.series[0].itemStyle.color);
  expect(stacked.series[0].data[0]).toBe(1e-8);
});

test('heatmap log affects color only; hover returns raw abundance and escapes sample labels', () => {
  const heatmap = buildPhylumOption(data, 'heatmap', { heatTransform: 'log' });
  expect(heatmap.visualMap.dimension).toBe(2);
  expect(heatmap.aria.decal.show).toBe(false);
  const point = heatmap.series[0].data[0];
  expect(point[2]).toBe(Math.log10(1 + 1e-8));
  expect(point[3]).toBe(1e-8);
  const hover = heatmap.series[0].tooltip.formatter({ value: point });
  expect(hover).toContain('&lt;img&gt;');
  expect(hover).not.toContain('<img>');
});

test('mean differences use percentage points without inference claims', () => {
  const option = buildPhylumOption(data, 'difference');
  expect(option.series[0].data[1][0]).toBeCloseTo(-10);
  expect(option.xAxis.name).toContain('百分点 pp');
  expect(option.series[0].tooltip.formatter({ value: [-10, 'Main'] })).toContain('不代表统计显著性');
});

test('sample browsing retains original objects and sorting never mutates input', () => {
  const before = JSON.stringify(data.samples);
  expect(shownSamples(data, 'abundance', 'Main')).toHaveLength(2);
  expect(JSON.stringify(data.samples)).toBe(before);
});
