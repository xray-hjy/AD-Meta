import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: ({ option }) => (
    <div data-testid="boxplot-chart">
      {JSON.stringify(option)}
    </div>
  ),
}));

import BoxPlot from './BoxPlot';

const boxplotData = {
  items: [
    {
      fullName: 'k__Bacteria|p__A|c__A|g__A|s__Target_species',
      shortName: 'Target_species',
      total: 1000,
      adBox: [10, 10.25, 11.5, 12.75, 13],
      ncBox: [1, 1, 1, 1, 1],
      adOutliers: [0, 100],
      ncOutliers: [],
      adLogBox: [1, 1.04, 1.06, 1.1, 1.14],
      ncLogBox: [0.3, 0.3, 0.3, 0.3, 0.3],
      adLogOutliers: [0, 2.0043],
      ncLogOutliers: [],
    },
  ],
};

function chartOption() {
  return JSON.parse(screen.getByTestId('boxplot-chart').textContent);
}

test('defaults to log scale and renders outlier scatter series', () => {
  render(<BoxPlot data={boxplotData} featureLabel="物种" />);

  expect(document.body.textContent).toContain('默认 log10(丰度 + 1)');
  expect(screen.getByRole('button', { name: 'log10(丰度 + 1)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '原始丰度' })).toBeTruthy();

  const option = chartOption();
  expect(option.yAxis.name).toBe('log10(丰度 + 1)');
  expect(option.series[0].type).toBe('boxplot');
  expect(option.series[0].data[0]).toEqual([1, 1.04, 1.06, 1.1, 1.14]);
  expect(option.series[2].type).toBe('scatter');
  expect(option.series[2].data[0].value).toEqual(['Target_species', 0]);
  expect(option.series[2].data[1].value).toEqual(['Target_species', 2.0043]);
});

test('switches to raw abundance boxes and raw outliers', () => {
  render(<BoxPlot data={boxplotData} featureLabel="物种" />);

  fireEvent.click(screen.getByRole('button', { name: '原始丰度' }));

  const option = chartOption();
  expect(option.yAxis.name).toBe('丰度');
  expect(option.series[0].data[0]).toEqual([10, 10.25, 11.5, 12.75, 13]);
  expect(option.series[2].data[0].value).toEqual(['Target_species', 0]);
  expect(option.series[2].data[1].value).toEqual(['Target_species', 100]);
});
