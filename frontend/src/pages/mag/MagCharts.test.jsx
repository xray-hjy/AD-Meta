import { vi } from 'vitest';
import { comparisonOption, distributionOption, heatmapOption, mappingOption, qualityOption, taxonomyOption } from './MagCharts';

vi.mock('../../components/Charts/CartesianEChart', () => ({ default: () => null }));
vi.mock('../../components/Charts/HeatmapEChart', () => ({ default: () => null }));

test('comparison uses unnormalized percent and keeps absent groups missing', () => {
  const option = comparisonOption([{ magId: 'MAG_A', adMeanPercent: 20, ncMeanPercent: null }]);
  expect(option.series[0].data).toEqual([20]);
  expect(option.series[1].data).toEqual([null]);
});

test('heatmap color transform does not change reported raw abundance', () => {
  const option = heatmapOption({ magIds: ['MAG_A'], samples: [{ sampleId: 'CRR1', disease: 'AD', batch: '1' }], values: [[9]] });
  expect(option.series[0].data).toEqual([[0, 0, 1]]);
  expect(option.tooltip.formatter({ value: [0, 0, 1] })).toContain('9%');
  expect(option.visualMap).toMatchObject({ orient: 'horizontal', top: 6 });
  expect(option.visualMap).not.toHaveProperty('bottom');
  expect(option.grid.top).toBeGreaterThan(50);
});

test('distribution retains all samples and mapping charts use mapping not coverage', () => {
  const data = { provenance: { groupCounts: { AD: 1, NC: 0 }, magCount: 3 }, boxes: [{ group: 'AD', values: [1, 1, 1, 1, 1] }],
    samples: [{ sampleId: 'CRR1', disease: 'AD', abundancePercent: 1 }], items: [{ sampleId: 'CRR1', disease: 'AD', batch: '1', mappedPercent: 60, aboveThresholdMagCount: 2 }] };
  expect(distributionOption(data).series[1].data[0].value).toEqual(['AD', 1]);
  expect(mappingOption(data).series[0].data[0].value).toEqual([60, 2]);
});

test('taxonomy ranks MAG counts without a redundant categorical legend', () => {
  const option = taxonomyOption({ items: [{ label: 'Bacillota', count: 12, percent: 60 }, { label: '其他分类', count: 8, percent: 40 }] });
  expect(option.yAxis.data).toEqual(['Bacillota', '其他分类']);
  expect(option.series).toHaveLength(1);
  expect(option.series[0].data[0]).toMatchObject({ value: 12, percent: 60 });
  expect(option).not.toHaveProperty('legend');
});

test('quality uses all MAGs at one grain with explicit reference lines and no bubble encoding', () => {
  const option = qualityOption({ items: [
    { magId: 'MAG_A', completenessPercent: 95, contaminationPercent: 2, contigN50Bp: 500, totalContigs: 10, genomeSizeBp: 1000, inReferenceBand: true },
    { magId: 'MAG_B', completenessPercent: 80, contaminationPercent: 6, contigN50Bp: 300, totalContigs: 20, genomeSizeBp: 2000, inReferenceBand: false },
  ] });
  expect(option.series[0].data[0].value).toEqual([95, 2]);
  expect(option.series[1].data[0].value).toEqual([80, 6]);
  expect(option.series[0].symbolSize).toBe(7);
  expect(option.series[1].symbolSize).toBe(7);
  expect(option.series[0].markLine.data).toEqual(expect.arrayContaining([expect.objectContaining({ xAxis: 90 }), expect.objectContaining({ yAxis: 5 })]));
  expect(option.xAxis).toMatchObject({ min: 50, max: 100 });
  expect(option.yAxis).toMatchObject({ min: 0, max: 10 });
});
