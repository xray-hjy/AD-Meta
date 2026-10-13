export const TREE_DEPTH = 80, TREE_SPACE = 96;

export function heatmapTrees(data, style = {}) {
  if (style.dendrograms === false) return { top: [], left: [] };
  const mags = data.settings?.rowOrder === 'cluster' && data.dendrograms?.mags?.merges?.length ? [data.dendrograms.mags] : [];
  const samples = data.settings?.sampleOrder !== 'group' ? (data.dendrograms?.samples || []).filter(tree => tree.merges?.length) : [];
  return style.transposed ? { top: mags, left: samples } : { top: samples, left: mags };
}

export function treeMaximum(trees) {
  return Math.max(0, ...trees.flatMap(tree => tree.merges.map(merge => merge[2])));
}

// Stable IDs, not the original leaf indexes, place tips at displayed cell centers.
// Missing tips are pruned for an export window, without inventing new merges.
export function dendrogramSegments(tree, ids, { orientation, center, baseline, depth = TREE_DEPTH, maxDistance = treeMaximum([tree]) }) {
  const positions = new Map(ids.map((id, index) => [id, index]));
  const nodes = tree.leafIds.map(id => positions.has(id) ? { position: center(positions.get(id)), distance: 0 } : null);
  const point = (position, distance) => {
    const offset = maxDistance > 0 ? distance / maxDistance * depth : 0;
    return orientation === 'top' ? [position, baseline - offset] : [baseline - offset, position];
  };
  const segments = [];
  tree.merges.forEach(([a, b, distance, size], index) => {
    const left = nodes[a], right = nodes[b];
    if (!left || !right) { nodes.push(left || right || null); return; }
    const position = (left.position + right.position) / 2;
    segments.push({ id: index, distance, size, points: [point(left.position, left.distance), point(left.position, distance),
      point(right.position, distance), point(right.position, right.distance)] });
    nodes.push({ position, distance });
  });
  return segments;
}
