import { act, render, screen, waitFor } from '@testing-library/react';
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
  expect(props.showDataTable).toBe(false);
  expect(props.option.toolbox.feature.restore).toBeTruthy();
  expect(props.option.toolbox.feature.saveAsImage).toBeTruthy();
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

test('updates only the grid on resize without rebuilding the chart option', async () => {
  let resizeCallback;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) { resizeCallback = callback; }
    observe() {}
    disconnect() {}
  };
  const chart = { setOption: vi.fn() };
  const { container } = render(
    <OrdinationChart
      data={{
        variance: [0.5, 0.25],
        points: [
          { sample: 'AD01', group: 'AD', x: 1, y: 2 },
          { sample: 'NC01', group: 'NC', x: -1, y: -2 },
        ],
        ellipses: [],
      }}
    />,
  );
  const initialOption = chartProps.mock.calls.at(-1)[0].option;
  const initialRenderCount = chartProps.mock.calls.length;
  const surface = container.querySelector('.ordination-chart__surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 600 });

  act(() => chartProps.mock.calls.at(-1)[0].onChartReady(chart));
  act(() => resizeCallback([]));

  await waitFor(() => expect(chart.setOption).toHaveBeenCalled());
  expect(chartProps.mock.calls).toHaveLength(initialRenderCount);
  expect(chartProps.mock.calls.at(-1)[0].option).toBe(initialOption);
  expect(chart.setOption).toHaveBeenLastCalledWith(
    { grid: expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }) },
    { notMerge: false, lazyUpdate: true },
  );
  globalThis.ResizeObserver = originalResizeObserver;
});

test('rebinds the resize observer across empty and non-empty projections', async () => {
  const observers = [];
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      observers.push(this);
    }
  };

  const chart = { setOption: vi.fn() };
  const { container, rerender } = render(<OrdinationChart data={{ points: [] }} />);
  expect(observers).toHaveLength(0);

  rerender(
    <OrdinationChart
      data={{
        variance: [0.5, 0.25],
        points: [{ sample: 'AD01', group: 'AD', x: 1, y: 2 }],
        ellipses: [],
      }}
    />,
  );

  const surface = container.querySelector('.ordination-chart__surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 600 });
  expect(observers).toHaveLength(1);
  expect(observers[0].observe).toHaveBeenCalledWith(surface);

  act(() => chartProps.mock.calls.at(-1)[0].onChartReady(chart));
  await waitFor(() => expect(chart.setOption).toHaveBeenCalled());
  chart.setOption.mockClear();
  act(() => observers[0].callback([]));

  await waitFor(() => expect(chart.setOption).toHaveBeenCalledWith(
    { grid: expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }) },
    { notMerge: false, lazyUpdate: true },
  ));

  rerender(<OrdinationChart data={{ points: [] }} />);
  expect(observers[0].disconnect).toHaveBeenCalledOnce();

  const nextChart = { setOption: vi.fn() };
  rerender(
    <OrdinationChart
      data={{
        variance: [0.4, 0.2],
        points: [{ sample: 'NC01', group: 'NC', x: -2, y: -1 }],
        ellipses: [],
      }}
    />,
  );

  const nextSurface = container.querySelector('.ordination-chart__surface');
  vi.spyOn(nextSurface, 'getBoundingClientRect').mockReturnValue({ width: 640, height: 480 });
  expect(observers).toHaveLength(2);
  expect(observers[1].observe).toHaveBeenCalledWith(nextSurface);

  act(() => chartProps.mock.calls.at(-1)[0].onChartReady(nextChart));
  await waitFor(() => expect(nextChart.setOption).toHaveBeenCalled());
  nextChart.setOption.mockClear();
  act(() => observers[1].callback([]));

  await waitFor(() => expect(nextChart.setOption).toHaveBeenCalledWith(
    { grid: expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }) },
    { notMerge: false, lazyUpdate: true },
  ));
  globalThis.ResizeObserver = originalResizeObserver;
});
