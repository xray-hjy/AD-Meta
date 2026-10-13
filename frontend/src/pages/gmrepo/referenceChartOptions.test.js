import { referenceChartOption } from './referenceChartOptions';

test('uses disjoint source counts and fixes proportion charts to the same 0–100 scale', () => {
  const data = { decisions: [{ label: '可用', count: 2 }, { label: '待核查', count: 3 }],
    missingness: [{ label: '年龄', denominator: 5, knownCount: 1, unavailablePercent: 80 }],
    resolution: [{ projectId: 'PRJ1', medianUnresolvedPercent: 42 }], cohorts: [{ projectId: 'PRJ1', plotReadyRuns: 2, adRuns: 1, ncRuns: 1 }] };
  const decisions = referenceChartOption('decisions', data, {});
  expect(decisions.xAxis.min).toBe(0);
  expect(decisions.series[0].data).toEqual([2, 3]);
  const missingness = referenceChartOption('missingness', data, {});
  expect(missingness.xAxis.max).toBe(100);
  expect(missingness.series.map(s => s.data[0])).toEqual([20, 80]);
  const resolution = referenceChartOption('resolution', data, {});
  expect(resolution.xAxis.max).toBe(100);
  expect(resolution.series[0].data).toEqual([42]);
});
