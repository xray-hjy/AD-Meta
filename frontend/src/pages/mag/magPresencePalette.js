import { interpolateRgb } from 'd3';

export const PRESENCE_GEOMETRY = { width: 64, height: 21, inset: 1.5, border: 2.4, stripeWidth: 2.8, stripeStep: 9.5 };
export const PRESENCE_BACKGROUND = { zero: '#FCFCFD', missing: '#DCE1E6' };
const mixWhite = (hex, ratio) => '#' + hex.slice(1).match(/../g).map(channel => Math.round(parseInt(channel, 16) * (1 - ratio) + 255 * ratio).toString(16).padStart(2, '0')).join('');
const definitions = [
  ['light-teal', '青绿', '#258575', '#7E3A78'], ['light-blue', '学术蓝', '#0072B2', '#9C420C'],
  ['light-orange', '赭橙', '#B85C28', '#173C78'], ['light-berry', '莓紫', '#9B4D79', '#17684F'],
  ['light-indigo', '靛紫', '#6556A3', '#805000'], ['light-gray', '灰度', '#4B5563', '#202020'],
  ['dark-navy', '墨蓝', '#354A68', '#AD4300'], ['dark-purple', '烟紫', '#584965', '#007449'],
  ['dark-brick', '陶砖红', '#794C48', '#005CA8'], ['dark-bronze', '古铜', '#695537', '#7927A8'],
  ['dark-steel', '钢蓝灰', '#495962', '#AA2157'], ['dark-graphite', '石墨', '#424349', '#936100'],
];
export const PRESENCE_PALETTES = definitions.map(([value, name, theme, stripe]) => {
  const family = value.startsWith('light') ? '浅色系' : '深色系';
  const hit = family === '浅色系' ? mixWhite(theme, .88) : theme;
  const zeroStroke = mixWhite(theme, .48);
  return { value, label: `${family} · ${name}`, shortLabel: name, family, theme, stripe, hit, zeroStroke,
    colors: [hit, PRESENCE_BACKGROUND.zero, PRESENCE_BACKGROUND.missing],
    states: [
      { label: '1 命中', style: { background: hit } },
      { label: '0 本次未命中', style: { background: PRESENCE_BACKGROUND.zero, boxShadow: `inset 0 0 0 2px ${zeroStroke}` } },
      { label: '不可评价', style: { background: `repeating-linear-gradient(135deg, ${stripe} 0 2.8px, transparent 2.8px 9.5px), ${PRESENCE_BACKGROUND.missing}` } },
    ],
  };
});
export const presencePalette = style => PRESENCE_PALETTES.find(p => p.value === style?.presencePalette) || PRESENCE_PALETTES[0];
export const presenceState = raw => raw == null ? '不可评价' : raw > 0 ? '1 命中' : '0 本次未命中';

// Shared geometry for live cells and the image-export renderer. Stroke and hatch
// remain state encodings when ordinary cell borders are disabled.
export function presenceCell(shape, raw, preset, borders = false, interactive = false) {
  const { x, y, width, height } = shape;
  if (!(width > 0 && height > 0)) return { type: 'group', children: [] };
  const g = PRESENCE_GEOMETRY, scale = Math.min(width / g.width, height / g.height);
  const children = [{ type: 'rect', shape, style: { fill: raw == null ? PRESENCE_BACKGROUND.missing : raw > 0 ? preset.hit : PRESENCE_BACKGROUND.zero,
    stroke: borders ? '#cbd2da' : 'none', lineWidth: borders ? .5 : 0 } }];
  if (raw === 0) {
    const inset = (g.inset + g.border / 2) * scale;
    children.push({ type: 'rect', shape: { x: x + inset, y: y + inset, width: Math.max(0, width - 2 * inset), height: Math.max(0, height - 2 * inset) },
      style: { fill: 'none', stroke: preset.zeroStroke, lineWidth: g.border * scale } });
  } else if (raw == null) {
    const step = g.stripeStep * scale;
    for (let offset = -height; offset < width; offset += step) children.push({ type: 'line',
      shape: { x1: x + offset, y1: y + height, x2: x + offset + height, y2: y },
      style: { stroke: preset.stripe, lineWidth: g.stripeWidth * scale } });
  }
  if (interactive) children.push({ type: 'rect', shape: { x: x + .5, y: y + .5, width: Math.max(0, width - 1), height: Math.max(0, height - 1) },
    style: { fill: 'transparent', stroke: 'transparent', lineWidth: 0 },
    emphasis: { style: { stroke: '#e45756', lineWidth: 2.5 } }, select: { style: { stroke: '#e45756', lineWidth: 2.5 } } });
  return { type: 'group', clipPath: { type: 'rect', shape }, children };
}

export function presenceSeries(id, data, preset, style) {
  return { id, type: 'custom', clip: true, selectedMode: 'single', data, encode: { x: 0, y: 1 }, renderItem: (params, api) => {
    const [cx, cy] = api.coord([api.value(0), api.value(1)]), size = api.size([1, 1]);
    const width = Math.abs(size[0]), height = Math.abs(size[1]);
    const raw = data[params.dataIndex].rawCount;
    const cell = presenceCell({ x: cx - width / 2, y: cy - height / 2, width, height }, raw, preset, style.borders, true);
    if (style.values && data.length <= 1500) cell.children.push({ type: 'text', x: cx, y: cy, silent: true,
      style: { text: raw == null ? '—' : String(raw), align: 'center', verticalAlign: 'middle', font: `${style.fontSize || 11}px sans-serif`,
        fill: raw > 0 && preset.family === '深色系' ? '#ffffff' : '#334155' } });
    return cell;
  }, label: { show: false } };
}

export function presenceLegend(preset) {
  return [{ type: 'group', right: 4, top: 4, silent: true, children: [1, 0, null].flatMap((raw, index) => {
    const y = index * 25;
    return [presenceCell({ x: 0, y, width: 30, height: 16 }, raw, preset),
      { type: 'text', x: 36, y: y + 3, style: { text: presenceState(raw), font: '11px sans-serif', fill: '#526075' } }];
  }) }];
}

export function functionalMatrixPreview(data, style, continuousColors) {
  const transposed = Boolean(style.transposed), binary = data.valueKind === 'presence', preset = presencePalette(style);
  const rows = transposed ? data.features.length : data.mags.length, columns = transposed ? data.mags.length : data.features.length;
  const rowStep = Math.max(1, Math.ceil(rows / 100)), columnStep = Math.max(1, Math.ceil(columns / 100));
  const cells = [], g = PRESENCE_GEOMETRY, scale = Math.min(12 / g.width, 8 / g.height);
  const maximum = Math.max(1, ...data.values.flat().filter(value => value != null).map(value => Math.log1p(value)));
  const countColor = raw => {
    const position = Math.log1p(raw) / maximum * (continuousColors.length - 1), index = Math.floor(position);
    const a = continuousColors[index], b = continuousColors[Math.min(index + 1, continuousColors.length - 1)], fraction = position - index;
    return interpolateRgb(a, b)(fraction);
  };
  const pattern = `<defs><pattern id="missing" patternUnits="userSpaceOnUse" width="${g.stripeStep * scale}" height="${g.stripeStep * scale}"><path d="M-1 1L1 -1 M0 ${g.stripeStep * scale}L${g.stripeStep * scale} 0" stroke="${preset.stripe}" stroke-width="${g.stripeWidth * scale}"/></pattern></defs>`;
  for (let y = 0; y < rows; y += rowStep) for (let x = 0; x < columns; x += columnStep) {
    const raw = transposed ? data.values[x][y] : data.values[y][x];
    const width = Math.min(columnStep, columns - x) * 12, height = Math.min(rowStep, rows - y) * 8;
    const fill = raw == null ? binary ? PRESENCE_BACKGROUND.missing : '#a2aab5' : binary ? raw > 0 ? preset.hit : PRESENCE_BACKGROUND.zero : countColor(raw);
    cells.push(`<rect x="${x * 12}" y="${y * 8}" width="${width}" height="${height}" fill="${fill}"/>`);
    if (binary && raw == null) cells.push(`<rect x="${x * 12}" y="${y * 8}" width="${width}" height="${height}" fill="url(#missing)"/>`);
    if (binary && raw === 0) cells.push(`<rect x="${x * 12 + 1}" y="${y * 8 + 1}" width="${Math.max(0, width - 2)}" height="${Math.max(0, height - 2)}" fill="none" stroke="${preset.zeroStroke}" stroke-width="${g.border * scale}"/>`);
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(1, columns) * 12} ${Math.max(1, rows) * 8}" preserveAspectRatio="none">${pattern}${cells.join('')}</svg>`)}`;
}
