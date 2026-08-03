import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

let lastOption;

vi.mock('./CartesianEChart', () => ({
  __esModule: true,
  default: ({ option }) => {
    lastOption = option;
    return <div data-testid="echarts-chart" />;
  },
}));

vi.mock('./ChartViewport', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="chart-viewport">{children}</div>,
}));

import KoContributionChart from './KoContributionChart';

const data = {
  series: [
    { key: 'AD', label: 'AD 均值', color: '#e74c3c' },
    { key: 'NC', label: 'NC 均值', color: '#2ecc71' },
  ],
  items: [
    { feature: 'K00001', values: { AD: 0.125, NC: 0.1 } },
    { feature: 'K00002', values: { AD: 0.05, NC: 0.08 } },
  ],
  sourceFeatureCount: 2258,
  omittedFeatureCount: 2256,
  coverageBySeries: { AD: 0.175, NC: 0.18 },
};

test('renders Top-N KO contributions without an Other bucket', () => {
  render(<KoContributionChart data={data} />);

  expect(screen.getByText('2/2258')).toBeTruthy();
  expect(screen.getByText('2256')).toBeTruthy();
  expect(screen.getByText('个，未合并为 Other')).toBeTruthy();
  expect(screen.getByText('17.50%')).toBeTruthy();
  expect(screen.getByText('18.00%')).toBeTruthy();
  expect(screen.getByTestId('echarts-chart')).toBeTruthy();
  expect(lastOption.yAxis.data).toEqual(['K00001', 'K00002']);
  expect(lastOption.yAxis.data).not.toContain('Other');
  expect(lastOption.xAxis.max).toBeUndefined();
  expect(lastOption.series[0].data).toEqual([0.125, 0.05]);
  expect(lastOption.series[1].data).toEqual([0.1, 0.08]);
});
