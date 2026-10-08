import { transposeCamera, sourceCell } from './magHeatmapGeometry';
import { transposeTiles } from './HeatmapTransposeMotion';

test('manual axis swap preserves the same observation at the viewport center', () => {
  const previousPlot = { left: 260, top: 89, width: 500, height: 300 };
  const plot = { left: 296, top: 61, width: 464, height: 328 };
  const camera = { x: -200, y: -1400, k: 1 };
  const after = transposeCamera({ camera, previousPlot, plot, world: { width: 17440, height: 4070 } });
  const sampleBefore = (previousPlot.left + previousPlot.width / 2 - camera.x) / 20;
  const magBefore = (previousPlot.top + previousPlot.height / 2 - camera.y) / 22;
  expect((plot.left + plot.width / 2 - after.x) / 20).toBeCloseTo(magBefore);
  expect((plot.top + plot.height / 2 - after.y) / 22).toBeCloseTo(sampleBefore);
  expect(sourceCell(5, 9, true)).toEqual({ sample: 9, mag: 5 });
});

test('large-matrix transitions cap tiles at 384 and transpose source regions exactly', () => {
  const before = { image: { width: 185, height: 872 }, visible: { x: 0, y: 0, width: 3700, height: 19184 }, camera: { x: 100, y: 61, k: .1 } };
  const after = { camera: { x: 300, y: 61, k: .04 } };
  const tiles = transposeTiles(before, after);
  expect(tiles.length).toBeLessThanOrEqual(384);
  expect(tiles.length).toBeGreaterThan(250);
  for (const tile of tiles) {
    const [x, y, w, h] = tile.source;
    expect(tile.target).toEqual([y, x, h, w]);
    expect(tile.to.x).toBe(300 + y * 20 * .04);
    expect(tile.to.y).toBe(61 + x * 22 * .04);
  }
});
