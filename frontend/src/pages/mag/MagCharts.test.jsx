import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MagChart, { comparisonOption, distributionOption, heatmapOption, mappingOption, qualityOption, taxonomyOption } from './MagCharts';

vi.mock('../../components/Charts/CartesianEChart', () => ({ default: ({ opts, exportConfig }) =>
  <div data-testid="chart" data-renderer={opts?.renderer} data-export-format={exportConfig?.format} /> }));
vi.mock('../../components/Charts/ZoomableGroupedBarChart', () => ({ default: ({ model, exportConfig }) =>
  <div data-testid="chart" data-renderer="svg" data-export-format={exportConfig.format} data-count={model.items.length} /> }));
vi.mock('./MagZoomableHeatmap', () => ({ default: ({ data, exportConfig, onSelect }) =>
  <div data-testid="chart" data-renderer="svg" data-export-format={exportConfig?.format}
    data-visible-rows={data.magIds.length} data-export-rows={exportConfig?.prepareOption?.()?.yAxis?.[0]?.data.length}>
    <button onClick={() => onSelect?.(data.magIds[0])}>选择首个热图单元格</button>
  </div> }));

test.each(['features', 'distribution', 'heatmap', 'taxonomy', 'quality', 'mapping'])('%s renders SVG even when downloading PNG', view => {
  const data = {
    provenance: { version: 'mag_v3', requestFingerprint: 'test-scope', groupCounts: { AD: 1, NC: 0 }, magCount: 872 },
    feature: { magId: 'MAG_A' },
    items: [{ magId: 'MAG_A', adMeanPercent: 1, ncMeanPercent: null, label: 'Bacillota', count: 1, percent: 100,
      completenessPercent: 95, contaminationPercent: 2, inReferenceBand: true,
      sampleId: 'CRR1', disease: 'AD', batch: '1', mappedPercent: 60, aboveThresholdMagCount: 2 }],
    boxes: [{ group: 'AD', values: [1, 1, 1, 1, 1] }],
    samples: [{ sampleId: 'CRR1', disease: 'AD', abundancePercent: 1, batch: '1' }],
    magIds: ['MAG_A'], values: [[1]], sortBy: 'meanPercent',
  };
  render(<MagChart view={view} data={data} format="png" size="standard" />);
  expect(screen.getByTestId('chart')).toHaveAttribute('data-renderer', 'svg');
  expect(screen.getByTestId('chart')).toHaveAttribute('data-export-format', 'png');
});

test('comparison uses unnormalized percent and keeps absent groups missing', () => {
  const option = comparisonOption([{ magId: 'MAG_A', adMeanPercent: 20, ncMeanPercent: null }]);
  expect(option.series[0].data).toEqual([20]);
  expect(option.series[1].data).toEqual([null]);
  expect(option.xAxis[0]).not.toHaveProperty('max');
  expect(option.series[0].barWidth).toBe(11);
  expect(option.series[0].itemStyle.borderRadius).toEqual([0, 6, 6, 0]);
  expect(option.tooltip.axisPointer.lineStyle.type).toBe('dashed');
});

test('single MAG shares boxes without recomputation and retains zeros, stable jitter and empty groups', () => {
  const data = { feature: { magId: 'MAG_A' }, provenance: { groupCounts: { AD: 2, NC: 0 } },
    boxes: [{ group: 'AD', values: [0, 0.25, 0.5, 0.75, 1] }],
    samples: [{ sampleId: 'CRR1', disease: 'AD', abundancePercent: 0 }, { sampleId: 'CRR2', disease: 'AD', abundancePercent: 1 }] };
  const option = distributionOption(data);
  expect(option.series[0].data[0].value).toEqual(data.boxes[0].values);
  expect(option.series[0].data[1].value).toEqual(['-', '-', '-', '-', '-']);
  expect(option.series[1].data.map(point => point.value[1])).toEqual([0, 1]);
  expect(option.series[2].data).toEqual([]);
  expect(option.series[1].data[0].symbolOffset[1]).toBe(0);
  expect(option.series[1].data[0].symbolOffset).toEqual(distributionOption(data).series[1].data[0].symbolOffset);
  expect(option.series[1].data[1].symbolOffset).toEqual(distributionOption({ ...data, samples: [data.samples[1]] }).series[1].data[0].symbolOffset);
  expect(option.xAxis.axisLabel.formatter('NC')).toBe('NC (n=0)');
  expect(option.tooltip.formatter({ seriesType: 'scatter', data: option.series[1].data[0] })).toContain('0%');
});

test('heatmap color transform does not change reported raw abundance', () => {
  const option = heatmapOption({ magIds: ['MAG_A'], samples: [{ sampleId: 'CRR1', disease: 'AD', batch: '1' }], values: [[9]] });
  expect(option.series[0].data).toEqual([[0, 0, 1]]);
  expect(option.tooltip.formatter({ value: [0, 0, 1] })).toContain('9%');
  expect(option.visualMap[0]).toMatchObject({ orient: 'horizontal', top: 6 });
  expect(option.visualMap[0]).not.toHaveProperty('bottom');
  expect(option.grid[0].top).toBeGreaterThan(50);
});

test('continuous heatmap and export include the whole selected collection', () => {
  const magIds = Array.from({ length: 100 }, (_, i) => `MAG_${i}`);
  const onSelect = vi.fn();
  const data = { provenance: { version: 'mag_v3', requestFingerprint: 'scope' }, projectionFingerprint: 'heatmap-settings',
    magIds, samples: [{ sampleId: 'S1', disease: 'AD', batch: '1' }], values: [magIds.map(() => 1)], settings: { colorMode: 'abundance' } };
  render(<MagChart view="heatmap" data={data} format="svg" size="standard" onSelect={onSelect} />);
  const chart = screen.getByTestId('chart');
  expect(chart).toHaveAttribute('data-visible-rows', '100');
  expect(chart).toHaveAttribute('data-export-rows', '100');
  screen.getByRole('button', { name: '选择首个热图单元格' }).click();
  expect(onSelect).toHaveBeenCalledWith('MAG_0');
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
