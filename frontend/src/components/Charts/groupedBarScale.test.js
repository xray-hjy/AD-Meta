import { groupedBarScale } from './groupedBarScale';
const series = [{ key: 'AD' }, { key: 'NC' }];
test('visible low abundance values expand the axis and never change the original values', () => {
  const items = [{ values: { AD: 3, NC: 2 } }, { values: { AD: .00231, NC: .00345 } }];
  const whole = groupedBarScale(items, series, 400, true);
  const part = groupedBarScale(items.slice(1), series, 400, true);
  expect(whole.scale.domain()[1]).toBeGreaterThan(3);
  expect(part.scale.domain()[1]).toBeLessThan(.005);
  expect(part.scale(.00345)).toBeGreaterThan(280);
  expect(part.scale.domain()[0]).toBe(0);
  expect(part.ticks.every(value => part.format(value).length < 10)).toBe(true);
  expect(items[1].values.NC).toBe(.00345);
});
test('screen length controls tick density; missing and all-zero values have valid axes', () => {
  const items = [{ values: { AD: 0, NC: null } }];
  const small = groupedBarScale(items, series, 130, true), large = groupedBarScale(items, series, 650, true);
  expect(small.ticks.length).toBeLessThan(large.ticks.length);
  expect(small.scale.domain()).toEqual([0, 1]);
  expect(groupedBarScale([], series, 500, false).scale(0)).toBe(0);
  const signed = groupedBarScale([{ values: { AD: -.02, NC: .03 } }], series, 500, false);
  expect(signed.scale.domain()[0]).toBeLessThan(-.02);
  expect(signed.scale.domain()[1]).toBeGreaterThan(.03);
});
