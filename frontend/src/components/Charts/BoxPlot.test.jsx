import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('./CartesianEChart', () => ({
  __esModule: true,
  default: ({ option, opts }) => {
    const firstOutlier = option?.series?.find(series => series.type === 'scatter')?.data?.[0];
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

test('defaults to paginated independent facets while retaining all selected chart data', () => {
  render(<BoxPlot data={boxplotData} featureLabel="物种" />);

  expect(screen.getByText(/共 12 个物种/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'log10(丰度 + 1)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '输入丰度' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'sqrt(丰度)' })).toBeTruthy();
  expect(screen.getByTestId('boxplot-renderer').textContent).toBe('canvas');

  const option = chartOption();
  expect(option.xAxis).toHaveLength(6);
  expect(option.xAxis[0].data).toEqual(['AD', 'NC']);
  expect(option.dataZoom).toHaveLength(0);
  expect(option.yAxis[0].name).toBe('log10(丰度 + 1)');
  expect(option.series[0].type).toBe('boxplot');
  expect(option.series[0].data[0].value).toEqual([1, 1.04, 1.06, 1.1, 1.14]);
  expect(option.series[0].data[0].itemStyle.color).toBe('rgba(231, 76, 60, 0.24)');
  expect(option.series[1].type).toBe('scatter');
  expect(option.series[1].data[0].sample).toBe('AD1');
  expect(screen.getByTestId('boxplot-outlier-tooltip').textContent).toContain('样本编号: AD1');
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(chartOption().series[1].data[0].sample).toBe('AD7');
});

test('switches among input, square-root and log views without changing selected species', () => {
  render(<BoxPlot data={boxplotData} featureLabel="物种" />);

  const featureIds = chartOption().xAxis;
  fireEvent.click(screen.getByRole('button', { name: 'sqrt(丰度)' }));
  expect(chartOption().yAxis[0].name).toBe('sqrt(丰度)');
  expect(chartOption().series[0].data[0].value).toEqual([3.16, 3.2, 3.39, 3.57, 3.61]);
  expect(chartOption().xAxis).toEqual(featureIds);

  fireEvent.click(screen.getByRole('button', { name: '输入丰度' }));

  const option = chartOption();
  expect(option.yAxis[0].name).toBe('输入丰度');
  expect(option.series[0].data[0].value).toEqual([10, 10.25, 11.5, 12.75, 13]);
  expect(option.series[1].data[1].value).toEqual(['AD', 100]);
  expect(option.xAxis).toEqual(featureIds);
});

test('overview keeps the continuous slider and every selected species', () => {
  render(<BoxPlot data={boxplotData} />);
  fireEvent.click(screen.getByRole('button', { name: '共享纵轴总览' }));
  const option = chartOption();
  expect(option.xAxis.data).toHaveLength(12);
  expect(option.dataZoom.map(zoom => zoom.filterMode)).toEqual(['none', 'none']);
  expect(option.series[2].data[0].sample).toBe('AD1');
});

test('focus clips only the viewport, discloses offscreen samples and restores the full extent', () => {
  render(<BoxPlot data={{ items: [item(1)] }} groupCounts={{ AD: 20, NC: 12 }} />);
  const original = chartOption();
  fireEvent.change(screen.getByRole('combobox', { name: '箱线图视野' }), { target: { value: 'focus' } });
  const focused = chartOption();
  expect(focused.yAxis[0].max).toBeLessThan(original.yAxis[0].max);
  expect(focused.series).toEqual(original.series);
  expect(screen.getByText(/视野外共 1 个离群样本点/)).toBeTruthy();
  fireEvent.click(screen.getByText(/查看视野外样本/));
  expect(screen.getByRole('cell', { name: 'AD6' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '恢复完整范围' }));
  expect(chartOption().yAxis).toEqual(original.yAxis);
});
