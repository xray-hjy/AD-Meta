import { distributionChartOption } from './distributionChartOption';

test('raw and log charts retain the same Runs, zero values and source QC', () => {
  const data = { cohort: 'PRJTEST', genus: { name: '<b>Genus</b>' }, boxes: [
    { group: 'AD', count: 2, detectedCount: 1, box: [0, 0, 5, 10, 10], logBox: [0, 0, .5, 1, 1] },
    { group: 'NC', count: 1, detectedCount: 0, box: [0, 0, 0, 0, 0], logBox: [0, 0, 0, 0, 0] }],
  points: [{ group: 'AD', runId: 'ERR1', value: 10, jitter: .1, unresolvedPercent: 20, qcStatus: '1', readCount: 10000 },
    { group: 'AD', runId: 'ERR2', value: 0, jitter: -.1, unresolvedPercent: 80 }, { group: 'NC', runId: 'ERR3', value: 0, jitter: .12, unresolvedPercent: 40 }] };
  const raw = distributionChartOption(data, 'raw', { AD: 'red', NC: 'blue' });
  const log = distributionChartOption(data, 'log', { AD: 'red', NC: 'blue' });
  expect(raw.yAxis.min).toBe(0);
  expect(log.yAxis.min).toBe(0);
  expect(raw.series[1].data).toHaveLength(2);
  expect(log.series[1].data[1].value[1]).toBe(0);
  expect(log.series[1].data[0].value[1]).toBeCloseTo(Math.log10(11));
  expect(raw.series[1].data[0].sample).toBe(log.series[1].data[0].sample);
  expect(raw.series[1].xAxisIndex).toBe(1);
  expect(raw.tooltip.renderMode).toBe('richText');
  const tooltip = raw.tooltip.formatter({ seriesType: 'scatter', data: raw.series[1].data[0] });
  expect(tooltip).toContain('待解析 20%');
  expect(tooltip).toContain('来源 QC 1');
  expect(raw.tooltip.formatter({ seriesType: 'boxplot', dataIndex: 0 })).toContain('中位数 5%');
});
