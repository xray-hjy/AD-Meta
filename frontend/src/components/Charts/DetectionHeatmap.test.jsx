import { render, screen } from '@testing-library/react';

jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: ({ option }) => (
    <div data-testid="detection-heatmap-chart">
      {JSON.stringify(option)}
    </div>
  ),
}));

import DetectionHeatmap from './DetectionHeatmap';

const detectionData = {
  featureLabel: 'KO',
  detectionRule: 'abundance > 0',
  groups: [
    { group: 'AD', sampleCount: 122 },
    { group: 'NC', sampleCount: 63 },
  ],
  rowLabels: ['AD', 'NC'],
  colLabels: ['K17398', 'K00001'],
  matrix: [
    [0.7541, 0.6885],
    [0.2857, 0.1905],
  ],
  items: [
    {
      koId: 'K17398',
      koName: 'K17398',
      adDetectedSamples: 92,
      adDetectionRate: 0.7541,
      ncDetectedSamples: 18,
      ncDetectionRate: 0.2857,
      rateGap: 0.4684,
      overallDetectedSamples: 110,
      overallDetectionRate: 0.5946,
    },
    {
      koId: 'K00001',
      koName: 'K00001',
      adDetectedSamples: 84,
      adDetectionRate: 0.6885,
      ncDetectedSamples: 12,
      ncDetectionRate: 0.1905,
      rateGap: 0.498,
      overallDetectedSamples: 96,
      overallDetectionRate: 0.5189,
    },
  ],
};

test('renders KO detection heatmap summary and chart payload', () => {
  render(<DetectionHeatmap data={detectionData} />);

  expect(document.body.textContent).toContain('检出规则: 丰度 > 0');
  expect(document.body.textContent).toContain('AD 样本数: 122');
  expect(document.body.textContent).toContain('NC 样本数: 63');
  expect(document.body.textContent).toContain('Top 50 KO');
  expect(document.body.textContent).toContain('排序: 按 AD/NC 检出率差异排序');

  const chart = screen.getByTestId('detection-heatmap-chart');
  expect(chart.textContent).toContain('K17398');
  expect(chart.textContent).toContain('K00001');
  expect(chart.textContent).toContain('AD');
  expect(chart.textContent).toContain('NC');
});

test('builds detection heatmap option from official-style category heatmap primitives', () => {
  render(<DetectionHeatmap data={detectionData} />);

  const option = JSON.parse(screen.getByTestId('detection-heatmap-chart').textContent);

  expect(option.tooltip.position).toBe('top');
  expect(option.xAxis.type).toBe('category');
  expect(option.xAxis.splitArea.show).toBe(true);
  expect(option.yAxis.type).toBe('category');
  expect(option.yAxis.splitArea.show).toBe(true);
  expect(option.visualMap.calculable).toBe(true);
  expect(option.visualMap.min).toBe(0.1905);
  expect(option.visualMap.max).toBe(0.7541);
  expect(option.visualMap.inRange.color).toEqual([
    '#ffffcc',
    '#ffeda0',
    '#fed976',
    '#feb24c',
    '#fd8d3c',
    '#fc4e2a',
    '#e31a1c',
    '#bd0026',
    '#800026',
  ]);
  expect(option.series[0].type).toBe('heatmap');
  expect(option.series[0].data[0].value).toEqual([0, 0, 0.7541]);
  expect(option.series[0].data[1].value).toEqual([0, 1, 0.2857]);
});
