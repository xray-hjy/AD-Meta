import { buildEffectOption, effectRows } from './EvidenceEffectChart';
import { ecdfPoints } from './PrimaryGenusDistribution';

const statistic = { rankBiserial: .3, qValue: .04, pValue: .02, adCount: 12, ncCount: 10, adjusted: { effect: 8, ciLow: -2, ciHigh: 18, qValue: .1, pValue: .06 } };
const style = { fontSize: 11, labels: true, hover: true, grid: true };

test('forest leaves ineligible rows blank and keeps main and external intervals separate', () => {
  const rows = effectRows({ primary: { genusComparison: { statistic, rankBiserialCi: [-.1, .6] } }, cohorts: [{ projectId: 'P', statistic: null }] });
  expect(rows).toHaveLength(2);
  const option = buildEffectOption({ rows, adjusted: false, colors: ['blue', 'red'], style, title: '', footnote: '' });
  expect(option.yAxis.data).toEqual(['主队列 · WGS', 'P']);
  expect(option.series[1].data).toHaveLength(1);
  expect(option.series[1].data[0].value).toEqual([.3, 0, -.1, .6]);
  const adjusted = buildEffectOption({ rows, adjusted: true, colors: ['blue', 'red'], style, title: '', footnote: '' });
  expect(adjusted.series[1].data[0].value).toEqual([8, 0, -2, 18]);
});

test('candidate matrix does not encode missing comparisons as zero', () => {
  const candidates = [{ candidateId: 'C', name: 'Unknown', primaryStatistic: statistic, cohorts: [{ projectId: 'P', statistic: null }] }];
  const option = buildEffectOption({ rows: [{ name: 'P', projectId: 'P' }], candidates, colors: ['blue', 'red'], style, title: '', footnote: '' });
  expect(option.series[0].data.map(r => r.value)).toEqual([[0, 0, .3]]);
  expect(option.xAxis.data).toEqual(['主队列 · WGS', 'P']);
});

test('ECDF preserves zeros, ties and all observations without smoothing', () => {
  expect(ecdfPoints([0, 0, 2, 9].map(value => ({ value })))).toEqual([[0, 0], [0, 50], [2, 75], [9, 100]]);
  expect(ecdfPoints([{ value: 9 }], true)).toEqual([[1, 0], [1, 100]]);
  expect(ecdfPoints([])).toEqual([]);
});
