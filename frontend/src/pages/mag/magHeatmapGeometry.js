import { constrainCamera } from '../../components/Charts/chartCamera';

export const CELL_W = 20, CELL_H = 22;
// Source matrices always remain Sample × MAG; only visual coordinates change.
export function sourceCell(x, y, transposed) {
  return transposed ? { sample: y, mag: x } : { sample: x, mag: y };
}
export function transposeCamera({ camera, previousPlot, plot, world }) {
  const x = (previousPlot.left + previousPlot.width / 2 - camera.x) / camera.k / CELL_W;
  const y = (previousPlot.top + previousPlot.height / 2 - camera.y) / camera.k / CELL_H;
  return constrainCamera({ k: camera.k, x: plot.left + plot.width / 2 - y * CELL_W * camera.k,
    y: plot.top + plot.height / 2 - x * CELL_H * camera.k }, world, plot);
}
