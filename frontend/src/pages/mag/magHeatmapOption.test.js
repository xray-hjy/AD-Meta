import { buildMagHeatmapOption, magHeatmapLayout, HEATMAP_PALETTES, ROW_Z_PALETTE, ROW_Z_PALETTES } from './magHeatmapOption';

const data = { magIds: ['MAG_A', 'MAG_B'], features: [{ magId: 'MAG_A', taxonomyName: 'Species A' }],
  samples: [{ sampleId: 'S1', disease: 'AD', batch: '1', age: 70, gender: 'F' }, { sampleId: 'S2', disease: 'NC', batch: '2', age: 80, gender: 'M' }],
  values: [[9, 0], [99, 0]], displayValues: [[1, 0], [2, 0]], settings: { sampleOrder: 'group', colorMode: 'abundance' } };

test('sequential palette has no white endpoint and annotations cannot alter the abundance scale', () => {
  const option = buildMagHeatmapOption(data);
  expect(option.visualMap[0].inRange.color).toEqual(HEATMAP_PALETTES.pubugn);
  expect(option.visualMap[0].inRange.color).not.toContain('#ffffff');
  expect(option.visualMap[0].seriesIndex).toBe(0);
  expect(option.visualMap[1]).toMatchObject({ seriesIndex: 1, show: false });
  expect(option.series[0].data).toEqual([[0, 0, 1], [0, 1, 0], [1, 0, 2], [1, 1, 0]]);
  expect(option.yAxis[1].data).toEqual(['疾病', '批次']);
  expect(option.tooltip.formatter({ value: [0, 0, 1], seriesIndex: 0 })).toContain('原始丰度 9%');
});

test('row Z-score uses a symmetric diverging legend and explicitly identifies constant rows', () => {
  const option = buildMagHeatmapOption({ ...data, displayValues: [[-1, 0], [1, 0]], constantMagIds: ['MAG_B'], settings: { colorMode: 'rowZ' } });
  expect(option.visualMap[0]).toMatchObject({ min: -1, max: 1 });
  expect(option.visualMap[0].inRange.color).toEqual(ROW_Z_PALETTE);
  expect(option.series[0].data[1]).toMatchObject({ value: [0, 1, 0], itemStyle: { color: ROW_Z_PALETTE[8] } });
  expect(option.tooltip.formatter({ value: [0, 1, 0], seriesIndex: 0 })).toContain('无变异');
});

test('standard palette selection changes only colors and Z-score families retain a neutral zero', () => {
  const before = buildMagHeatmapOption(data);
  const after = buildMagHeatmapOption(data, { palette: 'cividis' });
  expect(after.visualMap[0].inRange.color).toEqual(HEATMAP_PALETTES.cividis);
  expect(after.series[0].data).toEqual(before.series[0].data);
  const z = buildMagHeatmapOption({ ...data, settings: { colorMode: 'rowZ' }, constantMagIds: ['MAG_B'] }, { divergingPalette: 'brbg' });
  expect(z.visualMap[0].inRange.color).toEqual(ROW_Z_PALETTES.brbg);
  expect(z.series[0].data[1].itemStyle.color).toBe(ROW_Z_PALETTES.brbg[8]);
  expect(buildMagHeatmapOption(data, { palette: 'lagoon' }).visualMap[0].inRange.color).toEqual(HEATMAP_PALETTES.pubugn);
});

test('chart windows preserve full-collection color limits, raw lookup and full clustering order', () => {
  const option = buildMagHeatmapOption(data, { annotations: false }, { start: 1, count: 1 });
  expect(option.yAxis[0].data).toEqual(['MAG_B']);
  expect(option.series[0].data).toEqual([[0, 0, 0], [1, 0, 0]]);
  expect(option.visualMap[0].max).toBe(2);
  expect(option.series).toHaveLength(1);
  expect(option.tooltip.formatter({ value: [0, 0, 0], seriesIndex: 0 })).toContain('MAG_B');
  const clustered = buildMagHeatmapOption({ ...data, settings: { sampleOrder: 'cluster' } });
  expect(clustered.series[0]).not.toHaveProperty('markLine');
});

test('missing cells are visually distinct from genuine zeros and optional demographics are annotated', () => {
  const option = buildMagHeatmapOption({ ...data, values: [[null, 0], [99, 0]], displayValues: [[null, 0], [2, 0]] }, { demographics: true, borders: true });
  expect(option.series[0].data[0].itemStyle.color).toBe('#8f929b');
  expect(option.series[0].data[1]).toEqual([0, 1, 0]);
  expect(option.yAxis[1].data).toEqual(['疾病', '批次', '年龄', '性别']);
});

test('dense heatmaps retain near-square cells and aligned annotation columns', () => {
  const dense = { ...data, samples: Array.from({ length: 185 }, (_, i) => ({ sampleId: `S${i}`, disease: 'AD', batch: '1' })),
    values: Array.from({ length: 185 }, () => [1, 0]), displayValues: Array.from({ length: 185 }, () => [1, 0]) };
  const option = buildMagHeatmapOption(dense);
  const layout = magHeatmapLayout(185, 2);
  expect(option.grid[0].width / 185).toBe(20);
  expect(option.grid[0].height / 2).toBe(22);
  expect(option.grid[1].width).toBe(option.grid[0].width);
  expect(layout.width).toBeGreaterThan(3700);
  expect(layout.height).toBe(option.grid[0].top + option.grid[0].height + 90);
  expect(option.visualMap[0].left).toBe(option.grid[0].left);
});

test('wide viewports fill the available width while retaining cell proportions and export geometry', () => {
  const layout = magHeatmapLayout(185, 50, {}, 9844);
  expect(layout.width).toBe(9844);
  expect(layout.plotWidth / 185 / (layout.plotHeight / 50)).toBeCloseTo(20 / 22);
  expect(magHeatmapLayout(185, 50, {}, 1000).width).toBe(4020);
  expect(magHeatmapLayout(185, 50).width).toBe(4020);
  const wide = buildMagHeatmapOption(data, {}, { width: 1000 });
  expect(wide.grid[0].width).toBe(680);
  expect(wide.grid[1].width).toBe(wide.grid[0].width);
  expect(wide.series[0].data).toEqual(buildMagHeatmapOption(data).series[0].data);
});

test('transposed exports swap geometry and annotations without changing source values, domains or MAG normalization', () => {
  const source = { ...data, magIds: ['MAG_A', 'MAG_B', 'MAG_C'],
    values: [[9, 0, null], [99, 0, 2]], displayValues: [[-1, 0, null], [1, 0, 2]],
    settings: { colorMode: 'rowZ' }, constantMagIds: ['MAG_B'] };
  const before = buildMagHeatmapOption(source, { demographics: true });
  const after = buildMagHeatmapOption(source, { demographics: true, transposed: true });
  expect(after.xAxis[0].data).toEqual(source.magIds);
  expect(after.yAxis[0].data).toEqual(['S1', 'S2']);
  expect(after.visualMap[0]).toMatchObject({ min: before.visualMap[0].min, max: before.visualMap[0].max });
  expect(after.visualMap[0].text[0]).toContain('按 MAG 标准化');
  expect(after.series[0].data[2]).toMatchObject({ value: [2, 0, before.visualMap[0].min], itemStyle: { color: '#8f929b' } });
  expect(after.series[0].data[1]).toMatchObject({ value: [1, 0, 0], itemStyle: { color: ROW_Z_PALETTE[8] } });
  expect(after.tooltip.formatter({ value: [0, 1, 1], seriesIndex: 0 })).toContain('原始丰度 99%');
  expect(after.xAxis[1].data).toEqual(['疾病', '批次', '年龄', '性别']);
  expect(after.yAxis[1].data).toEqual(['S1', 'S2']);
  expect(after.series[1].data[4].value).toEqual([0, 1, 1]);
  expect(after.grid[1].height).toBe(after.grid[0].height);
  expect(after.grid[1].left + after.grid[1].width).toBeLessThan(after.grid[0].left);
  expect(after.grid[0].width / 3).toBe(20);
  expect(after.grid[0].height / 2).toBe(22);
  expect(after.series[0].markLine.data).toEqual([{ yAxis: .5 }]);
  expect(source.displayValues).toEqual([[-1, 0, null], [1, 0, 2]]);
});

test('exported trees align with reordered heatmap cells and move with the axes', () => {
  const source = { ...data, settings: { sampleOrder: 'cluster', rowOrder: 'cluster' }, dendrograms: {
    mags: { leafIds: ['MAG_B', 'MAG_A'], merges: [[0, 1, 3, 2]] },
    samples: [{ group: 'all', leafIds: ['S2', 'S1'], merges: [[0, 1, 4, 2]] }],
  } };
  const normal = buildMagHeatmapOption(source), rotated = buildMagHeatmapOption(source, { transposed: true });
  for (const option of [normal, rotated]) {
    expect(option.graphic).toHaveLength(2);
    const top = option.graphic.find(g => g.id.startsWith('tree-top'));
    expect(top.shape.points[0][0]).toBe(option.grid[0].left + option.grid[0].width * .75);
    expect(top.shape.points[3][0]).toBe(option.grid[0].left + option.grid[0].width * .25);
    const left = option.graphic.find(g => g.id.startsWith('tree-left'));
    expect(left.shape.points[0][1]).toBe(option.grid[0].top + option.grid[0].height * .75);
    expect(left.shape.points[3][1]).toBe(option.grid[0].top + option.grid[0].height * .25);
    expect(left.shape.points[0][0]).toBeLessThan(option.grid[0].left);
    expect(top.shape.points[0][1]).toBeLessThan(option.grid[0].top);
  }
  const hidden = buildMagHeatmapOption(source, { dendrograms: false });
  expect(hidden.graphic).toEqual([]);
  expect(hidden.series[0].data).toEqual(normal.series[0].data);
});

test('dense fitted exports reserve readable trees and labels instead of shrinking natural-sized margins', () => {
  const source = { magIds: Array.from({ length: 872 }, (_, i) => `MAG_${i}`),
    samples: Array.from({ length: 185 }, (_, i) => ({ sampleId: `S${i}`, disease: 'AD', batch: '1' })),
    values: Array.from({ length: 185 }, () => Array.from({ length: 872 }, (_, i) => i % 2)),
    settings: { sampleOrder: 'cluster', rowOrder: 'cluster' }, dendrograms: {
      mags: { leafIds: ['MAG_0', 'MAG_1'], merges: [[0, 1, 3, 2]] },
      samples: [{ group: 'all', leafIds: ['S0', 'S1'], merges: [[0, 1, 2, 2]] }],
    } };
  for (const transposed of [false, true]) {
    const option = buildMagHeatmapOption(source, { transposed, demographics: true }, { fit: true, width: 1100, height: 640 });
    const grid = option.grid[0];
    expect(grid.left + grid.width).toBeLessThanOrEqual(1055);
    expect(grid.top + grid.height).toBeLessThanOrEqual(540);
    expect(option.series[0].data).toHaveLength(185 * 872);
    expect(option.yAxis[0].axisLabel.fontSize).toBe(11);
    expect(option.yAxis[0].axisLabel.interval).toBeGreaterThan(0);
    expect(option.xAxis[0].axisLabel.interval).toBeGreaterThan(0);
    const top = option.graphic.find(item => item.id.startsWith('tree-top'));
    const left = option.graphic.find(item => item.id.startsWith('tree-left'));
    expect(top.shape.points[0][1] - top.shape.points[1][1]).toBeCloseTo(80);
    expect(left.shape.points[0][0] - left.shape.points[1][0]).toBeCloseTo(80);
    expect(option.visualMap[0].top + 30).toBeLessThan(grid.top - 96);
    expect(option.grid[1][transposed ? 'height' : 'width']).toBe(grid[transposed ? 'height' : 'width']);
  }
});
