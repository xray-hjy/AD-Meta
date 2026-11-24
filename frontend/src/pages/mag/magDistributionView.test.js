import { distributionCsv, distributionRange, distributionRangeLabel, formatMagNumber } from './magDistributionView';
import { distributionOption } from './MagCharts';

const data = { feature: { magId: 'MAG_A' }, provenance: { groupCounts: { AD: 3, NC: 2 }, dataFingerprint: 'source', requestFingerprint: 'scope' },
  boxes: [{ group: 'AD', values: [0, 0.1, 0.2, 0.3, 0.4] }, { group: 'NC', values: [0, 0.1, 0.15, 0.2, 0.3] }],
  samples: [
    { sampleId: 'zero', disease: 'AD', abundancePercent: 0 },
    { sampleId: 'small', disease: 'AD', abundancePercent: 0.123456789012345, age: 71, gender: 'F', batch: '2' },
    { sampleId: 'large-ad', disease: 'AD', abundancePercent: 20 },
    { sampleId: 'inlier', disease: 'NC', abundancePercent: 0.1 },
    { sampleId: 'large-nc', disease: 'NC', abundancePercent: 10 },
  ] };

test('focus preserves every raw sample and box while sharing one axis and counting out-of-view samples per group', () => {
  const before = structuredClone(data);
  const full = distributionOption(data), focus = distributionOption(data, true);
  expect(focus.yAxis.max).toBeCloseTo(0.432);
  expect(full.yAxis.max).toBeGreaterThan(20);
  expect(distributionRange(data, true).outside).toEqual({ AD: 1, NC: 1 });
  expect(focus.series).toEqual(full.series);
  expect(focus.series[1].data[0].value[1]).toBe(0);
  expect(distributionRangeLabel(distributionRange(data, true))).toContain('视野外 AD 1 / NC 1');
  expect(data).toEqual(before);
});

test('focus retains interpolated box bounds, handles absent groups, all-zero boxes and empty scope', () => {
  expect(distributionRange({ ...data, boxes: [{ values: [0, 0, 0, 2, 1] }] }, true).max).toBeCloseTo(2.16);
  expect(distributionRange({ samples: [{ disease: 'AD', abundancePercent: 5 }], boxes: [{ values: [0, 0, 0, 0, 0] }] }, true)).toMatchObject({ fallback: true, outside: { AD: 0, NC: 0 } });
  expect(distributionRange({ samples: [], boxes: [] }, true).max).toBe(1);
  expect(distributionRange({ samples: [{ disease: 'AD', abundancePercent: 0 }], boxes: [{ values: [0, 0, 0, 0, 0] }] }, true).max).toBe(1);
});

test('CSV keeps original precision, zero values, metadata and provenance independently of display rounding', () => {
  const csv = distributionCsv(data);
  expect(formatMagNumber(data.samples[1].abundancePercent)).toBe('0.1235');
  expect(csv).toContain('"0.123456789012345"');
  expect(csv).toContain('"zero","AD","","","","0"');
  expect(csv).toContain('"small","AD","71","F","2"');
  expect(csv).toContain('"source","scope"');
  expect(formatMagNumber(null)).toBe('—');
});
