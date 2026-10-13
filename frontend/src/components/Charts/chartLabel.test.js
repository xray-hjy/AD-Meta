import { shortenChartLabel } from './chartLabel';

test('variable-width labels retain a complete suffix and fit the requested width', () => {
  const measure = text => Array.from(text).reduce((width, char) => width + (char === 'M' ? 12 : char === 'i' ? 2 : 6), 0);
  const source = 'MMMMiiii full MAG identifier';
  const shortened = shortenChartLabel(source, 70, measure);
  expect(shortened.endsWith('...')).toBe(true);
  expect(measure(shortened)).toBeLessThanOrEqual(70);
  expect(shortened).not.toBe('...');
  expect(shortenChartLabel('iiii', 10, measure)).toBe('iiii');
  expect(shortenChartLabel(source, 15, measure)).toBeNull();
});
