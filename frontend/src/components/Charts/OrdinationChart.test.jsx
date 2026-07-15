import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

const chartProps = vi.hoisted(() => vi.fn());

vi.mock('./CartesianEChart', () => ({
  default: props => {
    chartProps(props);
    return <div data-testid="ordination-echart" />;
  },
}));

import OrdinationChart from './OrdinationChart';

beforeEach(() => chartProps.mockClear());

test('renders grouped points, confidence ellipses and bounded axes', () => {
  render(
    <OrdinationChart
      data={{
        variance: [0.6, 0.2],
        points: [
          { sample: 'AD01', group: 'AD', x: 2, y: 1 },
          { sample: 'NC01', group: 'NC', x: -1, y: -2 },
        ],
        ellipses: [
          { group: 'AD', points: [[1, 0], [2, 1], [1, 0]] },
        ],
      }}
      footer="PERMANOVA"
    />
  );
  expect(screen.getByTestId('ordination-echart')).toBeTruthy();
  expect(screen.getByText('PERMANOVA')).toBeTruthy();
  const option = chartProps.mock.calls.at(-1)[0].option;
  expect(option.xAxis.name).toBe('Axis 1 (60.0%)');
  expect(option.yAxis.name).toBe('Axis 2 (20.0%)');
  expect(option.series).toHaveLength(3);
  expect(option.tooltip.formatter({ data: [2, 1, 'AD01', 'AD'] })).toContain('AD01');
});

test('renders an empty state without valid points', () => {
  render(<OrdinationChart data={{ points: [] }} />);
  expect(screen.getByText('暂无降维分析数据')).toBeTruthy();
});
