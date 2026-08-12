import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('./CartesianEChart', () => ({
  __esModule: true,
  default: ({ option, opts }) => {
    const firstOutlier = option?.series?.[2]?.data?.[0];
    const tooltip = option?.tooltip?.formatter?.({
      seriesType: 'scatter',
      data: firstOutlier,
    }) || '';
    return (
      <div>
        <div data-testid="boxplot-outlier-tooltip">{tooltip}</div>
        <div data-testid="boxplot-chart">{JSON.stringify(option)}</div>
        <div data-testid="boxplot-renderer">{opts?.renderer}</div>
      </div>
    );
  },
}));

import BoxPlot from './BoxPlot';

function item(index) {
  return {
    featureId: `feature-${index}`,
    fullName: `k__Bacteria|s__Species_${index}`,
    shortName: `Species_${index}`,
    total: 1000 - index,
    adBox: [10, 10.25, 11.5, 12.75, 13],
    ncBox: [1, 1, 1, 1, 1],
    adOutliers: [0, 100],
    ncOutliers: [],
    adOutlierPoints: [{ sample: `AD${index}`, value: 0 }, { sample: `AD${index + 5}`, value: 100 }],
    ncOutlierPoints: [],
    adSqrtBox: [3.16, 3.2, 3.39, 3.57, 3.61],
    ncSqrtBox: [1, 1, 1, 1, 1],
    adSqrtOutliers: [0, 10],
    ncSqrtOutliers: [],
    adSqrtOutlierPoints: [{ sample: `AD${index}`, value: 0 }, { sample: `AD${index + 5}`, value: 10 }],
    ncSqrtOutlierPoints: [],
    adLogBox: [1, 1.04, 1.06, 1.1, 1.14],
    ncLogBox: [0.3, 0.3, 0.3, 0.3, 0.3],
    adLogOutliers: [0, 2.0043],
    ncLogOutliers: [],
    adLogOutlierPoints: [{ sample: `AD${index}`, value: 0 }, { sample: `AD${index + 5}`, value: 2.0043 }],
    ncLogOutlierPoints: [],
  };
}

const boxplotData = { items: Array.from({ length: 12 }, (_, index) => item(index + 1)) };

function chartOption() {
  return JSON.parse(screen.getByTestId('boxplot-chart').textContent);
}

test('renders every selected species in one canvas chart with a continuous data zoom', () => {
  render(<BoxPlot data={boxplotData} featureLabel="物种" />);

  expect(screen.getByText(/共 12 个物种/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'log10(丰度 + 1)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '输入丰度' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'sqrt(丰度)' })).toBeTruthy();
  expect(screen.getByTestId('boxplot-renderer').textContent).toBe('canvas');

  const option = chartOption();
  expect(option.xAxis.data).toEqual(Array.from({ length: 12 }, (_, index) => `feature-${index + 1}`));
  expect(option.dataZoom).toHaveLength(2);
  expect(option.dataZoom[0].filterMode).toBe('none');
  expect(option.dataZoom[1].filterMode).toBe('none');
  expect(option.yAxis.name).toBe('log10(丰度 + 1)');
  expect(option.series[0].type).toBe('boxplot');
  expect(option.series[0].data[0]).toEqual([1, 1.04, 1.06, 1.1, 1.14]);
  expect(option.series[0].itemStyle.color).toBe('rgba(231, 76, 60, 0.24)');
  expect(option.series[0].emphasis.itemStyle).toEqual(option.series[0].itemStyle);
  expect(option.series[2].type).toBe('scatter');
  expect(option.series[2].data[0].sample).toBe('AD1');
  expect(screen.getByTestId('boxplot-outlier-tooltip').textContent).toContain('样本编号: AD1');
});

test('switches among input, square-root and log views without changing selected species', () => {
  render(<BoxPlot data={boxplotData} featureLabel="物种" />);

  const featureIds = chartOption().xAxis.data;
  fireEvent.click(screen.getByRole('button', { name: 'sqrt(丰度)' }));
  expect(chartOption().yAxis.name).toBe('sqrt(丰度)');
  expect(chartOption().series[0].data[0]).toEqual([3.16, 3.2, 3.39, 3.57, 3.61]);
  expect(chartOption().xAxis.data).toEqual(featureIds);

  fireEvent.click(screen.getByRole('button', { name: '输入丰度' }));

  const option = chartOption();
  expect(option.yAxis.name).toBe('输入丰度');
  expect(option.series[0].data[0]).toEqual([10, 10.25, 11.5, 12.75, 13]);
  expect(option.series[2].data[1].value).toEqual(['feature-1', 100]);
  expect(option.xAxis.data).toEqual(featureIds);
});
