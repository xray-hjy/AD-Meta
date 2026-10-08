import { applyBarStyle, barStyleDefaults } from './barStyle';
import { withoutTransientInteraction } from './chartExport';

const horizontal = {
  animation: false, legend: { data: ['AD', 'NC'] },
  tooltip: { formatter: 'original tooltip' },
  xAxis: { type: 'value', min: -1, max: 1, name: '效应量' },
  yAxis: { type: 'category', data: ['KO_A', 'KO_B'] },
  series: [{ type: 'bar', name: 'effect', barMaxWidth: 18, label: { show: true, formatter: p => `${p.value}` },
    markLine: { data: [{ xAxis: 0 }] },
    data: [{ value: -0.25, q: 0.04, itemStyle: { color: 'green', borderRadius: [5, 0, 0, 5] }, label: { position: 'left' } },
      { value: 0.3, q: 0.01, itemStyle: { color: 'red', borderRadius: [0, 5, 5, 0] } }, null] }],
};

test('default and reset preserve the source option exactly', () => {
  expect(applyBarStyle(horizontal, {})).toBe(horizontal);
  expect(barStyleDefaults(horizontal)).toMatchObject({ rounded: true, values: true, animation: false });
});

test('rounding follows horizontal sign and removes per-point overrides without losing evidence', () => {
  const styled = applyBarStyle(horizontal, { rounded: true, grid: false, precision: '2' });
  expect(styled.series[0].data[0].itemStyle).toEqual({ color: 'green', borderRadius: [6, 0, 0, 6] });
  expect(styled.series[0].data[1].itemStyle.borderRadius).toEqual([0, 6, 6, 0]);
  expect(styled.series[0].data[0].q).toBe(0.04);
  expect(styled.series[0].data[0].label.formatter({ value: -0.25 })).toBe('-0.25');
  expect(styled.series[0].data[2]).toBeNull();
  expect(styled.xAxis).toMatchObject({ min: -1, max: 1, name: '效应量', splitLine: { show: false } });
  expect(styled.tooltip).toBe(horizontal.tooltip);
  expect(styled.series[0].markLine).toBe(horizontal.series[0].markLine);
  expect(applyBarStyle(horizontal, { rounded: false }).series[0].data[0].itemStyle.borderRadius).toBe(0);
  expect(horizontal.series[0].data[0].itemStyle.borderRadius).toEqual([5, 0, 0, 5]);
});

test('vertical labels and corners handle positive, negative and zero values', () => {
  const option = { xAxis: [{ type: 'category', data: ['A', 'B', 'C'] }], yAxis: [{ type: 'value' }],
    series: [{ type: 'bar', data: [1, -2, 0] }] };
  const styled = applyBarStyle(option, { rounded: true, values: true });
  expect(styled.series[0].data.map(item => item.value)).toEqual([1, -2, 0]);
  expect(styled.series[0].data[0].itemStyle.borderRadius).toEqual([6, 6, 0, 0]);
  expect(styled.series[0].data[1].itemStyle.borderRadius).toEqual([0, 0, 6, 6]);
  expect(styled.series[0].data[0].label.position).toBe('top');
  expect(styled.series[0].data[1].label.position).toBe('bottom');
});

test('percent label precision preserves underlying fractions, counts and export styling', () => {
  const source = { ...horizontal, series: [{ type: 'bar', data: [0.123456], label: { show: true } }] };
  const styled = applyBarStyle(source, { precision: '2', rounded: true, values: false }, { scale: 100, suffix: '%' });
  expect(styled.series[0].label.formatter({ value: 0.123456 })).toBe('12.35%');
  expect(styled.series[0].data[0].value).toBe(0.123456);
  const exported = withoutTransientInteraction(styled);
  expect(exported.series[0].label.show).toBe(false);
  expect(exported.series[0].data[0].itemStyle.borderRadius).toEqual([0, 6, 6, 0]);
  expect(exported.tooltip[0].show).toBe(false);
  const counts = applyBarStyle(source, { precision: '2' }, { integerValues: true });
  expect(counts.series[0].label.formatter).toBeUndefined();
});

test('width adapts to category bands and invalid saved settings are ignored', () => {
  const styled = applyBarStyle(horizontal, { width: 'thick', animation: true });
  expect(styled.series[0].barWidth).toBe('75%');
  expect(styled.series[0].barMaxWidth).toBeCloseTo(23.4);
  expect(styled.animation).toBe(true);
  expect(applyBarStyle(horizontal, { rounded: 'invalid', precision: '99' })).toBe(horizontal);
});
