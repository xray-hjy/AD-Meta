import { dendrogramSegments, heatmapTrees, treeMaximum } from './magDendrogram';

const tree = { leafIds: ['A', 'B', 'C'], merges: [[0, 2, 2, 2], [1, 3, 5, 3]] };
test('branches follow stable leaf IDs through reordering, rotation and cropping', () => {
  const options = { orientation: 'top', center: i => 10 + i * 20, baseline: 100, depth: 50 };
  const segments = dendrogramSegments(tree, ['B', 'A', 'C'], options);
  expect(segments[0].points).toEqual([[30, 100], [30, 80], [50, 80], [50, 100]]);
  expect(segments[1].points).toEqual([[10, 100], [10, 50], [40, 50], [40, 80]]);
  const rotated = dendrogramSegments(tree, ['B', 'A', 'C'], { ...options, orientation: 'left' });
  expect(rotated[0].points).toEqual(segments[0].points.map(([x, y]) => [y, x]));
  const cropped = dendrogramSegments(tree, ['B', 'C'], options);
  expect(cropped).toHaveLength(1);
  expect(cropped[0].distance).toBe(5);
  expect(cropped[0].points.every(point => point.every(Number.isFinite))).toBe(true);
});

test('zero distances remain zero and independent group trees share a distance scale', () => {
  const zero = { leafIds: ['A', 'B'], merges: [[0, 1, 0, 2]] };
  expect(dendrogramSegments(zero, zero.leafIds, { orientation: 'left', center: i => i * 10, baseline: 100 })[0].points)
    .toEqual([[100, 0], [100, 0], [100, 10], [100, 10]]);
  expect(treeMaximum([zero, tree])).toBe(5);
  const data = { settings: { sampleOrder: 'withinGroup', rowOrder: 'cluster' }, dendrograms: { mags: tree, samples: [tree, zero] } };
  expect(heatmapTrees(data)).toEqual({ top: [tree, zero], left: [tree] });
  expect(heatmapTrees(data, { transposed: true })).toEqual({ top: [tree], left: [tree, zero] });
  expect(heatmapTrees(data, { dendrograms: false })).toEqual({ top: [], left: [] });
});
