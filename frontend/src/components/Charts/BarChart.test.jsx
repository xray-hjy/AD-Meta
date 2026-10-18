import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const chartProps = vi.hoisted(() => vi.fn());

vi.mock('./ZoomableGroupedBarChart', async () => {
  const { buildGroupedBarOption } = await import('./GroupedBarChart');
  return { default: props => {
    chartProps({ ...props, option: buildGroupedBarOption(props.model) });
    return <div data-testid="bar-echart" />;
  },
}; });

vi.mock('./ChartViewport', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

import BarChart from './BarChart';

const data = Array.from({ length: 30 }, (_, index) => ({
  species: `Genus_species_${index}`,
  fullName: `k__Bacteria|p__Firmicutes|g__Genus|s__species_${index}`,
  adMean: 1000 + index,
  ncMean: 100 + index,
}));

beforeEach(() => chartProps.mockClear());

test('renders a bounded Top N chart and exposes informative tooltips', async () => {
  render(<BarChart data={data} featureLabel="物种" />);
  await waitFor(() => expect(screen.getByText('前 20 个物种 · 全量 30')).toBeTruthy());
  const option = chartProps.mock.calls.at(-1)[0].option;
  expect(option.series[0].data).toHaveLength(20);
  expect(chartProps.mock.lastCall[0].barStyleConfig.defaultTransposed).toBe(true);
  expect(option.xAxis[0].axisLabel.formatter(1200)).toBe('1.2K');
  const tooltip = option.tooltip.formatter([
    { dataIndex: 0, seriesIndex: 0, marker: 'AD ', seriesName: 'AD 均值', value: 1000 },
  ]);
  expect(tooltip).toContain('Genus_species_0');
  expect(tooltip).toContain('AD 均值: 1,000');
  expect(tooltip).toContain('p: Firmicutes');
});

test('updates only the selected Top N subset', async () => {
  render(<BarChart data={data} featureLabel="物种" />);
  const input = screen.getByRole('spinbutton', { name: '展示数量' });
  fireEvent.change(input, { target: { value: '5' } });
  fireEvent.blur(input);
  await waitFor(() => expect(screen.getByText('前 5 个物种 · 全量 30')).toBeTruthy());
  expect(chartProps.mock.calls.at(-1)[0].option.series[0].data).toHaveLength(5);
});

test('renders a clear empty state', () => {
  render(<BarChart data={[]} featureLabel="KO" />);
  expect(screen.getByText('暂无KO丰度数据')).toBeTruthy();
});

test('renders backend projection series without a second client-side Top N filter', async () => {
  const projection = {
    scope: { mode: 'group', groups: ['AD'], sampleCodes: [] },
    projection: { returnedFeatureCount: 2 },
    series: [{ key: 'AD', label: 'AD 均值', group: 'AD', color: '#e74c3c' }],
    items: [
      { feature: 'Feature A', fullName: 'Feature A', values: { AD: { mean: 12 } } },
      { feature: 'Feature B', fullName: 'Feature B', values: { AD: { mean: 8 } } },
    ],
  };
  render(<BarChart data={projection} featureLabel="物种" />);

  await waitFor(() => expect(chartProps.mock.lastCall[0].model.items).toHaveLength(2));
  expect(screen.queryByRole('spinbutton', { name: '展示数量' })).toBeNull();
  const option = chartProps.mock.calls.at(-1)[0].option;
  expect(option.series).toHaveLength(1);
  expect(option.series[0].data).toEqual([12, 8]);
});

test('keeps missing, zero and tiny KO abundance distinct without converting to percent', () => {
  render(<BarChart featureLabel="KO" data={{ series: [{ key: 'AD', label: 'AD' }], items: [
    { feature: 'K00001', values: { AD: { mean: null } } },
    { feature: 'K00002', values: { AD: { mean: 0 } } },
    { feature: 'K00003', values: { AD: { mean: 0.00000003 } } },
  ] }} />);
  const { model, option, barStyleConfig } = chartProps.mock.lastCall[0];
  expect(option.series[0].data).toEqual([null, 0, 0.00000003]);
  expect(model.formatValue(null)).toBe('未提供');
  expect(model.formatAxis(0.00000003)).not.toBe('0');
  expect(barStyleConfig).not.toHaveProperty('suffix');
});

test('displays fractional relative abundance as percent without changing input values', () => {
  const input = { dataSemantics: { abundanceScale: 'relative_abundance' },
    series: [{ key: 'AD', label: 'AD' }], items: [{ feature: 'Species', values: { AD: { mean: 0.125 } } }] };
  render(<BarChart data={input} />);
  const { model } = chartProps.mock.lastCall[0];
  expect(model.items[0].values.AD).toBe(12.5);
  expect(model.formatValue(12.5)).toBe('12.5%');
  expect(model.axisName).toContain('相对丰度（%）');
  expect(input.items[0].values.AD.mean).toBe(0.125);
});
