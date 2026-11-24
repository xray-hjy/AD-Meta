import { PRESENCE_BACKGROUND, presencePalette } from './magPresencePalette';

export const PHYLOGENY_LEAF_INSET_START = 65;
export const PHYLOGENY_LEAF_INSET_END = 80;
export const PHYLOGENY_BRANCH_COLOR = '#77818e';
export const PHYLOGENY_LEAF_COLORS = [
  ['mist-blue', '雾蓝', '#5785AB'],
  ['teal', '青绿', '#44897C'],
  ['amber', '琥珀', '#AD7B36'],
  ['coral', '珊瑚', '#BD7060'],
  ['lavender', '薰衣草紫', '#8771AD'],
  ['rose', '豆沙粉', '#AB6687'],
].map(([value, label, color]) => ({ value, label, colors: [color] }));

export function phylogenyLeafColor(value) {
  return PHYLOGENY_LEAF_COLORS.find(option => option.value === value)?.colors[0] || PHYLOGENY_LEAF_COLORS[0].colors[0];
}

export function phylogenyMinLeafSpacing(fontSize = 11) {
  return Math.max(18, Math.ceil(Number(fontSize) * 1.25) + 4);
}

const QUALITY_FIELDS = [
  { featureId: '完整度 %', name: '完整度', role: 'quality', key: 'completenessPercent', maximum: 100, color: '40,120,110' },
  { featureId: '污染率 %', name: '污染率', role: 'quality', key: 'contaminationPercent', maximum: 10, color: '164,64,96' },
];

export function buildPhylogenyModel(data, mode = 'topology') {
  const leaves = [], branches = [];
  const matrix = data.matrix;
  const targets = new Map(matrix?.mags.map((mag, index) => [mag.magId, index]) || []);
  const fields = [...QUALITY_FIELDS, ...(matrix?.features || []).map(field => ({ ...field, role: 'function', name: field.featureId }))];
  const visit = (node, depth, distance) => {
    const coordinate = mode === 'length' ? distance : depth;
    if (!node.children?.length) {
      const magId = node.name, position = leaves.length, matrixRow = targets.get(magId);
      const values = fields.map((field, index) => {
        if (matrixRow == null) return null;
        if (field.role === 'quality') return matrix.mags[matrixRow].quality?.[field.key] ?? null;
        return matrix.values[matrixRow]?.[index - QUALITY_FIELDS.length] ?? null;
      });
      const leaf = { magId, position, coordinate, values, depth, distance };
      leaves.push(leaf);
      return leaf;
    }
    const children = node.children.map(child => visit(child, depth + 1, distance + (Number(child.branchLength) || 0)));
    const position = children.reduce((sum, child) => sum + child.position, 0) / children.length;
    const parent = { position, coordinate };
    for (const child of children) branches.push({ parent, child });
    return parent;
  };
  visit(data.tree, 0, 0);
  const maximum = leaves.reduce((largest, leaf) => Math.max(largest, leaf.coordinate), 0);
  return { leaves, branches, fields, mode, maximum };
}

export function phylogenyGeometry(model, { width, height, transposed = false, start = 0, end = model.leaves.length, fontSize = 11 }) {
  const progressSize = transposed ? height : width;
  const leafSize = transposed ? width : height;
  const leafExtent = Math.max(1, leafSize - PHYLOGENY_LEAF_INSET_START - PHYLOGENY_LEAF_INSET_END);
  const spacing = leafExtent / Math.max(1, end - start);
  const progressStart = transposed ? (width < 340 ? 76 : 48) : 20;
  const labelWidth = transposed ? Math.max(136, Number(fontSize) * 12)
    : Math.min(240, Math.max(132, progressSize * .18, Number(fontSize) * 11));
  const availableTracks = progressSize - progressStart - labelWidth - 128;
  const trackWidth = Math.min(transposed ? 27 : 58, Math.max(12, Math.floor(availableTracks / model.fields.length)));
  const trackStart = progressSize - model.fields.length * trackWidth - 16;
  const treeEnd = trackStart - labelWidth - 12;
  const xy = (progress, leaf) => transposed ? [leaf, progress] : [progress, leaf];
  const box = (progress, leaf, progressWidth, leafWidth) => transposed
    ? { x: leaf, y: progress, width: leafWidth, height: progressWidth }
    : { x: progress, y: leaf, width: progressWidth, height: leafWidth };
  const leafAxis = position => PHYLOGENY_LEAF_INSET_START + (position - start + .5) * spacing;
  const progressAxis = coordinate => progressStart + coordinate / (model.maximum || 1) * Math.max(1, treeEnd - progressStart);
  return {
    width, height, start, end, transposed, spacing, readable: spacing + 1e-6 >= phylogenyMinLeafSpacing(fontSize),
    progressStart, treeEnd, trackStart, trackWidth, leafExtent, xy, box, leafAxis, progressAxis,
  };
}

const numberString = value => Number(value.toFixed(3));
const coordinateString = point => point.map(numberString).join(',');

export function phylogenyBranchPath(model, layout, branchStyle = 'rounded') {
  const { xy, leafAxis, progressAxis, spacing, start, end, transposed } = layout;
  const path = [];
  for (const { parent, child } of model.branches) {
    if (Math.max(parent.position, child.position) < start - .5 || Math.min(parent.position, child.position) > end - .5) continue;
    const p = progressAxis(parent.coordinate), v = leafAxis(parent.position);
    const q = progressAxis(child.coordinate), w = leafAxis(child.position);
    const coordinate = (progress, leaf) => coordinateString(xy(progress, leaf));
    const segment = `M${coordinate(p, v)}`, destination = coordinate(q, w);
    if (branchStyle === 'diagonal') {
      path.push(`${segment}L${destination}`);
      continue;
    }
    const radius = branchStyle === 'rounded' ? Math.min(4, spacing * .3, Math.abs(q - p) / 2, Math.abs(w - v) / 2) : 0;
    if (radius < .05) {
      path.push(`${segment}L${coordinate(p, w)}L${destination}`);
      continue;
    }
    const along = Math.sign(q - p), across = Math.sign(w - v), r = numberString(radius);
    const sweep = Number((transposed ? 1 : -1) * along * across > 0);
    path.push(`${segment}L${coordinate(p, w - across * radius)}A${r},${r} 0 0 ${sweep} ${coordinate(p + along * radius, w)}L${destination}`);
  }
  return path.join('');
}

export function phylogenyTrackFill(raw, field, palette) {
  if (field.role === 'quality') return raw == null
    ? PRESENCE_BACKGROUND.missing
    : `rgba(${field.color},${Math.max(.08, Math.min(1, raw / field.maximum))})`;
  return raw == null ? PRESENCE_BACKGROUND.missing : raw > 0 ? palette.hit : PRESENCE_BACKGROUND.zero;
}

export function phylogenyPreview(model, settings) {
  const layout = phylogenyGeometry(model, { ...settings, start: 0, end: model.leaves.length });
  const { width, height, trackStart, trackWidth, leafAxis, spacing, box } = layout;
  const palette = presencePalette(settings);
  const colors = new Map();
  const dots = [];
  const previewWidth = 260, previewHeight = 172;
  const scaleX = previewWidth / width, scaleY = previewHeight / height;
  for (const leaf of model.leaves) {
    const center = leafAxis(leaf.position);
    const [x, y] = layout.xy(layout.progressAxis(leaf.coordinate), center);
    dots.push(`M${numberString(x * scaleX)},${numberString(y * scaleY)}h.3`);
    leaf.values.forEach((raw, index) => {
      const field = model.fields[index];
      const fill = field.role === 'function' && raw === 0 ? palette.zeroStroke : phylogenyTrackFill(raw, field, palette);
      const segment = box(trackStart + index * trackWidth, center - spacing / 2, trackWidth, spacing);
      const x = numberString(segment.x * scaleX), y = numberString(segment.y * scaleY);
      const w = numberString(segment.width * scaleX), h = numberString(segment.height * scaleY);
      if (!colors.has(fill)) colors.set(fill, []);
      colors.get(fill).push(`M${x},${y}h${w}v${h}h-${w}Z`);
    });
  }
  const tracks = [...colors].map(([fill, shapes]) => `<path fill="${fill}" d="${shapes.join('')}"/>`).join('');
  const branches = phylogenyBranchPath(model, layout, settings.branchStyle);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${previewWidth} ${previewHeight}" preserveAspectRatio="none"><rect width="${previewWidth}" height="${previewHeight}" fill="#fff"/><path transform="scale(${scaleX} ${scaleY})" vector-effect="non-scaling-stroke" stroke="${PHYLOGENY_BRANCH_COLOR}" stroke-width=".4" fill="none" d="${branches}"/><path d="${dots.join('')}" fill="none" stroke="${phylogenyLeafColor(settings.leafColor)}" stroke-width=".55" stroke-linecap="round"/>${tracks}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
