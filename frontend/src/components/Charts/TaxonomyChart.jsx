import { useEffect, useMemo, useRef, useState } from 'react';
import TaxonomyViewport from './TaxonomyViewport';
import TaxonomyPageOverview, { navigatePageChart } from './taxonomy/TaxonomyPageOverview';
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
import { useColorVision } from '../../context/ColorVisionContext';
import { escapeTooltipText } from '../../utils/tooltipHtml';
import { preciseTaxonomy, taxonomyIndex, taxonomySemantics, taxonomyTooltip, taxonomyValueLines, withoutTaxonomyLabels } from './taxonomyExploration';
import './taxonomy-exploration.css';

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
const PHYLUM_MERGE_RATIO = 0.01;
const SUNBURST_MERGED_PHYLA = 'Others';
const SUNBURST_MERGED_PHYLA_COLOR = '#94a3b8';
const SUNBURST_MERGED_PHYLA_ID = 'taxonomy-merged-others';
const TAXONOMY_STATIC_DECALS = [
  {
    symbol: 'rect',
    dashArrayX: [1, 0],
    dashArrayY: [4, 3],
    rotation: -Math.PI / 4,
    color: 'rgba(15, 23, 42, 0.28)',
  },
  {
    symbol: 'circle',
    symbolSize: 1.5,
    dashArrayX: [[1, 3]],
    dashArrayY: [2, 4],
    color: 'rgba(15, 23, 42, 0.3)',
  },
  {
    symbol: 'rect',
    dashArrayX: [1, 0],
    dashArrayY: [3, 4],
    rotation: Math.PI / 4,
    color: 'rgba(15, 23, 42, 0.26)',
  },
];

function resizeChartToContainer(chart) {
  if (chart?.isDisposed?.()) return;
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

function formatPercent(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return null;
  const percent = ratio * 100;
  return `${percent !== 0 && Math.abs(percent) < 0.001 ? percent.toExponential(3) : Number(percent.toPrecision(5))}%`;
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
    show: true,
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
      const name = params.name || '';
      return name.length > 22 ? `${name.slice(0, 20)}…` : name;
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
          ...item,
          name: id,
          label,
          fullPath: item.fullPath || [...path, label].join(' > '),
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
    sourceMembers: merged.map(item => item.source),
    aggregationKind: 'sunburst_phylum_display',
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
  const labelMargin = Math.min(140, Math.max(100, Math.ceil(maxLabelLength * 3 + 24)));
  const naturalOuterRadius = Math.min(580, Math.max(380, Math.ceil((leafCount * 6.8) / (Math.PI * 2))));
  const minimumOuterRadius = Math.min(naturalOuterRadius, 180);
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
      <span className="taxonomy-phylum-row__name" title={item.name}>{item.name}</span>
      <span className="taxonomy-phylum-row__bar">
        <span style={{ width: `${Math.max(item.ratio * 100, item.ratio > 0 ? 1.5 : 0)}%`, backgroundColor: item.color }} />
      </span>
      <span className="taxonomy-phylum-row__value">{formatPercent(item.ratio)}</span>
    </div>
  );
}

function TaxonomyChart({ data, mode = 'sunburst', projection = null }) {
  const { colorBlindFriendly } = useColorVision();
  const chartRef = useRef(null);
  const viewportRef = useRef(null);
  const viewportPolicy = getTaxonomyViewportPolicy(mode);
  const viewportSize = useAvailableViewport(viewportRef, {
    minHeight: viewportPolicy.minHeight,
    maxHeight: viewportPolicy.maxHeight,
  });
  const sankeyOpts = useMemo(() => ({ renderer: 'canvas',
    devicePixelRatio: resolveSankeyDevicePixelRatio(viewportSize.devicePixelRatio),
  }), [viewportSize.devicePixelRatio]);
  const detailDrillAppliedRef = useRef(false);
  const treemapInstanceRef = useRef(null);
  const sankeyInstanceRef = useRef(null);
  const [sunburstView, setSunburstView] = useState('overview');
  const [focusId, setFocusId] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [search, setSearch] = useState('');
  const [manualHeight, setManualHeight] = useState(0);
  const [spacing, setSpacing] = useState(1);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [legendVisible, setLegendVisible] = useState(true);
  const [overviewVisible, setOverviewVisible] = useState(true);
  const [sankeyChart, setSankeyChart] = useState(null);
  const [status, setStatus] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const hostRef = useRef(null);
  const rawTree = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.tree)) return data.tree;
    return [];
  }, [data]);
  const indexed = useMemo(() => taxonomyIndex(rawTree), [rawTree]);
  const focused = indexed.byId.get(focusId);
  const treeData = useMemo(() => focused ? [focused] : indexed.roots, [focused, indexed.roots]);
  const semantics = useMemo(() => taxonomySemantics(projection, indexed.total || (data?.nodes || []).filter(node => node.depth === 0).reduce((sum, node) => sum + Number(node.value || 0), 0)), [projection, indexed.total, data?.nodes]);
  const availableNodes = mode === 'sankey' ? (data?.nodes || []).map(node => ({ ...node, id: node.name })) : indexed.entries;
  const matches = search.trim() ? availableNodes.filter(node => `${node.fullPath || ''} ${node.label || node.name}`.toLowerCase().includes(search.trim().toLowerCase())) : [];
  const height = manualHeight || viewportSize.height;
  const inspect = node => { setSelectedNode(node); setMemberPage(1); };
  const focusNode = node => {
    inspect(node);
    if (mode === 'sankey') {
      const chart = sankeyInstanceRef.current;
      chart?.dispatchAction?.({ type: 'downplay', seriesIndex: 0 });
      chart?.dispatchAction?.({ type: 'highlight', seriesIndex: 0, name: node.name });
      const model = chart?.getModel?.()?.getSeriesByIndex?.(0)?.getData?.();
      const index = model?.indexOfName?.(node.name);
      const layout = index >= 0 ? model?.getItemLayout?.(index) : null;
      const scroll = chart?.getDom?.()?.closest('.taxonomy-sankey-scroll');
      if (layout && scroll) navigatePageChart(chart.getDom(), Math.max(0, layout.x + 112 - scroll.clientWidth / 2), Math.max(0, layout.y + 40 - window.innerHeight / 3));
      setStatus('已高亮桑基节点并定位页面；节点详情位于完整画布下方。'); return;
    }
    if (indexed.byId.has(node.id)) { setFocusId(node.id); setSunburstView('overview'); setStatus(`已聚焦：${node.fullPath}`); }
    else setStatus('正在查看合并内部成员详情，图中合并规则保持不变。');
  };
  const restore = () => {
    setFocusId(''); setSelectedNode(null); setSunburstView('overview'); setStatus('已恢复完整分类范围');
    const chart = mode === 'treemap' ? treemapInstanceRef.current : mode === 'sankey' ? sankeyInstanceRef.current : chartRef.current?.getEchartsInstance?.();
    chart?.dispatchAction?.({ type: 'restore' });
    if (mode === 'sankey') {
      setSpacing(1); setManualHeight(0);
      if (chart?.getDom?.()) navigatePageChart(chart.getDom(), 0, 0);
    }
  };
  const zoomNative = factor => {
    const chart = mode === 'treemap' ? treemapInstanceRef.current : chartRef.current?.getEchartsInstance?.();
    if (!chart || chart.isDisposed?.()) return;
    const model = chart.getModel().getSeriesByIndex(0);
    if (mode === 'treemap') {
      const rect = model.getData().tree.root.getLayout();
      const layout = model.layoutInfo;
      const zoom = Math.max(.5, Math.min(8, rect.width / layout.width * factor));
      const ratio = zoom / (rect.width / layout.width);
      const cx = layout.width / 2, cy = layout.height / 2;
      chart.dispatchAction({ type: 'treemapRender', seriesIndex: 0, rootRect: {
        x: cx + (rect.x - cx) * ratio, y: cy + (rect.y - cy) * ratio,
        width: rect.width * ratio, height: rect.height * ratio,
      } });
    } else chart.dispatchAction({ type: 'treeRoam', seriesIndex: 0, zoom: factor,
      originX: chart.getWidth() / 2, originY: chart.getHeight() / 2 });
  };
  const exportNote = `当前导出范围：${focused?.fullPath || (sunburstView === 'others' ? 'Others 组成明细' : '完整分类范围')}；${semantics.sampleCount || '未知'} 个样本；${semantics.unit}`;
  const sunburstModel = useMemo(
    () => (indexed.roots.length > 0 ? buildSunburstModel(indexed.roots) : null),
    [indexed.roots]
  );
  const sunburstChartData = useMemo(
    () => (focused ? [focused] : sunburstView === 'others'
      ? sunburstModel?.detailData || []
      : sunburstModel?.chartData || []),
    [focused, sunburstModel, sunburstView]
  );
  const sunburstLayout = useMemo(
    () => {
      const availableWidth = Math.max(560, viewportSize.width - 24);
      const availableSize = Math.min(availableWidth, height || 1120);
      return getSunburstLayout({ chartData: sunburstChartData }, availableSize);
    },
    [sunburstChartData, height, viewportSize.width]
  );

  const radialTreeLayout = useMemo(() => {
    const available = Math.min(viewportSize.width || 1120, height || 1120);
    return getRadialTreeLayout({ chartData: treeData }, Math.max(0, available - 24));
  }, [treeData, height, viewportSize.width]);
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
      containerWidth: Math.max(0, viewportSize.width - 24),
      maxDepth: sankeyModel?.maxDepth,
      spacing,
    }),
    [sankeyModel, spacing, viewportSize.width]
  );
  const sankeyCanvasHeight = useMemo(
    () => resolveSankeyCanvasHeight({
      naturalHeight: sankeyModel?.height,
      viewportHeight: height,
      canvasWidth: sankeyCanvasConstraints.width,
      spacing,
    }),
    [sankeyModel?.height, height, sankeyCanvasConstraints.width, spacing]
  );
  const treemapCanvasSize = useMemo(
    () => resolveTreemapCanvasSize({ width: viewportSize.width, height }),
    [viewportSize.width, height]
  );

  useEffect(() => {
    const chart = mode === 'treemap'
      ? treemapInstanceRef.current
      : (mode === 'sankey' ? sankeyInstanceRef.current : chartRef.current?.getEchartsInstance?.());
    if (!chart) return undefined;

    const frameId = window.requestAnimationFrame(() => resizeChartToContainer(chart));
    return () => window.cancelAnimationFrame(frameId);
  }, [
    mode,
    sankeyCanvasHeight,
    sankeyCanvasConstraints.maxWidth,
    sankeyCanvasConstraints.minWidth,
    sankeyCanvasConstraints.width,
    treemapCanvasSize.height,
    treemapCanvasSize.width,
    sunburstLayout.size,
    radialTreeLayout.size,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    detailDrillAppliedRef.current = false;
    setSunburstView('overview');
    setFocusId(''); setSelectedNode(null); setSearch(''); setMemberPage(1);
  }, [data, mode]);

  const option = useMemo(() => {
    const tooltip = params => taxonomyTooltip(params, semantics, indexed.byId);
    if (mode === 'sankey') {
      if (!sankeyModel || sankeyModel.nodes.length === 0) return null;
    } else if (treeData.length === 0) {
      return null;
    }

    const baseOption = {
      backgroundColor: 'transparent',
      animation: false,
      color: SUNBURST_COLORS,
      // ECharts moves emphasis rendering to a separate Canvas layer instead of
      // repainting the patterned base hierarchy on every pointer movement.
      hoverLayerThreshold: 1,
      aria: {
        enabled: true,
        // ECharts' tree-aware ARIA pass assigns one stable pattern to every
        // branch. A three-item palette avoids generating node-unique textures.
        decal: {
          show: colorBlindFriendly,
          decals: TAXONOMY_STATIC_DECALS,
        },
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        transitionDuration: 0,
        hideDelay: 0,
        formatter: tooltip,
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
            roam: true, scaleLimit: { min: .5, max: 8 },
            nodeClick: false,
            leafDepth: 3,
            top: 12,
            left: 18,
            right: 18,
            bottom: 18,
            data: treemapData,
            breadcrumb: { show: false },
            squareRatio: 1.15,
            colorMappingBy: 'id',
            label: { show: true, formatter: params => params.name, overflow: 'truncate', fontSize: 11 },
            labelLayout: { hideOverlap: true },
            itemStyle: {
              borderWidth: 0.45,
              borderColor: 'rgba(255,255,255,.32)',
              gapWidth: 0.5,
              borderRadius: 3,
            },
            emphasis: {
              label: { show: true },
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
              const nodes = new Map(sankeyModel.nodes.map(node => [node.name, node]));
              const source = nodes.get(params.data?.source), target = nodes.get(params.data?.target);
              return [escapeTooltipText(`${source?.label || '父级'} → ${target?.label || '子级'}`),
                ...taxonomyValueLines({ value: params.value }, semantics, source?.value).map(escapeTooltipText),
                '分类归属与丰度汇总，不表示迁移或物质流动'].join('<br/>');
            }
            return tooltip(params);
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
            labelLayout: { hideOverlap: true },
            label: {
              show: true,
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
            roam: true, scaleLimit: { min: .5, max: 8 }, expandAndCollapse: true,
            symbol: 'emptyCircle',
            symbolSize: 8,
            initialTreeDepth: 3,
            labelLayout: { hideOverlap: true },
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
              show: true,
              color: '#111827',
              distance: 8,
              fontSize: 12,
            },
            leaves: {
              label: {
                show: true,
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
          nodeClick: false,
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
  }, [colorBlindFriendly, mode, radialTreeLayout.labelMargin, sankeyModel, sunburstChartData, sunburstLayout, sunburstView, treeData, treemapData, semantics, indexed.byId]);

  const displayOption = useMemo(() => labelsVisible ? option : withoutTaxonomyLabels(option), [labelsVisible, option]);

  if (!option) {
    return <div className="placeholder"><p>暂无分类层级数据</p></div>;
  }

  const className = `chart-plain chart-plain--taxonomy chart-plain--${mode}`;
  const handleSunburstClick = params => {
    inspect(params?.data || {});
    if (sunburstView === 'overview' && params?.data?.isMergedPhyla) {
      detailDrillAppliedRef.current = false;
      setFocusId(''); setSunburstView('others');
    } else if (params?.data?.id) { focusNode(params.data); }
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
    window.requestAnimationFrame(() => resizeChartToContainer(chart));
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
  const handleTreemapReady = chart => {
    treemapInstanceRef.current = chart;
    window.requestAnimationFrame(() => {
      resizeChartToContainer(chart);
    });
  };
  const handleTreemapFinished = () => {};

  return (
    <div className="taxonomy-explorer" ref={hostRef}>
      <div className="taxonomy-explorer__controls" role="toolbar" aria-label="分类层级图操作">
        <button type="button" onClick={restore}>恢复全图</button>
        {mode !== 'sankey' ? <button type="button" disabled={!focused && sunburstView === 'overview'} onClick={() => {
          if (sunburstView === 'others') { setSunburstView('overview'); setFocusId(''); }
          else setFocusId(focused?.parentId || '');
        }}>返回上一级</button> : null}
        {mode === 'treemap' || mode === 'radialtree' ? <>
          <button type="button" aria-label="缩小分类图" onClick={() => zoomNative(1 / 1.25)}>− 缩小</button>
          <button type="button" aria-label="放大分类图" onClick={() => zoomNative(1.25)}>＋ 放大</button>
        </> : null}
        {mode === 'sankey' ? <>
          <button type="button" disabled={spacing <= .8} onClick={() => setSpacing(value => Math.max(.8, value - .2))}>紧凑画布</button>
          <button type="button" disabled={spacing >= 1.6} onClick={() => setSpacing(value => Math.min(1.6, value + .2))}>展开画布</button>
          <span className="taxonomy-explorer__note">阅读间距 {Math.round(spacing * 100)}%</span>
          <button type="button" aria-pressed={overviewVisible} onClick={() => setOverviewVisible(value => !value)}>全局预览</button>
        </> : null}
        <button type="button" aria-pressed={labelsVisible} onClick={() => setLabelsVisible(value => !value)}>{labelsVisible ? '隐藏标签' : '显示标签'}</button>
        {mode === 'sunburst' ? <button type="button" aria-pressed={legendVisible} onClick={() => setLegendVisible(value => !value)}>门级图例</button> : null}
        <label>{mode === 'sankey' ? '最低画布高度' : '画布高度'}<input type="number" aria-label="分类图画布高度" min="760" max={mode === 'sankey' ? 4800 : 1800} value={manualHeight || Math.max(760, viewportSize.height)} onChange={event => setManualHeight(Math.max(760, Math.min(mode === 'sankey' ? 4800 : 1800, Number(event.target.value) || 760)))} /></label>
        <button type="button" onClick={() => setManualHeight(0)}>自动高度</button>
        <button type="button" onClick={async () => {
          try { if (document.fullscreenElement) await document.exitFullscreen(); else await hostRef.current?.requestFullscreen(); }
          catch { setStatus('当前浏览器不支持全屏，可手动增加画布高度。'); }
        }}>全屏分类图</button>
      </div>
      <p className="taxonomy-explorer__note">数值为{semantics.unit}，覆盖当前所选 {semantics.sampleCount || '未知'} 个样本。完整范围累计值 {preciseTaxonomy(semantics.total)}；整图占比以此为分母，父级占比以对应父节点为分母。当前投影使用门→纲→属→物种层级。</p>
      <p className="taxonomy-explorer__note">{mode === 'treemap' ? '默认展示三层，点击节点聚焦继续查看；鼠标漫游缩放/平移。矩形面积对应本分支中的累计丰度。' : mode === 'sunburst' ? '点击分支聚焦，点击 Others 查看合并门；使用路径或返回按钮返回。图例表示完整范围门级占比，可拖动手柄或用方向键移动。' : mode === 'radialtree' ? '默认展开三层，点击节点展开/收起并查看详情；鼠标缩放、拖动浏览。这是分类层级树，不是序列推断的系统发育树。' : '完整画布随内容展开，使用页面滚动浏览；窄屏可横向滚动。全局预览联动页面视野，可点击或拖动定位。点击节点查看详情；连线为分类归属与丰度汇总，不表示迁移或物质流动。'}</p>
      {mode === 'sankey' ? <p className="taxonomy-explorer__note">画布高 {Math.round(sankeyCanvasHeight)} px；阅读间距通过重新布局调整，保留全部当前投影节点和连线。画布最高 4800 px；密集处可使用名称查找和节点详情辅助阅读。完整 PNG 导出包含整张绘图区，不受页面当前滚动位置影响。</p> : null}
      <p className="taxonomy-explorer__note">各层级存在长尾聚合，Other 是展示合并节点；Unclassified 是来源分类缺失，二者不同。{mode === 'sankey' ? '桑基图另有列节点预算与布局压缩；成员详情区分压缩与原树聚合。' : mode === 'sunburst' ? '旭日图还将占整图 <1% 的门合为 Others；图例保留各门原占比。' : ''}下方筛选与合并明细及完整结果查询继续可用。</p>
      <details className="taxonomy-explorer__rules"><summary>查看本图聚合规则</summary>
        {Object.entries(projection?.projection?.filters?.find(filter => filter.type === 'taxonomy_long_tail_aggregation')?.value || {}).map(([rank, rule]) => <p key={rank}>{rank}：同一父级内按累计丰度排序，至多 {rule.limit} 项且占父级 ≥{preciseTaxonomy(rule.min_ratio * 100)}%；首位保留，其余归入 {rule.other}。</p>)}
        {data?.layout?.columnBudgets ? <p>桑基图各列节点预算：{JSON.stringify(data.layout.columnBudgets)}；每父级真实子节点上限：{JSON.stringify(data.layout.realChildLimits)}。为保持列密度另行压缩，成员可从节点详情核对。</p> : null}
        <p>聚合不改变累计数值和分类归属。完整原始记录可通过下方独立结果查询下载。</p>
      </details>
      <nav className="taxonomy-explorer__path" aria-label="当前分类路径">
        <button type="button" onClick={restore}>完整范围</button>
        {focused ? focused.pathNames.map((name, index) => {
          const entry = indexed.entries.find(item => item.pathNames.length === index + 1 && item.pathNames.every((part, i) => part === focused.pathNames[i]));
          return <button type="button" key={entry?.id || index} onClick={() => setFocusId(entry?.id || '')}>{name}</button>;
        }) : sunburstView === 'others' ? <span>Others 合并门明细</span> : null}
      </nav>
      <label className="taxonomy-explorer__search">查找分类<input type="search" aria-label="查找分类名称或路径" value={search} onChange={event => setSearch(event.target.value)} placeholder="完整名称或分类路径" /></label>
      {search.trim() ? <div className="taxonomy-explorer__matches" role="region" aria-label="分类查找结果">
        <p>匹配 {matches.length} 个当前展示节点，显示前 30 项。聚合内成员可从 Other 的详情或下方完整结果查询查看。</p>
        {matches.slice(0, 30).map(node => <button key={node.id} type="button" onClick={() => focusNode(node)}>{node.fullPath || node.label || node.name} · {preciseTaxonomy(node.value)}</button>)}
      </div> : null}
      <p role="status" className="taxonomy-explorer__note">{status}</p>
      <p className="taxonomy-explorer__note">{exportNote}。矩形树图导出按导出尺寸重新布局，保留当前分支；旭日图导出包含完整图例，统一放在右侧，不沿用拖动位置。</p>
    <TaxonomyViewport ref={viewportRef} mode={mode} height={height}>
      <div className={className}>
      {mode === 'sunburst' ? (
        <SunburstRenderer
          chartRef={chartRef}
          option={displayOption}
          size={sunburstLayout.size}
          view={sunburstView}
          onReady={handleSunburstReady}
          onClick={handleSunburstClick}
          onRootToNode={handleSunburstRootToNode}
          legendContent={(sunburstModel?.legendItems || []).flatMap(item => [
            renderPhylumLegendRow(item),
            ...(item.children || []).map(child => renderPhylumLegendRow(child)),
          ])}
          legendItems={sunburstModel?.legendItems || []}
          hasMergedPhyla={sunburstModel?.mergedPhyla?.length > 0}
          legendVisible={legendVisible} onLegendVisibleChange={setLegendVisible}
          exportNote={exportNote}
        />
      ) : mode === 'radialtree' ? (
        <RadialTreeRenderer key={focusId || 'complete-tree'} option={displayOption} size={radialTreeLayout.size} onReady={chart => { chartRef.current = { getEchartsInstance: () => chart }; window.requestAnimationFrame(() => resizeChartToContainer(chart)); }} onClick={params => inspect(params.data || {})} exportNote={exportNote} />
      ) : mode === 'sankey' ? (
        <SankeyRenderer
          option={displayOption}
          opts={sankeyOpts}
          constraints={sankeyCanvasConstraints}
          height={sankeyCanvasHeight}
          onClick={params => { if (params.dataType !== 'edge') inspect(params.data || {}); }} exportNote={exportNote}
          onReady={chart => {
            sankeyInstanceRef.current = chart;
            setSankeyChart(chart);
            window.requestAnimationFrame(() => resizeChartToContainer(chart));
          }}
        />
      ) : mode === 'treemap' ? (
        <TreemapRenderer
          key={focusId || 'complete-treemap'}
          option={displayOption}
          size={treemapCanvasSize}
          onReady={handleTreemapReady}
          onFinished={handleTreemapFinished}
          onClick={params => { if (params.data?.id) focusNode(params.data); }} exportNote={exportNote}
        />
      ) : (
        <RadialTreeRenderer option={option} size={760} />
      )}
      </div>
    </TaxonomyViewport>
      {mode === 'sankey' ? <TaxonomyPageOverview chart={sankeyChart} enabled={overviewVisible} /> : null}
      {selectedNode ? <section className="taxonomy-explorer__detail" aria-label="分类节点详情">
        <h4>{selectedNode.label || selectedNode.name}</h4><p>{selectedNode.fullPath || selectedNode.pathNames?.join(' > ')}</p>
        {taxonomyValueLines(selectedNode, semantics, selectedNode.detailParentValue ?? indexed.byId.get(selectedNode.parentId)?.value).map(line => <p key={line}>{line}</p>)}
        <p>{selectedNode.aggregationKind === 'sankey_layout_compression' ? '桑基布局压缩合并' : selectedNode.isMergedPhyla ? '旭日图门级展示合并' : selectedNode.mergedCount ? '分类树长尾展示合并' : '直接展示分类节点'}</p>
        {selectedNode.sourceMembers?.length ? <><p>直接合并成员 {selectedNode.sourceMembers.length} 项；成员内可能还包含子层级聚合，点击可继续查看。</p>
          <div className="taxonomy-explorer__members">{selectedNode.sourceMembers.slice((memberPage - 1) * 30, memberPage * 30).map((node, index) => <button type="button" key={index} onClick={() => inspect({ ...node, detailParentValue: selectedNode.value, fullPath: `${selectedNode.fullPath || selectedNode.name} > ${node.name}` })}>{node.name} · {preciseTaxonomy(node.value)}{node.sourceMembers?.length ? '（可查看内部合并）' : ''}</button>)}</div>
          <button type="button" disabled={memberPage <= 1} onClick={() => setMemberPage(value => value - 1)}>上一页成员</button><span>第 {memberPage} 页</span><button type="button" disabled={memberPage * 30 >= selectedNode.sourceMembers.length} onClick={() => setMemberPage(value => value + 1)}>下一页成员</button>
        </> : selectedNode.mergedCount ? <p>此版本未带成员结构，可在下方筛选与合并明细或完整结果查询核对成员。</p> : null}
        {selectedNode.children?.length ? <div className="taxonomy-explorer__members">{selectedNode.children.map(node => <button type="button" key={node.id || node.name} onClick={() => focusNode({ ...node, detailParentValue: selectedNode.value, fullPath: node.fullPath || `${selectedNode.fullPath || selectedNode.name} > ${node.name}` })}>{node.name} · {preciseTaxonomy(node.value)}</button>)}</div> : null}
      </section> : null}
    </div>
  );
}

export default TaxonomyChart;
