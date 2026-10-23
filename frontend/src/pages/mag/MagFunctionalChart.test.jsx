import { forwardRef, useImperativeHandle } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { setPlatformAPI } from 'zrender/lib/core/platform';
import { echarts } from '../../components/Charts/EChartBase';
import { HeatmapChart } from 'echarts/charts';
import { VisualMapComponent } from 'echarts/components';
import MagFunctionalChart from './MagFunctionalChart';
import { functionMatrixOption } from './magFunctionOptions';

vi.mock('../../components/Charts/HeatmapEChart', () => ({
  default: forwardRef(function Surface({ option }, ref) {
    useImperativeHandle(ref, () => ({ getEchartsInstance: () => ({ getOption: () => option }) }));
    return <output data-testid="functional-surface">{JSON.stringify({ grid: option.grid, zoom: option.dataZoom })}</output>;
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
  expect(rendered.zoom[0].start).toBe(0);
  expect(rendered.zoom[1].end).toBe(100);
  expect(JSON.stringify(rendered)).not.toContain('null');
});
