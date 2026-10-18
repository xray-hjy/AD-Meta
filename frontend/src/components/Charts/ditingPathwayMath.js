export const GROUPS = ['AD', 'NC'];
export const transformValue = (value, transform) => transform === 'log' ? Math.log10(value + 1) : value;
export const formatPathwayValue = value => Number(value) !== 0 && Math.abs(Number(value)) < .001
  ? Number(value).toExponential(2) : Number(value).toLocaleString('en', { maximumFractionDigits: 3 });
export const formatProbability = value => value < .001 ? Number(value).toExponential(2) : Number(value).toFixed(3);
export const shortPathway = name => name.length > 43 ? `${name.slice(0, 42)}…` : name;

export function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * p, lo = Math.floor(position), hi = Math.ceil(position);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
}

export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  const mean = n ? sorted.reduce((sum, value) => sum + value, 0) / n : 0;
  const q1 = quantile(sorted, .25), q3 = quantile(sorted, .75);
  return { sorted, n, mean, min: sorted[0] ?? 0, max: sorted.at(-1) ?? 0, median: quantile(sorted, .5), q1, q3,
    sd: n > 1 ? Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : 0,
    lo: sorted.find(value => value >= q1 - 1.5 * (q3 - q1)) ?? 0,
    hi: sorted.findLast(value => value <= q3 + 1.5 * (q3 - q1)) ?? 0 };
}

// Reflection at zero prevents the KDE drawing impossible negative abundance.
// Zero observations remain explicit points; a constant sample gets no contour.
export function density(values, smoothing = 1, resolution = 96) {
  const stats = summarize(values);
  if (stats.n < 3 || stats.max === stats.min) return { ...stats, curve: [], bandwidth: null };
  const robust = Math.min(stats.sd, (stats.q3 - stats.q1) / 1.34 || stats.sd);
  const bandwidth = Math.max(.9 * robust * stats.n ** -.2 * smoothing, (stats.max - stats.min) / 500, 1e-12);
  const min = Math.max(0, stats.min - 3 * bandwidth), max = stats.max + 3 * bandwidth;
  const factor = 1 / (stats.n * bandwidth * Math.sqrt(2 * Math.PI));
  const steps = Math.max(resolution, Math.min(1024, Math.ceil((max - min) / bandwidth * 2) + 1));
  const curve = Array.from({ length: steps }, (_, index) => {
    const x = min + (max - min) * index / (steps - 1);
    const y = values.reduce((sum, value) => sum + Math.exp(-.5 * ((x - value) / bandwidth) ** 2)
      + Math.exp(-.5 * ((x + value) / bandwidth) ** 2), 0) * factor;
    return [x, y];
  });
  return { ...stats, curve, bandwidth };
}

export function empiricalCdf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const result = [[sorted[0], 0]];
  sorted.forEach((value, index) => {
    if (index === sorted.length - 1 || sorted[index + 1] !== value) result.push([value, (index + 1) / sorted.length]);
  });
  return result;
}

// Greedy collision avoidance in screen coordinates, recomputed for the current
// chart dimensions. Deterministic order makes repeated renders reproducible.
export function swarmOffsets(points, yPixel, diameter, maxWidth) {
  const placed = [], result = new Map();
  [...points].sort((a, b) => a.v - b.v || a.id.localeCompare(b.id)).forEach(point => {
    const y = yPixel(point.v), neighbors = placed.filter(other => Math.abs(other.y - y) < diameter);
    const candidates = [0];
    neighbors.forEach(other => {
      const delta = Math.sqrt(Math.max(0, diameter ** 2 - (y - other.y) ** 2)) + .1;
      candidates.push(other.x - delta, other.x + delta);
    });
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    const x = candidates.find(candidate => Math.abs(candidate) <= maxWidth && neighbors.every(other =>
      (candidate - other.x) ** 2 + (y - other.y) ** 2 >= diameter ** 2 - .01));
    // When zero ties exhaust the row width, preserve every observation with a
    // bounded deterministic offset. The UI reports the possible overlap.
    const offset = x ?? (((point.index * 37 % 101) / 100) * 2 - 1) * maxWidth;
    placed.push({ x: offset, y }); result.set(point.id, offset);
  });
  return result;
}

export function zScores(values) {
  const { mean, sd } = summarize(values);
  return values.map(value => sd ? (value - mean) / sd : 0);
}

// Average linkage, Euclidean distance on supplied vectors. Stored distances
// avoid recomputing high-dimensional pair distances at every merge.
export function clusterOrder(vectors, ids) {
  if (vectors.length < 2) return { order: ids.map((_, i) => i), leafIds: ids, merges: [] };
  const distances = new Map(), key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  vectors.forEach((a, i) => vectors.slice(0, i).forEach((b, j) => {
    distances.set(key(i, j), Math.sqrt(a.reduce((sum, value, k) => sum + (value - b[k]) ** 2, 0)));
  }));
  let active = vectors.map((_, index) => ({ id: index, size: 1, leaves: [index] }));
  const merges = [];
  while (active.length > 1) {
    let ai = 0, bi = 1, best = Infinity;
    active.forEach((a, i) => active.slice(0, i).forEach((b, j) => {
      const d = distances.get(key(a.id, b.id));
      if (d < best) { best = d; ai = j; bi = i; }
    }));
    const a = active[ai], b = active[bi], id = vectors.length + merges.length;
    merges.push([a.id, b.id, best, a.size + b.size]);
    active.forEach(other => {
      if (other === a || other === b) return;
      distances.set(key(id, other.id), (distances.get(key(a.id, other.id)) * a.size
        + distances.get(key(b.id, other.id)) * b.size) / (a.size + b.size));
    });
    active = active.filter(other => other !== a && other !== b);
    active.push({ id, size: a.size + b.size, leaves: [...a.leaves, ...b.leaves] });
  }
  return { order: active[0].leaves, leafIds: ids, merges };
}

export function distributionStatus(item) {
  const stats = summarize(item.values), positive = item.values.filter(value => value > 0).length;
  if (stats.max === 0) return '全部样本为零：显示实际观测值，不估计密度。';
  if (stats.min === stats.max) return '全部样本数值恒定：显示实际观测值，不估计密度。';
  if (positive / stats.n < .1) return `仅 ${positive}/${stats.n} 个样本非零，建议同时查看 ECDF 或箱线＋蜂群图。`;
  return null;
}
