import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

let lastOption;
let lastStyle;

vi.mock('./CartesianEChart', () => ({
  __esModule: true,
  default: ({ option, style }) => {
    lastOption = option;
    lastStyle = style;
    return <div data-testid="echarts-chart" />;
  },
}));

import PhylumChart from './PhylumChart';

const compositionData = [
  { phylum: 'Bacteroidota', adRatio: 0.45, ncRatio: 0.30 },
  { phylum: 'Firmicutes', adRatio: 0.35, ncRatio: 0.50 },
  { phylum: 'Proteobacteria', adRatio: 0.20, ncRatio: 0.20 },
];

beforeEach(() => {
  lastOption = undefined;
  lastStyle = undefined;
});

test('renders taxonomy composition summary cards', () => {
  render(<PhylumChart data={compositionData} featureKind="taxonomy" featureLabel="物种" />);

  expect(screen.queryByText('基于 AD/NC 平均丰度占比')).toBeNull();
  expect(screen.queryByText('按门水平汇总')).toBeNull();
  expect(screen.getByText('展示项')).toBeTruthy();
  expect(screen.getByText('3 项')).toBeTruthy();
  expect(screen.getByText('AD 最高')).toBeTruthy();
  expect(screen.getByText('NC 最高')).toBeTruthy();
  expect(screen.getByText('最大组间差异')).toBeTruthy();
  expect(screen.getAllByText('Bacteroidota').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Firmicutes').length).toBeGreaterThan(0);
  expect(screen.getByText('AD 高 15.0 pp')).toBeTruthy();
  expect(screen.getByTestId('echarts-chart')).toBeTruthy();
});

test('renders KO composition summary cards with KO labels', () => {
  render(
    <PhylumChart
      data={[
        { phylum: 'K03088', adRatio: 0.15, ncRatio: 0.08 },
        { phylum: 'K21572', adRatio: 0.10, ncRatio: 0.18 },
      ]}
      featureKind="ko"
      featureLabel="KO"
    />
  );

  expect(screen.queryByText('展示 KO 功能项')).toBeNull();
  expect(screen.getByText('Top KO 功能')).toBeTruthy();
  expect(screen.getByText('K03088')).toBeTruthy();
  expect(screen.getAllByText('K21572').length).toBeGreaterThan(0);
  expect(screen.getByText('NC 高 8.0 pp')).toBeTruthy();
});

test('uses compact horizontal bars with abundance-style hover shadow', () => {
  render(<PhylumChart data={compositionData} featureKind="taxonomy" featureLabel="物种" />);

  expect(lastOption.tooltip.trigger).toBe('axis');
  expect(lastOption.tooltip.axisPointer.type).toBe('shadow');
  expect(lastOption.xAxis[0].type).toBe('value');
  expect(lastOption.yAxis[0].type).toBe('category');
  expect(lastOption.yAxis[0].inverse).toBe(true);
  expect(lastOption.series).toHaveLength(2);
  expect(lastOption.series[0].type).toBe('bar');
  expect(lastOption.series[1].type).toBe('bar');
  expect(lastOption.series[0].barWidth).toBe(22);
  expect(lastOption.series[0].barGap).toBe('0%');
  expect(lastOption.series[0].barCategoryGap).toBe('6px');
  expect(lastOption.series[0].itemStyle.color).toBe('#e74c3c');
  expect(lastOption.series[1].itemStyle.color).toBe('#2ecc71');
  expect(lastOption.series[0].itemStyle.borderRadius).toEqual([0, 6, 6, 0]);
  expect(lastOption.series[0].label.show).toBe(true);
  expect(lastOption.series[0].label.position).toBe('right');
  expect(lastOption.series[0].emphasis.itemStyle.shadowBlur).toBe(10);
  expect(lastOption.series[0].emphasis.itemStyle.borderColor).toBeUndefined();
  expect(lastOption.series[0].emphasis.itemStyle.borderWidth).toBeUndefined();
  expect(lastOption.toolbox).toBeUndefined();
  expect(lastOption.dataZoom).toBeUndefined();
  expect(lastStyle.height).toBe('100%');
});
