import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
vi.mock('./HeatmapEChart', () => ({ default: ({ option }) => <div data-testid="detection-heatmap-chart">{JSON.stringify(option)}</div> }));
import DetectionHeatmap from './DetectionHeatmap';
import { filterDetection, parseDetectionIds } from './detectionResearch';
const items = [
  { koId:'K00368',adDetectedSamples:58,adDetectionRate:58/122,ncDetectedSamples:41,ncDetectionRate:41/63,rateGap:58/122-41/63,overallDetectionRate:99/185 },
  { koId:'K15864',adDetectedSamples:1,adDetectionRate:1/122,ncDetectedSamples:1,ncDetectionRate:1/63,rateGap:1/122-1/63,overallDetectionRate:2/185 },
  { koId:'K00000',adDetectedSamples:0,adDetectionRate:0,ncDetectedSamples:0,ncDetectionRate:0,rateGap:0,overallDetectionRate:0 },
];
const data = { items:items.slice(0,2), allItems:items, groups:[{group:'AD',sampleCount:122},{group:'NC',sampleCount:63}], filter:{topN:200}, detectionRule:'abundance > 0' };
beforeAll(() => { global.ResizeObserver = class { observe() {} disconnect() {} }; });
test('uses dynamic Top N, fixed 0–100% colors and explicit denominators', () => {
  render(<DetectionHeatmap data={data} />);
  expect(screen.getByText(/快捷 Top 200 KO/)).toBeVisible();
  const option=JSON.parse(screen.getByTestId('detection-heatmap-chart').textContent);
  expect(option.visualMap).toMatchObject({min:0,max:1,calculable:false});
  expect(option.yAxis.data).toEqual(['K00368','K15864']);
  expect(option.series[0].data[0].value).toEqual([0,0,58/122]);
  expect(option.series[0].data[0].row.adSampleCount).toBe(122);
});
test('manual pool accepts all-zero source objects and is separate from page size', () => {
  render(<DetectionHeatmap data={data} />);
  fireEvent.change(screen.getByLabelText('批量检出 KO 编号'),{target:{value:'K00000, K00000, unknown'}});
  fireEvent.click(screen.getByRole('button',{name:'加入对象池'}));
  expect(screen.getByText(/已加入 1 项；未知编号 UNKNOWN/)).toBeInTheDocument();
  expect(JSON.parse(screen.getByTestId('detection-heatmap-chart').textContent).yAxis.data).toHaveLength(3);
  fireEvent.click(screen.getByRole('button',{name:'双组哑铃比较'}));
  const option=JSON.parse(screen.getByTestId('detection-heatmap-chart').textContent);
  expect(option.xAxis).toMatchObject({min:0,max:100});
});
test('selection filters and batches preserve real zeros and stable identifiers', () => {
  expect(parseDetectionIds('K00368 k00368, K99999',items)).toEqual({valid:['K00368'],unknown:['K99999']});
  expect(filterDetection(items,{field:'overall',minimum:0,maximum:0}).map(r=>r.koId)).toEqual(['K00000']);
  expect(filterDetection(items,{field:'gap',minimum:-100,maximum:0,sort:'ad'})[0].koId).toBe('K00368');
});
