import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { setPlatformAPI } from 'zrender/lib/core/platform';
import { echarts } from '../../components/Charts/EChartBase';
import { HeatmapChart } from 'echarts/charts';
import { VisualMapComponent } from 'echarts/components';
import MagFunctionalChart from './MagFunctionalChart';
import { functionMatrixOption } from './magFunctionOptions';

vi.mock('../../components/Charts/HeatmapEChart', () => ({
  default: forwardRef(function Surface({ option, opts }, ref) {
    useImperativeHandle(ref, () => ({ getEchartsInstance: () => ({ getOption: () => option }) }));
    return <output data-testid="functional-surface">{JSON.stringify({ grid: option.grid, zoom: option.dataZoom, opts })}</output>;
  }),
}));
vi.mock('../../components/Charts/ZoomableChartViewport', () => ({
  default: ({ children }) => children({ plot: { left: 200, top: 45, width: 500, height: 400 }, dimensions: { width: 1000, height: 600 },
    visible: { x: 0, y: 0, width: 48, height: 48 } }),
}));

beforeEach(() => {
  localStorage.clear();
  echarts.use([HeatmapChart, VisualMapComponent]);
  setPlatformAPI({ measureText: text => ({ width: String(text).length * 7 }) });
});

it('renders a functional matrix using the shared viewport contract, which does not return world', () => {
  const data = { projectionFingerprint: 'tiny', namespace: 'kofam_ko', valueKind: 'presence',
    mags: [{ magId: 'M1', quality: {} }, { magId: 'M2', quality: {} }],
    features: [{ featureId: 'K00929' }, { featureId: 'K01580' }], values: [[1, 0], [0, 1]] };
  render(<MagFunctionalChart kind="matrix" data={data} buildOption={functionMatrixOption} camera />);
  const rendered = JSON.parse(screen.getByTestId('functional-surface').textContent);
  expect(rendered.grid.width).toBeGreaterThan(0);
  expect(rendered.grid.outerBoundsMode).toBe('none');
  expect(rendered.grid.height).toBe(48);
  expect(rendered.opts).toMatchObject({ width: 1000, height: 600 });
  expect(rendered.zoom[0].start).toBe(0);
  expect(rendered.zoom[1].end).toBe(100);
  expect(JSON.stringify(rendered)).not.toContain('null');
});

it('switches palette lists by value meaning and remembers binary and continuous choices separately', () => {
  const data = { projectionFingerprint: 'stable-matrix', namespace: 'kofam_ko', valueKind: 'presence',
    mags: [{ magId: 'M1', quality: {} }], features: [{ featureId: 'K00929' }], values: [[1]] };
  const { rerender } = render(<MagFunctionalChart kind="matrix" data={data} buildOption={functionMatrixOption} camera />);
  const initialView = screen.getByTestId('functional-surface').textContent;
  fireEvent.click(screen.getByRole('button', { name: '配色', exact: true }));
  expect(within(screen.getByRole('listbox', { name: '配色系列' })).getAllByRole('option')).toHaveLength(12);
  fireEvent.click(screen.getByRole('option', { name: /深色系 · 墨蓝/ }));
  expect(screen.getByTestId('functional-surface')).toHaveTextContent(initialView);
  expect(JSON.parse(localStorage.getItem('admeta.chart-style.v1.mag-functional-matrix')).presencePalette).toBe('dark-navy');
  rerender(<MagFunctionalChart kind="matrix" data={{ ...data, valueKind: 'count' }} buildOption={functionMatrixOption} camera />);
  fireEvent.click(screen.getByRole('button', { name: '配色', exact: true }));
  expect(within(screen.getByRole('listbox', { name: '配色系列' })).queryByRole('option', { name: /墨蓝/ })).toBeNull();
  fireEvent.click(screen.getByRole('option', { name: /Viridis/ }));
  const saved = JSON.parse(localStorage.getItem('admeta.chart-style.v1.mag-functional-matrix'));
  expect(saved.presencePalette).toBe('dark-navy'); expect(saved.palette).toBe('viridis');
  rerender(<MagFunctionalChart kind="matrix" data={data} buildOption={functionMatrixOption} camera />);
  expect(screen.getByRole('button', { name: '配色', exact: true })).toHaveTextContent('墨蓝');
});
