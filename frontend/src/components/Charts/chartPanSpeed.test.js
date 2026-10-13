import { chartPanSpeed } from './chartPanSpeed';
test('speed depends on rendered travel and viewport, scales with zoom and disables contained axes', () => {
  const world = { width: 3700, height: 29648 }, viewport = { width: 900, height: 500 };
  const normal = chartPanSpeed(world, { width: 3700, height: 500 }, viewport);
  const zoomed = chartPanSpeed(world, { width: 3700, height: 250 }, viewport);
  expect(normal.x.speed).toBe(0);
  expect(normal.y.speed).toBeGreaterThan(.9);
  expect(zoomed.y.speed).toBeGreaterThan(normal.y.speed * 1.9);
  expect(normal.y.speed * 10000).toBeCloseTo(29648 - 500);
  const resized = chartPanSpeed(world, { width: 3700, height: 500 }, { width: 900, height: 1000 });
  expect(resized.y.speed).toBe(normal.y.speed * 2);
  expect(chartPanSpeed(world, world, viewport).y.tap).toBe(0);
});
test('short content uses screen-relative speed while absent geometry remains compatible', () => {
  expect(chartPanSpeed({ width: 1200, height: 1000 }, { width: 900, height: 500 }, { width: 900, height: 500 }).y)
    .toEqual({ base: .9, speed: .9, tap: 90 });
  expect(chartPanSpeed().x).toEqual({ base: .9, speed: .9, tap: 36 });
});
