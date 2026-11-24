import { centeredLeafRange, leafCapacity, phylogenyDrawing, phylogenyTrackWindow, resizeLeafRange } from './magPhylogenyNavigation';
import { phylogenyMinLeafSpacing } from './magPhylogenySurfaceModel';

const count = 869;
const view = { height: 'auto', fit: false, transposed: false, scale: 1, range: [0, 1] };

test('auto includes the complete tree at readable spacing in both directions', () => {
  const horizontal = phylogenyDrawing(count, view, 18, 1320, 1180);
  const vertical = phylogenyDrawing(count, { ...view, transposed: true }, 18, 1320, 1180);
  expect(horizontal).toMatchObject({ policy: 'auto', start: 0, end: 869, height: 15787, step: 18 });
  expect(vertical).toMatchObject({ policy: 'auto', start: 0, end: 869, width: 15787, step: 18 });
  expect(phylogenyDrawing(count, { ...view, fit: true }, 18, 1320, 1180)).toMatchObject({ policy: 'fit', start: 0, end: 869 });
  expect(phylogenyDrawing(3, view, 18, 1320, 1180).height).toBeLessThan(300);
});

test('fixed capacities follow the leaf-axis extent and a larger label size contracts the centered range', () => {
  expect([1000, 1400, 2000].map(height => leafCapacity(count, height, 18))).toEqual([47, 69, 103]);
  const fixed = { ...view, height: '1400', range: [380, 449] };
  const larger = phylogenyDrawing(count, fixed, phylogenyMinLeafSpacing(16), 1320, 1180);
  const flipped = phylogenyDrawing(count, { ...fixed, transposed: true }, 18, 1320, 1180);
  expect(larger).toMatchObject({ policy: 'fixed', capacity: 52, start: 389, end: 441 });
  expect(larger.step).toBeGreaterThanOrEqual(24);
  expect(flipped).toMatchObject({ policy: 'fixed', capacity: 69, start: 380, end: 449, width: 1400 });
});

test('slider and center-anchored operations enforce capacity while both ends stay reachable', () => {
  expect(resizeLeafRange(count, 69, [180, 240], [0, 240])).toEqual([171, 240]);
  expect(resizeLeafRange(count, 69, [180, 240], [180, 869])).toEqual([180, 249]);
  expect(resizeLeafRange(count, 69, [180, 240], [183, 240])).toEqual([183, 240]);
  expect(centeredLeafRange(count, 69, 0)).toEqual([0, 69]);
  expect(centeredLeafRange(count, 69, 869)).toEqual([800, 869]);
  expect(centeredLeafRange(3, 69, 1.5)).toEqual([0, 3]);
});

test('track blocks keep the leaf viewport covered while clamping at each end of the tree', () => {
  expect(phylogenyTrackWindow(0, count, 0, 49)).toEqual([0, 96]);
  expect(phylogenyTrackWindow(0, count, 450, 499)).toEqual([416, 544]);
  expect(phylogenyTrackWindow(0, count, 819, count)).toEqual([768, count]);
  expect(phylogenyTrackWindow(0, 3, 0, 3)).toEqual([0, 3]);
});
