// Keep the published discrete colours unchanged. Journal names refer to the
// ggsci palettes inspired by their figures, not journal submission requirements.
// https://github.com/nanxstats/ggsci/blob/master/R/palettes.R
// https://github.com/axismaps/colorbrewer/blob/master/colorbrewer_schemes.js
// https://sronpersonalpages.nl/~pault/ (default order, no bad-data grey)
// https://jfly.uni-koeln.de/color/ (Okabe–Ito / Color Universal Design)
const GGSCI = 'https://nanx.me/ggsci/articles/ggsci.html';
const BREWER = 'https://colorbrewer2.org/';
const TOL = 'https://sronpersonalpages.nl/~pault/';

const palette = (value, name, colors, pair, pairLabel, source) => ({ value, name, colors, pair, pairLabel, source });
export const RESEARCH_PALETTES = [
  palette('okabe-ito', 'Okabe–Ito', ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000'], [4, 5], '蓝 / 朱红', 'https://jfly.uni-koeln.de/color/'),
  palette('npg', 'NPG', ['#e64b35', '#4dbbd5', '#00a087', '#3c5488', '#f39b7f', '#8491b4', '#91d1c2', '#dc0000', '#7e6148', '#b09c85'], [3, 0], '深蓝 / 珊瑚红', GGSCI),
  palette('aaas', 'AAAS', ['#3b4992', '#ee0000', '#008b45', '#631879', '#008280', '#bb0021', '#5f559b', '#a20056', '#808180', '#1b1919'], [0, 2], '靛蓝 / 深绿', GGSCI),
  palette('nejm', 'NEJM', ['#bc3c29', '#0072b5', '#e18727', '#20854e', '#7876b1', '#6f99ad', '#ffdc91', '#ee4c97'], [1, 0], '蓝 / 砖红', GGSCI),
  palette('lancet', 'Lancet', ['#00468b', '#ed0000', '#42b540', '#0099b4', '#925e9f', '#fdaf91', '#ad002a', '#adb6b6', '#1b1919'], [0, 1], '深蓝 / 红', GGSCI),
  palette('jama', 'JAMA', ['#374e55', '#df8f44', '#00a1d5', '#b24745', '#79af97', '#6a6599', '#80796b'], [0, 1], '墨青 / 橙', GGSCI),
  palette('jco', 'JCO', ['#0073c2', '#efc000', '#868686', '#cd534c', '#7aa6dc', '#003c67', '#8f7700', '#3b3b3b', '#a73030', '#4a6990'], [0, 3], '蓝 / 玫瑰红', GGSCI),
  palette('tol-bright', 'Paul Tol Bright', ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377', '#bbbbbb'], [0, 1], '蓝 / 玫瑰粉', TOL),
  palette('tol-muted', 'Paul Tol Muted', ['#cc6677', '#332288', '#ddcc77', '#117733', '#88ccee', '#882255', '#44aa99', '#999933', '#aa4499'], [1, 6], '靛紫 / 青绿', TOL),
  palette('brewer-paired', 'ColorBrewer Paired', ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'], [1, 7], '蓝 / 橙', BREWER),
  palette('brewer-set2', 'ColorBrewer Set2', ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'], [0, 1], '青绿 / 鲑橙', BREWER),
  palette('brewer-dark2', 'ColorBrewer Dark2', ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'], [0, 1], '深绿 / 橙', BREWER),
  palette('d3-category20', 'D3 Category20', ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf', '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5'], [0, 1], '蓝 / 橙', GGSCI),
];

const PAIR_ONLY = [palette('tol-high-contrast', 'Paul Tol High Contrast', ['#004488', '#ddaa33', '#bb5566'], [0, 1], '深蓝 / 金黄', TOL)];
const ALIASES = { accessible: 'okabe-ito', classic: 'npg', muted: 'tol-muted' };
export const isCategoricalPalette = (kind, style = {}) => kind === 'taxonomy' || (kind === 'mapping' && style.groupBy === 'batch');

export function researchPaletteOptions(kind, style = {}) {
  const categorical = isCategoricalPalette(kind, style);
  return [...RESEARCH_PALETTES, ...(categorical ? [] : PAIR_ONLY)].map(item => ({ ...item,
    colors: categorical ? item.colors : item.pair.map(index => item.colors[index]),
    label: categorical ? `${item.name} · ${item.colors.length} 色` : `${item.name} · ${item.pairLabel}`,
    shortLabel: item.name,
  }));
}

export function resolveResearchPalette(kind, style = {}) {
  const options = researchPaletteOptions(kind, style);
  const key = ALIASES[style.palette] || style.palette;
  // A pair-only palette cannot supply five batch colours. Prefer the closest
  // multi-category Tol palette when the grouping changes, with the same key in
  // both the toolbar and renderer. No preference update or render side effect.
  const compatibleKey = key === 'tol-high-contrast' && isCategoricalPalette(kind, style) ? 'tol-bright' : key;
  return options.find(item => item.value === compatibleKey)
    || options.find(item => item.value === (kind === 'taxonomy' ? 'brewer-paired' : 'okabe-ito'));
}
