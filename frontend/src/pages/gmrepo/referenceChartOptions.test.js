import { referenceChartOption } from './referenceChartOptions';

test('uses source status counts and sorts unresolved proportions on the 0–100 scale', () => {
  const data = { decisions: [{ label: '可用', count: 2 }, { label: '待核查', count: 3 }],
    resolution: [{ projectId: 'PRJ1', medianUnresolvedPercent: 42 }, { projectId: 'PRJ2', medianUnresolvedPercent: 64 }] };
  const decisions = referenceChartOption('decisions', data, {});
  expect(decisions.xAxis.min).toBe(0);
  expect(decisions.series[0].data).toEqual([2, 3]);
  const resolution = referenceChartOption('resolution', data, {});
  expect(resolution.xAxis.max).toBe(100);
  expect(resolution.yAxis.data).toEqual(['PRJ2', 'PRJ1']);
  expect(resolution.series[0].data).toEqual([64, 42]);
});
