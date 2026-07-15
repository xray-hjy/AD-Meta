import { useEffect, useMemo, useRef, useState } from 'react';
import TaxonomyViewport from './TaxonomyViewport';
import {
  RadialTreeRenderer,
  SankeyRenderer,
  SunburstRenderer,
  TreemapRenderer,
} from './taxonomy/TaxonomyRenderers';
import useAvailableViewport from '../../hooks/useAvailableViewport';
import {
  getTaxonomyViewportPolicy,
  resolveSankeyCanvasConstraints,
  resolveSankeyDevicePixelRatio,
  resolveSankeyCanvasHeight,
  resolveTreemapCanvasSize,
} from './taxonomyViewportPolicy';

const SUNBURST_COLORS = [
  '#3B82F6',
  '#06B6D4',
  '#22C55E',
  '#FACC15',
  '#FB923C',
  '#F43F5E',
  '#A78BFA',
  '#14B8A6',
  '#F472B6',
  '#84CC16',
];

const SANKEY_LEVELS = [
  { color: '#3B82F6' },
  { color: '#14B8A6' },
  { color: '#F97316' },
  { color: '#A855F7' },
  { color: '#EC4899' },
];
const SANKEY_LABEL_ROW_HEIGHT = 18;
const SANKEY_VERTICAL_PADDING = 160;
const SANKEY_ECHARTS_OPTS = Object.freeze({
  renderer: 'canvas',
  devicePixelRatio: resolveSankeyDevicePixelRatio(
    typeof window === 'undefined' ? 1 : window.devicePixelRatio
  ),
});
const PHYLUM_MERGE_RATIO = 0.01;
const SUNBURST_MERGED_PHYLA = 'Others';
const SUNBURST_MERGED_PHYLA_COLOR = '#94a3b8';
const SUNBURST_MERGED_PHYLA_ID = 'taxonomy-merged-others';

function resizeChartToContainer(chart) {
  const container = chart?.getDom?.();
  if (!container) return;
  const width = Math.floor(container.clientWidth);
  const height = Math.floor(container.clientHeight);
  if (width <= 0 || height <= 0) return;
  chart.resize({ width, height });
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

function mixColor(color, target, amount) {
  const source = hexToRgb(color);
  const dest = hexToRgb(target);
  return rgbToHex({
    r: source.r + (dest.r - source.r) * amount,
    g: source.g + (dest.g - source.g) * amount,
    b: source.b + (dest.b - source.b) * amount,
  });
}

function formatValue(value) {
  const v = Number(value) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function formatPercent(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return null;
  return `${(ratio * 100).toFixed(ratio < 0.01 ? 2 : 1)}%`;
}

function tooltipHtml(params) {
  const payload = params.data || {};
  const chain = (params.treePathInfo || [])
    .map(node => node.name)
    .filter(Boolean)
    .join(' > ');
  const ratio = formatPercent(payload.ratio);
  const mergedCount = Number(payload.mergedCount || 0);
  return `
    <b>${params.name}</b><br/>
    ${chain ? `${chain}<br/>` : ''}
    丰度: ${formatValue(params.value)}
    ${ratio ? `<br/>占父级: ${ratio}` : ''}
    ${payload.mergedPhylaNames ? `<br/>合并门级: ${payload.mergedPhylaNames}` : ''}
    ${mergedCount ? `<br/>合并小分类: ${mergedCount}` : ''}
  `;
}

function taxonomySunburstLabel(params, view = 'overview') {
  const depth = Math.max((params.treePathInfo?.length || 1) - 1, 0);
  const ratio = Number(params.data?.ratio ?? 1);
  const name = params.name || '';

  if (view === 'others') {
    if (name === SUNBURST_MERGED_PHYLA) return name;
    if (depth <= 2) return ratio >= 0.02 ? name : '';
    if (depth === 3) return ratio >= 0.06 ? name : '';
    if (depth === 4) return ratio >= 0.1 ? name : '';
    return '';
  }

  if (name.startsWith('Other ')) return ratio >= 0.14 ? name : '';
  if (depth <= 1) return ratio >= 0.08 ? name : '';
  if (depth === 2) return ratio >= 0.12 ? name : '';
  if (depth === 3) return ratio >= 0.18 ? name : '';
  return '';
}

function buildSunburstLevels(view) {
  const insideLabel = {
    position: 'inside',
    rotate: 'radial',
    align: 'center',
  };
  const outsideLabel = {
    show: true,
    position: 'outside',
    rotate: 'radial',
    distance: 10,
    align: 'center',
    color: '#111827',
    fontSize: 10,
    overflow: 'none',
    formatter(params) {
      return params.name || '';
    },
  };

  if (view === 'others') {
    return [
      {},
      {
        label: {
          ...insideLabel,
          color: '#475569',
          fontWeight: 700,
        },
        itemStyle: {
          borderWidth: 1.2,
        },
      },
      { label: insideLabel },
      { label: insideLabel },
      { label: insideLabel },
      { label: outsideLabel },
    ];
  }

  return [
    {},
    { label: insideLabel },
    { label: insideLabel },
    { label: insideLabel },
    { label: outsideLabel },
  ];
}

function buildSankeyData(data) {
  const nodes = [];
  const links = [];
  const seen = new Set();
  const depthCounts = new Map();

  function walk(items, parentId = null, depth = 0, path = []) {
    items.forEach((item, index) => {
      const label = item.name || 'Unknown';
      const id = [...path, `${depth}:${index}:${label}`].join('/');

      if (!seen.has(id)) {
        seen.add(id);
        depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1);
        nodes.push({
          name: id,
          label,
          depth,
          value: Number(item.value || 0),
          itemStyle: { color: SANKEY_LEVELS[depth % SANKEY_LEVELS.length].color },
        });
      }

      if (parentId) {
        links.push({
          source: parentId,
          target: id,
          value: Number(item.value || 0),
        });
      }

      if (Array.isArray(item.children) && item.children.length > 0) {
        walk(item.children, id, depth + 1, [...path, `${depth}:${index}:${label}`]);
      }
    });
  }

  walk(data);
  const maxDepth = Math.max(...depthCounts.keys(), 0);
  const maxColumnCount = Math.max(...depthCounts.values(), 1);
  const height = Math.max(1180, maxColumnCount * SANKEY_LABEL_ROW_HEIGHT + SANKEY_VERTICAL_PADDING);
  const width = Math.min(3600, Math.max(2200, (maxDepth + 1) * 520));
  const nodeGap = Math.max(7, Math.min(14, Math.floor(height / (maxColumnCount + 28))));

  return { nodes, links, maxDepth, maxColumnCount, height, width, nodeGap };
}

function isSankeyProjection(payload) {
  return payload
    && Array.isArray(payload.nodes)
    && Array.isArray(payload.links);
}

function normalizeSankeyProjection(payload) {
  const layout = payload?.layout || {};
  return {
    nodes: payload.nodes || [],
    links: payload.links || [],
    maxDepth: Number(layout.maxDepth || 0),
    maxColumnCount: Number(layout.maxColumnCount || 1),
    height: Number(layout.height || 1180),
    width: Number(layout.width || 2200),
    nodeGap: Number(layout.nodeGap || 10),
  };
}

function buildRadialTree(data) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return {
    name: '',
    value: total,
    children: data,
  };
}

function buildTreemapData(data) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;

  function getTreemapBoundary(depth, ratio) {
    if (ratio < 0.0008) {
      return { borderWidth: 0.1, borderColor: 'rgba(255,255,255,.14)', gapWidth: 0.08 };
    }
    if (ratio < 0.002) {
      return { borderWidth: 0.18, borderColor: 'rgba(255,255,255,.18)', gapWidth: 0.16 };
    }
    if (ratio < 0.006) {
      return { borderWidth: 0.3, borderColor: 'rgba(255,255,255,.24)', gapWidth: 0.28 };
    }
    if (depth >= 3) {
      return { borderWidth: 0.45, borderColor: 'rgba(255,255,255,.34)', gapWidth: 0.45 };
    }
    if (depth === 2) {
      return { borderWidth: 0.7, borderColor: 'rgba(255,255,255,.44)', gapWidth: 0.8 };
    }
    if (depth === 1) {
      return { borderWidth: 1, borderColor: 'rgba(255,255,255,.56)', gapWidth: 1.4 };
    }
    return { borderWidth: 1.6, borderColor: 'rgba(255,255,255,.68)', gapWidth: 2.4 };
  }

  function decorate(item, depth, color, siblingIndex = 0) {
    const value = Number(item.value || 0);
    const globalRatio = value / total;
    const children = Array.isArray(item.children) ? item.children : [];
    const childShadeStep = children.length > 1 ? 0.14 / Math.max(children.length - 1, 1) : 0;
    const fill = depth === 0
      ? color
      : mixColor(color, '#ffffff', Math.min(0.08 + depth * 0.045 + siblingIndex * childShadeStep, 0.3));

    return {
      ...item,
      value,
      globalRatio,
      itemStyle: {
        ...(item.itemStyle || {}),
        color: fill,
        ...getTreemapBoundary(depth, globalRatio),
        borderRadius: globalRatio >= 0.006 ? 3 : 1,
      },
      children: children.length > 0
        ? children.map((child, index) => decorate(child, depth + 1, color, index))
        : undefined,
    };
  }

  return data.map((item, index) => decorate(item, 0, SUNBURST_COLORS[index % SUNBURST_COLORS.length], index));
}

function estimateTreemapLabelWidth(text, fontSize = 12) {
  const longestLine = String(text || '')
    .split('\n')
    .reduce((longest, line) => (line.length > longest.length ? line : longest), '');

  return Array.from(longestLine).reduce((width, character) => (
    width + (character.charCodeAt(0) > 255 ? fontSize : fontSize * 0.57)
  ), 0);
}

function truncateTreemapLabel(text, maxWidth, fontSize) {
  const value = String(text || '');
  if (!value || maxWidth <= 0) return '';
  if (estimateTreemapLabelWidth(value, fontSize) <= maxWidth) return value;

  const ellipsis = '...';
  const ellipsisWidth = estimateTreemapLabelWidth(ellipsis, fontSize);
  const characters = Array.from(value);
  let result = '';
  let resultWidth = 0;

  for (const character of characters) {
    const characterWidth = estimateTreemapLabelWidth(character, fontSize);
    if (resultWidth + characterWidth + ellipsisWidth > maxWidth) break;
    result += character;
    resultWidth += characterWidth;
  }

  return result ? `${result}${ellipsis}` : '';
}

function buildTreemapLabelGraphics(chart) {
  const seriesModel = chart?.getModel?.()?.getSeriesByIndex?.(0);
  const viewRoot = seriesModel?.getViewRoot?.();
  const layoutInfo = seriesModel?.layoutInfo;
  if (!viewRoot || !layoutInfo) return { elements: [], signature: '' };

  const elements = [];
  const visit = (node, parentX, parentY) => {
    const layout = node?.getLayout?.();
    if (!layout || layout.invisible || layout.isInView === false) return;

    const x = parentX + Number(layout.x || 0);
    const y = parentY + Number(layout.y || 0);
    const children = Array.isArray(node.viewChildren) ? node.viewChildren : [];
    if (children.length > 0) {
      children.forEach(child => visit(child, x, y));
      return;
    }
    if (node === viewRoot) return;

    const borderWidth = Number(layout.borderWidth || 0);
    const width = Math.max(0, Number(layout.width || 0) - borderWidth * 2);
    const height = Math.max(0, Number(layout.height || 0) - borderWidth * 2);
    const name = String(node.name || node.getModel?.()?.get?.('name') || '');
    if (!name) return;

    const isNarrowPortrait = width < 64
      && height >= 40
      && height > width * 1.35;
    const fontSize = isNarrowPortrait
      ? (width < 18 ? 9 : width < 24 ? 10 : 11)
      : (width < 54 || height < 28 ? 10 : 11);
    const availableLength = isNarrowPortrait ? height - 10 : width - 10;
    const minimumThickness = fontSize + 5;
    if (availableLength < estimateTreemapLabelWidth('A...', fontSize)) return;
    if ((isNarrowPortrait ? width : height) < minimumThickness) return;

    const label = truncateTreemapLabel(name, availableLength, fontSize);
    if (!label) return;

    const ratio = Number(node.getModel?.()?.get?.('globalRatio') || 0);
    const showPercent = !isNarrowPortrait
      && ratio >= 0.024
      && width >= 96
      && height >= 40;
    const text = showPercent ? `${label}\n${formatPercent(ratio)}` : label;

    elements.push({
      id: `treemap-label-${node.getRawIndex?.() ?? node.dataIndex}`,
      type: 'text',
      x: x + Number(layout.width || 0) / 2,
      y: y + Number(layout.height || 0) / 2,
      rotation: isNarrowPortrait ? -Math.PI / 2 : 0,
      silent: true,
      z: 100,
      style: {
        text,
        fill: 'rgba(15,23,42,0.86)',
        font: `500 ${fontSize}px sans-serif`,
        lineHeight: fontSize + 4,
        align: 'center',
        verticalAlign: 'middle',
      },
    });
  };

  visit(viewRoot, Number(layoutInfo.x || 0), Number(layoutInfo.y || 0));
  const signature = elements.map(element => (
    `${element.id}:${Math.round(element.x)}:${Math.round(element.y)}:${element.rotation}:${element.style.text}`
  )).join('|');
  return { elements, signature };
}

function withRootColor(item, color) {
  return {
    ...item,
    itemStyle: {
      ...(item.itemStyle || {}),
      color,
    },
  };
}

function withBranchColor(item, color) {
  return {
    ...withRootColor(item, color),
    children: Array.isArray(item.children)
      ? item.children.map(child => withBranchColor(child, color))
      : undefined,
  };
}

function buildSunburstModel(data) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
  const sorted = [...data].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  const phylumItems = sorted.map((item, index) => ({
    name: item.name,
    value: Number(item.value || 0),
    ratio: Number(item.value || 0) / total,
    color: SUNBURST_COLORS[index % SUNBURST_COLORS.length],
    mergedCount: Number(item.mergedCount || 0),
    source: item,
  }));

  const visible = [];
  const merged = [];
  phylumItems.forEach(item => {
    if (item.ratio < PHYLUM_MERGE_RATIO) {
      merged.push(item);
    } else {
      visible.push(withBranchColor(item.source, item.color));
    }
  });

  if (merged.length === 0) {
    return {
      chartData: visible,
      legendItems: phylumItems.map(({ source, ...item }) => ({ ...item, depth: 0 })),
      mergedPhyla: [],
    };
  }

  const mergedValue = merged.reduce((sum, item) => sum + item.value, 0);
  const mergedNames = merged.map(item => item.name).join(', ');
  const mergedCount = merged.reduce((sum, item) => sum + Number(item.mergedCount || 0), 0) + merged.length;
  const otherBase = {
    id: SUNBURST_MERGED_PHYLA_ID,
    name: SUNBURST_MERGED_PHYLA,
    rank: 'phylum',
    value: mergedValue,
    ratio: mergedValue / total,
    mergedCount,
    mergedPhylaNames: mergedNames,
    isMergedPhyla: true,
    itemStyle: { color: SUNBURST_MERGED_PHYLA_COLOR },
  };
  const otherNode = {
    ...otherBase,
  };
  const detailData = merged.map(item => ({
    ...withBranchColor(item.source, item.color),
    ratio: item.ratio,
  }));
  const detailRoot = {
    ...otherBase,
    children: detailData,
  };
  const legendItems = [
    ...phylumItems
      .filter(item => item.ratio >= PHYLUM_MERGE_RATIO)
      .map(({ source, ...item }) => ({ ...item, depth: 0 })),
    {
      name: SUNBURST_MERGED_PHYLA,
      value: mergedValue,
      ratio: mergedValue / total,
      color: SUNBURST_MERGED_PHYLA_COLOR,
      depth: 0,
      children: merged.map(({ source, ...item }) => ({ ...item, depth: 1 })),
    },
  ];

  return {
    chartData: [...visible, otherNode],
    detailData: [detailRoot],
    legendItems,
    mergedPhyla: merged.map(item => item.name),
  };
}

function collectLeaves(items, depth = 1, leaves = []) {
  items.forEach(item => {
    const children = Array.isArray(item.children) ? item.children : [];
    if (children.length === 0) {
      leaves.push({ name: item.name || '', depth });
      return;
    }
    collectLeaves(children, depth + 1, leaves);
  });
  return leaves;
}

function getSunburstLayout(model, maxSize = null) {
  const leaves = collectLeaves(model?.chartData || []);
  const leafCount = Math.max(leaves.length, 1);
  const maxLabelLength = leaves.reduce((max, leaf) => Math.max(max, String(leaf.name).length), 0);
  const labelMargin = Math.min(200, Math.max(112, Math.ceil(maxLabelLength * 5.5 + 24)));
  const naturalOuterRadius = Math.min(580, Math.max(380, Math.ceil((leafCount * 6.8) / (Math.PI * 2))));
  const minimumOuterRadius = Math.min(naturalOuterRadius, 280);
  const minimumReadableSize = Math.ceil((minimumOuterRadius + labelMargin) * 2);
  const naturalSize = Math.ceil((naturalOuterRadius + labelMargin) * 2);
  const fittedSize = maxSize ? Math.min(naturalSize, maxSize) : naturalSize;
  const size = Math.max(minimumReadableSize, fittedSize);
  const outerRadius = Math.min(naturalOuterRadius, Math.floor(size / 2 - labelMargin));

  return {
    size,
    labelMargin,
    innerRadius: Math.round(outerRadius * 0.12),
    outerRadius,
  };
}

function getRadialTreeLayout(model, maxSize = null) {
  const leaves = collectLeaves(model?.chartData || []);
  const leafCount = Math.max(leaves.length, 1);
  const maxLabelLength = leaves.reduce((max, leaf) => Math.max(max, String(leaf.name).length), 0);
  const labelMargin = Math.min(230, Math.max(120, Math.ceil(maxLabelLength * 7 + 24)));
  const naturalCoreRadius = Math.min(420, Math.max(300, Math.ceil((leafCount * 8) / (Math.PI * 2))));
  const minimumCoreRadius = Math.min(naturalCoreRadius, 300);
  const minimumReadableSize = Math.ceil((minimumCoreRadius + labelMargin) * 2);
  const naturalSize = Math.min(1120, Math.ceil((naturalCoreRadius + labelMargin) * 2));
  const fittedSize = maxSize ? Math.min(naturalSize, maxSize) : naturalSize;

  return {
    size: Math.max(minimumReadableSize, fittedSize),
    labelMargin,
  };
}

function renderPhylumLegendRow(item) {
  return (
    <div className={`taxonomy-phylum-row taxonomy-phylum-row--depth-${item.depth || 0}`} key={`${item.depth || 0}-${item.name}`}>
      <span className="taxonomy-phylum-row__swatch" style={{ backgroundColor: item.color }} />
      <span className="taxonomy-phylum-row__name">{item.name}</span>
      <span className="taxonomy-phylum-row__bar">
        <span style={{ width: `${Math.max(item.ratio * 100, item.ratio > 0 ? 1.5 : 0)}%`, backgroundColor: item.color }} />
      </span>
      <span className="taxonomy-phylum-row__value">{formatPercent(item.ratio)}</span>
    </div>
  );
}

function TaxonomyChart({ data, mode = 'sunburst' }) {
  const chartRef = useRef(null);
  const viewportRef = useRef(null);
  const viewportPolicy = getTaxonomyViewportPolicy(mode);
  const viewportSize = useAvailableViewport(viewportRef, {
    minHeight: viewportPolicy.minHeight,
    maxHeight: viewportPolicy.maxHeight,
  });
  const detailDrillAppliedRef = useRef(false);
  const treemapInstanceRef = useRef(null);
  const sankeyInstanceRef = useRef(null);
  const treemapLabelSignatureRef = useRef('');
  const treemapLabelFrameRef = useRef(null);
  const [sunburstView, setSunburstView] = useState('overview');
  const treeData = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.tree)) return data.tree;
    return [];
  }, [data]);
  const sunburstModel = useMemo(
    () => (treeData.length > 0 ? buildSunburstModel(treeData) : null),
    [treeData]
  );
  const sunburstChartData = useMemo(
    () => (sunburstView === 'others'
      ? sunburstModel?.detailData || []
      : sunburstModel?.chartData || []),
    [sunburstModel, sunburstView]
  );
  const sunburstLayout = useMemo(
    () => {
      const wideLayout = viewportSize.width > 1100;
      const legendSpace = wideLayout ? 376 : 0;
      const availableWidth = Math.max(720, viewportSize.width - legendSpace - 24);
      const availableSize = Math.min(availableWidth, viewportSize.height || 1120);
      return getSunburstLayout({ chartData: sunburstChartData }, availableSize);
    },
    [sunburstChartData, viewportSize.height, viewportSize.width]
  );

  const radialTreeLayout = useMemo(() => {
    const available = Math.min(viewportSize.width || 1120, viewportSize.height || 1120);
    return getRadialTreeLayout({ chartData: treeData }, Math.max(0, available - 24));
  }, [treeData, viewportSize.height, viewportSize.width]);
  const treemapData = useMemo(
    () => (mode === 'treemap' && treeData.length > 0 ? buildTreemapData(treeData) : []),
    [mode, treeData]
  );
  const sankeyModel = useMemo(
    () => {
      if (mode !== 'sankey') return null;
      if (isSankeyProjection(data)) return normalizeSankeyProjection(data);
      return treeData.length > 0 ? buildSankeyData(treeData) : null;
    },
    [data, mode, treeData]
  );
  const sankeyCanvasConstraints = useMemo(
    () => resolveSankeyCanvasConstraints({
      naturalWidth: sankeyModel?.width,
      maxDepth: sankeyModel?.maxDepth,
    }),
    [sankeyModel]
  );
  const sankeyCanvasHeight = useMemo(
    () => resolveSankeyCanvasHeight({
      naturalHeight: sankeyModel?.height,
      viewportHeight: viewportSize.height,
    }),
    [sankeyModel?.height, viewportSize.height]
  );
  const treemapCanvasSize = useMemo(
    () => resolveTreemapCanvasSize(viewportSize),
    [viewportSize]
  );

  useEffect(() => {
    const chart = mode === 'treemap'
      ? treemapInstanceRef.current
      : (mode === 'sankey' ? sankeyInstanceRef.current : null);
    if (!chart) return undefined;

    const frameId = window.requestAnimationFrame(() => resizeChartToContainer(chart));
    return () => window.cancelAnimationFrame(frameId);
  }, [
    mode,
    sankeyCanvasHeight,
    sankeyCanvasConstraints.maxWidth,
    sankeyCanvasConstraints.minWidth,
    treemapCanvasSize.height,
    treemapCanvasSize.width,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    detailDrillAppliedRef.current = false;
    setSunburstView('overview');
  }, [data, mode]);

  const option = useMemo(() => {
    if (mode === 'sankey') {
      if (!sankeyModel || sankeyModel.nodes.length === 0) return null;
    } else if (treeData.length === 0) {
      return null;
    }

    const baseOption = {
      backgroundColor: 'transparent',
      color: SUNBURST_COLORS,
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: tooltipHtml,
        backgroundColor: 'rgba(15,23,42,0.96)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        extraCssText: 'border-radius:10px; padding:10px 12px; pointer-events:none;',
      },
    };

    if (mode === 'treemap') {
      return {
        ...baseOption,
        series: [
          {
            type: 'treemap',
            id: 'taxonomy-composition',
            roam: false,
            nodeClick: undefined,
            top: 12,
            left: 18,
            right: 18,
            bottom: 18,
            data: treemapData,
            breadcrumb: { show: false },
            squareRatio: 1.15,
            colorMappingBy: 'id',
            label: {
              show: false,
            },
            itemStyle: {
              borderWidth: 0.45,
              borderColor: 'rgba(255,255,255,.32)',
              gapWidth: 0.5,
              borderRadius: 3,
            },
            emphasis: {
              label: { show: false },
              itemStyle: {
                borderColor: 'rgba(15,23,42,.3)',
                shadowBlur: 8,
                shadowColor: 'rgba(15,23,42,.14)',
              },
            },
            blur: {
              itemStyle: { opacity: 1 },
              label: { opacity: 1 },
              upperLabel: { opacity: 1 },
            },
            upperLabel: {
              show: false,
              height: 20,
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: 'transparent',
              overflow: 'truncate',
            },
            levels: [
              {
                itemStyle: {
                  borderWidth: 1.6,
                  borderColor: 'rgba(255,255,255,.68)',
                  gapWidth: 2.4,
                  borderRadius: 4,
                },
                upperLabel: {
                  show: true,
                  height: 24,
                  color: '#0f172a',
                  fontSize: 12,
                  fontWeight: 800,
                  backgroundColor: 'rgba(248,250,252,.42)',
                },
              },
              {
                itemStyle: {
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,.56)',
                  gapWidth: 1.4,
                },
                upperLabel: {
                  show: true,
                  height: 20,
                  color: '#1e293b',
                  fontSize: 11,
                  fontWeight: 700,
                  backgroundColor: 'rgba(248,250,252,.22)',
                },
              },
              {
                itemStyle: {
                  borderWidth: 0.7,
                  borderColor: 'rgba(255,255,255,.44)',
                  gapWidth: 0.8,
                },
                upperLabel: { show: false },
              },
              {
                itemStyle: {
                  borderWidth: 0.3,
                  borderColor: 'rgba(255,255,255,.24)',
                  gapWidth: 0.28,
                },
                upperLabel: { show: false },
              },
            ],
          },
        ],
      };
    }

    if (mode === 'sankey') {
      const sankeyData = sankeyModel;
      const sankeyPolicy = getTaxonomyViewportPolicy('sankey');
      return {
        ...baseOption,
        animation: false,
        tooltip: {
          ...baseOption.tooltip,
          triggerOn: 'mousemove',
          formatter(params) {
            if (params.dataType === 'edge') {
              return `丰度流向: ${formatValue(params.value)}`;
            }
            const mergedCount = Number(params.data?.mergedCount || 0);
            return [
              `<b>${params.data?.label || params.name}</b>`,
              `丰度: ${formatValue(params.data?.value)}`,
              mergedCount > 0 ? `合并小分类: ${mergedCount}` : null,
            ].filter(Boolean).join('<br/>');
          },
        },
        series: [
          {
            type: 'sankey',
            data: sankeyData.nodes,
            links: sankeyData.links,
            left: sankeyPolicy.leftInset,
            right: sankeyPolicy.rightInset,
            top: sankeyPolicy.verticalInset,
            bottom: sankeyPolicy.verticalInset,
            nodeWidth: 16,
            nodeGap: sankeyData.nodeGap,
            layoutIterations: 16,
            draggable: false,
            emphasis: { focus: 'adjacency' },
            label: {
              color: '#334155',
              fontSize: 11,
              lineHeight: 14,
              width: 180,
              overflow: 'truncate',
              formatter(params) {
                return params.data?.label || params.name;
              },
            },
            levels: SANKEY_LEVELS.map((level, depth) => ({
              depth,
              itemStyle: { color: level.color },
              lineStyle: { color: 'source', opacity: 0.42 },
            })),
            lineStyle: {
              color: 'source',
              curveness: 0.5,
              opacity: 0.36,
            },
          },
        ],
      };
    }

    if (mode === 'radialtree') {
      const radialPadding = radialTreeLayout.labelMargin;
      return {
        ...baseOption,
        tooltip: {
          ...baseOption.tooltip,
          triggerOn: 'mousemove',
        },
        series: [
          {
            type: 'tree',
            data: [buildRadialTree(treeData)],
            top: radialPadding,
            right: radialPadding,
            bottom: radialPadding,
            left: radialPadding,
            layout: 'radial',
            symbol: 'emptyCircle',
            symbolSize: 8,
            initialTreeDepth: 3,
            animationDurationUpdate: 750,
            emphasis: { focus: 'descendant' },
            lineStyle: {
              color: '#cbd5e1',
              width: 1.2,
              curveness: 0.5,
            },
            itemStyle: {
              color: '#9dbbe0',
              borderColor: '#7fa6d4',
              borderWidth: 2,
            },
            label: {
              color: '#111827',
              distance: 8,
              fontSize: 12,
            },
            leaves: {
              label: {
                color: '#111827',
                distance: 10,
                fontSize: 12,
              },
            },
          },
        ],
      };
    }

    return {
      ...baseOption,
      series: [
        {
          type: 'sunburst',
          id: 'taxonomy-composition',
          data: sunburstChartData.length > 0 ? sunburstChartData : treeData,
          center: ['50%', '50%'],
          radius: [sunburstLayout.innerRadius, sunburstLayout.outerRadius],
          sort: undefined,
          nodeClick: 'rootToNode',
          emphasis: { focus: 'ancestor' },
          itemStyle: {
            borderRadius: 5,
            borderColor: '#fff',
            borderWidth: 1,
          },
          label: {
            show: true,
            color: '#1e293b',
            fontSize: 11,
            overflow: 'truncate',
            formatter(params) {
              return taxonomySunburstLabel(params, sunburstView);
            },
          },
          levels: buildSunburstLevels(sunburstView),
          labelLayout: { hideOverlap: true },
        },
      ],
    };
  }, [mode, radialTreeLayout.labelMargin, sankeyModel, sunburstChartData, sunburstLayout, sunburstView, treeData, treemapData]);

  if (!option) {
    return <div className="placeholder"><p>暂无分类层级数据</p></div>;
  }

  const className = `chart-plain chart-plain--taxonomy chart-plain--${mode}`;
  const handleSunburstClick = params => {
    if (sunburstView === 'overview' && params?.data?.isMergedPhyla) {
      detailDrillAppliedRef.current = false;
      setSunburstView('others');
    }
  };
  const handleSunburstRootToNode = (params, chart) => {
    if (sunburstView !== 'others' || params?.direction !== 'rollUp') return;

    window.requestAnimationFrame(() => {
      const viewRoot = chart?.getModel?.()?.getSeriesByIndex?.(0)?.getViewRoot?.();
      if (viewRoot?.depth === 0) {
        detailDrillAppliedRef.current = false;
        setSunburstView('overview');
      }
    });
  };
  const handleSunburstReady = chart => {
    if (mode !== 'sunburst' || sunburstView !== 'others' || detailDrillAppliedRef.current) return;
    detailDrillAppliedRef.current = true;
    window.requestAnimationFrame(() => {
      chart.dispatchAction({
        type: 'sunburstRootToNode',
        seriesId: 'taxonomy-composition',
        targetNodeId: SUNBURST_MERGED_PHYLA_ID,
      });
    });
  };
  const scheduleTreemapLabels = chart => {
    if (mode !== 'treemap' || !chart || treemapLabelFrameRef.current != null) return;
    treemapLabelFrameRef.current = window.requestAnimationFrame(() => {
      treemapLabelFrameRef.current = null;
      const { elements, signature } = buildTreemapLabelGraphics(chart);
      if (signature === treemapLabelSignatureRef.current) return;
      treemapLabelSignatureRef.current = signature;
      chart.setOption(
        { graphic: elements },
        { replaceMerge: ['graphic'], lazyUpdate: true },
      );
    });
  };
  const handleTreemapReady = chart => {
    treemapInstanceRef.current = chart;
    treemapLabelSignatureRef.current = '';
    window.requestAnimationFrame(() => {
      resizeChartToContainer(chart);
      scheduleTreemapLabels(chart);
    });
  };
  const handleTreemapFinished = () => {
    scheduleTreemapLabels(treemapInstanceRef.current);
  };

  return (
    <TaxonomyViewport ref={viewportRef} mode={mode} height={viewportSize.height}>
      <div className={className}>
      {mode === 'sunburst' ? (
        <SunburstRenderer
          chartRef={chartRef}
          option={option}
          size={sunburstLayout.size}
          view={sunburstView}
          onReady={handleSunburstReady}
          onClick={handleSunburstClick}
          onRootToNode={handleSunburstRootToNode}
          legendContent={(sunburstModel?.legendItems || []).flatMap(item => [
            renderPhylumLegendRow(item),
            ...(item.children || []).map(child => renderPhylumLegendRow(child)),
          ])}
          hasMergedPhyla={sunburstModel?.mergedPhyla?.length > 0}
        />
      ) : mode === 'radialtree' ? (
        <RadialTreeRenderer option={option} size={radialTreeLayout.size} />
      ) : mode === 'sankey' ? (
        <SankeyRenderer
          option={option}
          opts={SANKEY_ECHARTS_OPTS}
          constraints={sankeyCanvasConstraints}
          height={sankeyCanvasHeight}
          onReady={chart => {
            sankeyInstanceRef.current = chart;
            window.requestAnimationFrame(() => resizeChartToContainer(chart));
          }}
        />
      ) : mode === 'treemap' ? (
        <TreemapRenderer
          option={option}
          size={treemapCanvasSize}
          onReady={handleTreemapReady}
          onFinished={handleTreemapFinished}
        />
      ) : (
        <RadialTreeRenderer option={option} size={760} />
      )}
      </div>
    </TaxonomyViewport>
  );
}

export default TaxonomyChart;
