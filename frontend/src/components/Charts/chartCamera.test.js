import { constrainCamera, fitCamera, visibleWorld, zoomCamera, rangeCamera } from './chartCamera';

const world = { width: 3700, height: 19184 };
const plot = { left: 260, top: 89, width: 900, height: 480 };

test.each(['x', 'y'])('category navigation on %s leaves the value axis fully visible', axis => {
  const horizontal = axis === 'x';
  const camera = rangeCamera(340, 680, world, plot, axis);
  const visible = visibleWorld(camera, world, plot, axis);
  expect(horizontal ? visible.x : visible.y).toBeCloseTo(340);
  expect(horizontal ? visible.width : visible.height).toBeCloseTo(340);
  expect(horizontal ? visible.height : visible.width).toBe(horizontal ? world.height : world.width);
  const next = zoomCamera(camera, camera.k * 2, world, plot, undefined, axis);
  expect(horizontal ? next.y : next.x).toBe(horizontal ? plot.top : plot.left);
  const full = visibleWorld(fitCamera(world, plot, false, axis), world, plot, axis);
  expect(full).toEqual({ x: 0, y: 0, ...world });
});

test('fit contains the entire 872 by 185 matrix and preserves its aspect ratio', () => {
  const fitted = fitCamera(world, plot);
  expect(visibleWorld(fitted, world, plot)).toEqual({ x: 0, y: 0, ...world });
  expect(fitted.k).toBeCloseTo(480 / 19184);
});

test('zoom keeps the world point under the anchor and clamps navigation to data bounds', () => {
  const camera = { k: 1, x: -1000, y: -2000 };
  const anchor = { x: 600, y: 300 };
  const next = zoomCamera(camera, 2, world, plot, anchor);
  expect((anchor.x - next.x) / next.k).toBe((anchor.x - camera.x) / camera.k);
  expect((anchor.y - next.y) / next.k).toBe((anchor.y - camera.y) / camera.k);
  const constrained = constrainCamera({ k: 1, x: -1e8, y: 1e8 }, world, plot);
  expect(visibleWorld(constrained, world, plot)).toEqual({ x: 2800, y: 0, width: 900, height: 480 });
});

test('width fit gives a continuous partial view rather than changing the selected rows', () => {
  const visible = visibleWorld(fitCamera(world, plot, true), world, plot);
  expect(visible.x).toBe(0);
  expect(visible.y).toBe(0);
  expect(visible.width).toBeCloseTo(world.width);
  expect(visible.height).toBeLessThan(world.height);
});

test('a small matrix stays centered on both axes after fit, zoom and attempted panning', () => {
  const shortWorld = { width: 17440, height: 4070 };
  const fitted = fitCamera(shortWorld, plot);
  const checkCenter = camera => {
    expect(camera.x + shortWorld.width * camera.k / 2).toBeCloseTo(plot.left + plot.width / 2);
    expect(camera.y + shortWorld.height * camera.k / 2).toBeCloseTo(plot.top + plot.height / 2);
    expect(visibleWorld(camera, shortWorld, plot)).toEqual({ x: 0, y: 0, ...shortWorld });
  };
  checkCenter(fitted);
  const smaller = zoomCamera(fitted, .025, shortWorld, plot);
  checkCenter(smaller);
  checkCenter(constrainCamera({ ...smaller, x: -10000, y: 10000 }, shortWorld, plot));
  const large = constrainCamera({ k: 1, x: 10000, y: 10000 }, shortWorld, plot);
  expect(large.y).toBe(plot.top);
});
