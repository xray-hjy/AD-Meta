import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import EChartBase, { chartRowsFromOption } from './EChartBase';

vi.mock('echarts-for-react/lib/core', () => ({
  default: ({ style }) => <div data-testid="echart" style={style} />,
}));

describe('chartRowsFromOption', () => {
  test('builds accessible rows from categories, hierarchy, and links', () => {
    const rows = chartRowsFromOption({
      xAxis: { data: ['A', 'B'] },
      series: [
        { name: '丰度', data: [1, 2] },
        { name: '层级', data: [{ name: '门', value: 3, children: [{ name: '属', value: 2 }] }] },
        { name: '流向', nodes: [], links: [{ source: '门', target: '属', value: 2 }] },
      ],
    });

    expect(rows).toContainEqual({ series: '丰度', item: 'A', value: '1' });
    expect(rows).toContainEqual({ series: '层级', item: '门 / 属', value: '2' });
    expect(rows).toContainEqual({ series: '流向', item: '门 → 属', value: '2' });
  });

  test('caps large alternatives to keep chart rendering bounded', () => {
    const rows = chartRowsFromOption({ series: [{ data: Array.from({ length: 400 }, (_, i) => i) }] });
    expect(rows).toHaveLength(200);
  });

  test('can hide the data table for charts that do not need it', () => {
    render(<EChartBase option={{ series: [{ data: [1] }] }} showDataTable={false} />);

    expect(screen.queryByText('查看图表数据表')).not.toBeInTheDocument();
    expect(screen.getByTestId('echart')).toBeInTheDocument();
  });

  test('keeps percentage-sized charts from collapsing inside the accessibility wrapper', () => {
    render(
      <EChartBase
        option={{ series: [{ data: [1] }] }}
        style={{ width: '100%', height: '100%' }}
      />
    );

    expect(screen.getByRole('img')).toHaveStyle({ width: '100%', height: '100%' });
    expect(screen.getByTestId('echart')).toHaveStyle({ width: '100%', height: '100%' });
  });
});
