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

test('renders grouped points, data-distribution ellipses and bounded axes', () => {
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
    />
  );
  expect(screen.getByTestId('ordination-echart')).toBeTruthy();
  const option = chartProps.mock.calls.at(-1)[0].option;
  expect(option.xAxis.name).toBe('Axis 1 (60.0%)');
  expect(option.yAxis.name).toBe('Axis 2 (20.0%)');
  expect(option.series).toHaveLength(3);
  expect(option.tooltip.formatter({ data: [2, 1, 'AD01', 'AD'] })).toContain('AD01');
  const props = chartProps.mock.calls.at(-1)[0];
  expect(props.notMerge).toBe(true);
  expect(props.dataTableModel.columns.map(column => column.label)).toEqual([
    '样本',
    '分组',
    'Axis1 (60.0%)',
    'Axis2 (20.0%)',
  ]);
  expect(props.dataTableModel.rows).toHaveLength(2);
  expect(props.dataTableModel.rows[0]).toMatchObject({ sample: 'AD01', group: 'AD', x: 2, y: 1 });
  expect(props.dataTableModel.footer).toContain('椭圆为根据样本坐标计算的辅助图层');
});

test('replaces stale group series when the analysis scope changes', () => {
  const { rerender } = render(
    <OrdinationChart
      data={{
        points: [
          { sample: 'AD01', group: 'AD', x: 2, y: 1 },
          { sample: 'NC01', group: 'NC', x: -1, y: -2 },
        ],
        ellipses: [],
      }}
    />
  );

  rerender(
    <OrdinationChart
      data={{
        points: [{ sample: 'NC01', group: 'NC', x: -1, y: -2 }],
        ellipses: [],
      }}
    />
  );

  const props = chartProps.mock.calls.at(-1)[0];
  expect(props.notMerge).toBe(true);
  expect(props.option.legend.data).toEqual(['NC']);
  expect(props.option.series).toHaveLength(1);
  expect(props.option.series[0].data).toEqual([[-1, -2, 'NC01', 'NC']]);
});

test('renders an empty state without valid points', () => {
  render(<OrdinationChart data={{ points: [] }} />);
  expect(screen.getByText('暂无降维分析数据')).toBeTruthy();
});
