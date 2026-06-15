import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import useTooltip from '../../hooks/useTooltip';

const ABUNDANCE_COLORS = ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'];
const DIFF_COLORS = ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'];
const DEFAULT_DIFF_LABELS = ['AD - NC'];
const MAX_RENDER_SCALE = 1.5;
const SNAPSHOT_SCALE = 2;
const MIN_LIGHTBOX_SCALE = 0.5;
const MAX_LIGHTBOX_SCALE = 5;
const GROUP_COLORS = { AD: '#c0392b', NC: '#27ae60' };

/* ====== 工具函数 ====== */

function formatTaxonomy(fullName) {
  // 将 k__Bacteria|p__Firmicutes|... 格式化为可读多行
  return String(fullName).split('|').map(s => s.replace(/^([a-z])__/, (_, p) => p + ': ')).join('\n');
}

function formatP(p) {
  if (!Number.isFinite(p)) return 'NA';
  if (p < 0.001) return p.toExponential(2);
  return p.toFixed(3);
}

function fmt(n, d) {
  if (!Number.isFinite(n)) return 'NA';
  return n.toFixed(d);
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
}

function validColumnOrder(order, cols) {
  if (!Array.isArray(order) || order.length !== cols) {
    return Array.from({ length: cols }, (_, index) => index);
  }
  const seen = new Set(order);
  if (seen.size !== cols) {
    return Array.from({ length: cols }, (_, index) => index);
  }
  return order.every(index => Number.isInteger(index) && index >= 0 && index < cols)
    ? order
    : Array.from({ length: cols }, (_, index) => index);
}

function reorderMatrix(matrix, order) {
  return matrix.map(row => order.map(index => row[index]));
}

function validDendrogram(dendrogram) {
  return dendrogram && Array.isArray(dendrogram.merges);
}

export function buildCombinedHeatmapData(result, orderedData) {
  const baseMatrix = [...orderedData.adMatrix, ...orderedData.ncMatrix];
  const baseLabels = [...result.adLabels, ...result.ncLabels];
  const baseGroups = [
    ...result.adLabels.map(() => 'AD'),
    ...result.ncLabels.map(() => 'NC'),
  ];
  const rowOrder = validColumnOrder(result.combinedRowOrder, baseMatrix.length);
  const hasRowOrder = Array.isArray(result.combinedRowOrder)
    && rowOrder.every((value, index) => value === result.combinedRowOrder[index]);
  const rowDendrogram = result.dendrograms?.rows;
  const columnDendrogram = result.dendrograms?.columns;

  if (!hasRowOrder || !validDendrogram(rowDendrogram) || !validDendrogram(columnDendrogram)) {
    return null;
  }

  return {
    matrix: rowOrder.map(index => baseMatrix[index]),
    rowLabels: rowOrder.map(index => baseLabels[index]),
    rowGroups: rowOrder.map(index => baseGroups[index]),
    rowLeafOrder: rowOrder,
    columnLeafOrder: validColumnOrder(result.colOrder, orderedData.colLabels.length),
    rowDendrogram,
    columnDendrogram,
  };
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function getRenderScale(scale = window.devicePixelRatio || 1) {
  return Math.max(1, Math.min(MAX_RENDER_SCALE, scale));
}

function clampLightboxScale(scale) {
  return Math.max(MIN_LIGHTBOX_SCALE, Math.min(MAX_LIGHTBOX_SCALE, scale));
}

/* ====== 布局参数 ====== */

const COMPACT = { cellW: 14, left: 60, top: 44, right: 44, bottom: 30, colFont: 6, rowFont: 7 };
const NORMAL  = { cellW: 26, left: 105, top: 56, right: 56, bottom: 40, colFont: 8, rowFont: 9 };
const DENDRO_LAYOUT = {
  compact: {
    left: 108,
    rowTreeGap: 4,
    rowTreeWidth: 56,
    legendGap: 10,
    legendWidth: 40,
    columnTreeGap: 4,
    columnTreeHeight: 42,
  },
  normal: {
    left: 150,
    rowTreeGap: 6,
    rowTreeWidth: 66,
    legendGap: 12,
    legendWidth: 44,
    columnTreeGap: 6,
    columnTreeHeight: 50,
  },
};

function cellHeight(rows) {
  if (rows <= 1) return 24;
  if (rows > 80) return 4;
  if (rows > 50) return 6;
  if (rows > 25) return 8;
  return 10;
}

export function buildHeatmapLayout({ rows, cols, compact, fixedRows, showDendrograms }) {
  const base = compact ? COMPACT : NORMAL;
  const dendroSpec = compact ? DENDRO_LAYOUT.compact : DENDRO_LAYOUT.normal;
  const L = showDendrograms
    ? {
        ...base,
        left: dendroSpec.left,
        right: dendroSpec.rowTreeGap
          + dendroSpec.rowTreeWidth
          + dendroSpec.legendGap
          + dendroSpec.legendWidth,
        bottom: dendroSpec.columnTreeGap
          + dendroSpec.columnTreeHeight
          + base.bottom,
      }
    : base;
  const layoutRows = fixedRows ? Math.max(rows, fixedRows) : rows;
  const ch = compact ? cellHeight(layoutRows) : cellHeight(rows);
  const gridW = cols * L.cellW;
  const gridH = rows * ch;
  const totalW = L.left + gridW + L.right;
  const totalH = L.top + layoutRows * ch + L.bottom;
  const labelEvery = Math.max(1, Math.ceil(rows / (compact ? 18 : 28)));
  const dendro = showDendrograms
    ? {
        rowTreeLeft: L.left + gridW + dendroSpec.rowTreeGap,
        rowTreeRight: L.left + gridW + dendroSpec.rowTreeGap + dendroSpec.rowTreeWidth,
        columnTreeTop: L.top + gridH + dendroSpec.columnTreeGap,
        columnTreeBottom: L.top + gridH + dendroSpec.columnTreeGap + dendroSpec.columnTreeHeight,
      }
    : null;
  const legendX = showDendrograms
    ? dendro.rowTreeRight + dendroSpec.legendGap
    : L.left + gridW + 10;

  return {
    L,
    layoutRows,
    ch,
    gridW,
    gridH,
    totalW,
    totalH,
    labelEvery,
    dendro,
    legendX,
  };
}

function makeColorScale(mode, maxV, maxAbs) {
  if (mode === 'diff') {
    return d3.scaleSequential(d3.interpolateRdBu).domain([maxAbs || 1, -(maxAbs || 1)]);
  }
  return d3.scaleSequential(d3.interpolateYlOrRd).domain([0.15, maxV || 1]);
}

function canvasPoint(event, canvas, layout) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (event.clientX - rect.left) * (layout.totalW / rect.width),
    y: (event.clientY - rect.top) * (layout.totalH / rect.height),
  };
}

function heatmapHitTest(point, layout, rows, cols) {
  if (!point) return null;
  const gridX = point.x - layout.L.left;
  const gridY = point.y - layout.L.top;
  if (gridX < 0 || gridY < 0 || gridX >= layout.gridW || gridY >= layout.gridH) {
    return null;
  }
  const j = Math.floor(gridX / layout.L.cellW);
  const i = Math.floor(gridY / layout.ch);
  return i >= 0 && i < rows && j >= 0 && j < cols ? { i, j } : null;
}

function drawLine(ctx, x1, y1, x2, y2, color = '#cbd5e1', width = 0.8) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawRowDendrogram(ctx, dendrogram, leafOrder, layout) {
  const merges = dendrogram?.merges;
  if (!Array.isArray(merges) || merges.length === 0) return;
  const { L, ch, dendro } = layout;
  const maxDistance = Math.max(...merges.map(merge => Number(merge[2]) || 0), 1e-12);
  const treeWidth = dendro.rowTreeRight - dendro.rowTreeLeft;
  const nodes = new Map();

  leafOrder.forEach((leafId, position) => {
    nodes.set(leafId, {
      x: dendro.rowTreeLeft,
      y: L.top + position * ch + ch / 2,
    });
  });

  merges.forEach((merge, index) => {
    const left = nodes.get(Number(merge[0]));
    const right = nodes.get(Number(merge[1]));
    if (!left || !right) return;
    const distance = Math.max(0, Number(merge[2]) || 0);
    const parent = {
      x: dendro.rowTreeLeft + (distance / maxDistance) * treeWidth,
      y: (left.y + right.y) / 2,
    };
    drawLine(ctx, left.x, left.y, parent.x, left.y, '#64748b', 0.7);
    drawLine(ctx, right.x, right.y, parent.x, right.y, '#64748b', 0.7);
    drawLine(ctx, parent.x, left.y, parent.x, right.y, '#64748b', 0.7);
    nodes.set(leafOrder.length + index, parent);
  });
}

function drawColumnDendrogram(ctx, dendrogram, leafOrder, layout) {
  const merges = dendrogram?.merges;
  if (!Array.isArray(merges) || merges.length === 0) return;
  const { L, dendro } = layout;
  const maxDistance = Math.max(...merges.map(merge => Number(merge[2]) || 0), 1e-12);
  const treeHeight = dendro.columnTreeBottom - dendro.columnTreeTop;
  const nodes = new Map();

  leafOrder.forEach((leafId, position) => {
    nodes.set(leafId, {
      x: L.left + position * L.cellW + L.cellW / 2,
      y: dendro.columnTreeTop,
    });
  });

  merges.forEach((merge, index) => {
    const left = nodes.get(Number(merge[0]));
    const right = nodes.get(Number(merge[1]));
    if (!left || !right) return;
    const distance = Math.max(0, Number(merge[2]) || 0);
    const parent = {
      x: (left.x + right.x) / 2,
      y: dendro.columnTreeTop + (distance / maxDistance) * treeHeight,
    };
    drawLine(ctx, left.x, left.y, left.x, parent.y, '#64748b', 0.7);
    drawLine(ctx, right.x, right.y, right.x, parent.y, '#64748b', 0.7);
    drawLine(ctx, left.x, parent.y, right.x, parent.y, '#64748b', 0.7);
    nodes.set(leafOrder.length + index, parent);
  });
}

function drawHeatmap(canvas, params, renderScale = getRenderScale(), options = {}) {
  const {
    matrix,
    rowLabels,
    colLabels,
    mode,
    maxV,
    maxAbs,
    filter,
    layout,
    rowGroups,
    rowDendrogram,
    columnDendrogram,
    rowLeafOrder,
    columnLeafOrder,
  } = params;

  const { L, ch, gridW, gridH, totalW, totalH, labelEvery } = layout;
  const rows = matrix.length;
  const cols = colLabels.length;
  const showDendrograms = Boolean(rowDendrogram && columnDendrogram);
  const pixelRatio = Math.max(1, renderScale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = Math.max(1, Math.ceil(totalW * pixelRatio));
  canvas.height = Math.max(1, Math.ceil(totalH * pixelRatio));
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, totalW, totalH);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  const colorScale = makeColorScale(mode, maxV, maxAbs);

  ctx.save();
  ctx.translate(L.left, L.top);

  for (let i = 0; i < rows; i += 1) {
    const row = matrix[i];
    const y = i * ch;
    for (let j = 0; j < cols; j += 1) {
      const v = row[j];
      ctx.fillStyle = v > 0 || mode === 'diff' ? colorScale(v) : '#ffffe0';
      ctx.fillRect(
        j * L.cellW,
        y,
        Math.max(0.5, L.cellW - 0.4),
        Math.max(0.5, ch - 0.4)
      );
    }
  }

  if (showDendrograms && Array.isArray(rowGroups)) {
    rowGroups.forEach((group, i) => {
      ctx.fillStyle = GROUP_COLORS[group] || '#94a3b8';
      ctx.fillRect(-12, i * ch, 7, Math.max(0.5, ch - 0.4));
    });
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `${L.rowFont}px sans-serif`;
  rowLabels.forEach((label, i) => {
    if (rows > 1 && i % labelEvery !== 0) {
      const isLast = i === rows - 1;
      if (!isLast || (i % labelEvery) < 2) return;
    }
    ctx.fillText(label, showDendrograms ? -18 : -6, i * ch + ch / 2);
  });

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#334155';
  ctx.font = `${L.colFont}px sans-serif`;
  colLabels.forEach((label, j) => {
    const cx = j * L.cellW + L.cellW / 2;
    drawLine(ctx, cx, -2, cx, 1, '#94a3b8', 0.5);
    ctx.save();
    ctx.translate(cx, -5);
    ctx.rotate(-65 * Math.PI / 180);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  drawLine(ctx, 0, 0, gridW, 0);
  drawLine(ctx, -1, 0, -1, gridH);
  ctx.restore();

  if (showDendrograms) {
    drawRowDendrogram(ctx, rowDendrogram, rowLeafOrder, layout);
    drawColumnDendrogram(ctx, columnDendrogram, columnLeafOrder, layout);
  }

  const legX = layout.legendX;
  const legY = L.top;
  const legH = Math.min(140, gridH);
  const legW = 10;
  const stops = mode === 'diff' ? DIFF_COLORS : ABUNDANCE_COLORS;
  const nStops = stops.length;

  for (let i = 0; i < nStops; i += 1) {
    ctx.fillStyle = stops[i];
    ctx.fillRect(legX, legY + (legH / nStops) * (nStops - 1 - i), legW, legH / nStops);
  }

  ctx.font = '7px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i += 1) {
    const t = i / tickCount;
    const val = mode === 'diff' ? maxAbs * (1 - 2 * t) : maxV * (1 - t);
    const y = legY + t * legH;
    drawLine(ctx, legX + legW, y, legX + legW + 4, y, '#94a3b8', 0.6);
    ctx.fillText(val >= 1000 ? `${(val / 1000).toFixed(1)}k` : fmt(val, 1), legX + legW + 6, y);
  }

  if (mode === 'diff') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b2182b';
    ctx.fillText('AD↑', legX + legW / 2, legY - 4);
    ctx.fillStyle = '#2166ac';
    ctx.fillText('NC↓', legX + legW / 2, legY + legH + 12);
  }

  if (options.includeNote) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '7px sans-serif';
    ctx.fillText(
      `筛选: Wilcoxon p<${filter?.pValueMax ?? 0.05}, |log₂FC|>${filter?.log2FcMinAbs ?? 1} | 行列聚类: 层次聚类(average) | 数据: log₁₀(丰度+1)`,
      totalW / 2,
      totalH - 6
    );
  }
}

/* ====== Canvas 渲染子组件 ====== */

const HeatmapCanvas = memo(function HeatmapCanvas({
  title,
  matrix,
  rowLabels,
  colLabels,
  stats,
  mode,
  maxV,
  maxAbs,
  chartSubType,
  filter,
  onOpen,
  compact,
  fixedRows,
  rowGroups,
  rowDendrogram,
  columnDendrogram,
  rowLeafOrder,
  columnLeafOrder,
}) {
  const canvasRef = useRef(null);
  const { Tooltip, show, move, hide } = useTooltip();
  const [exporting, setExporting] = useState(false);
  const rows = matrix.length;
  const cols = colLabels.length;
  const showDendrograms = Boolean(rowDendrogram && columnDendrogram);

  const layout = useMemo(
    () => buildHeatmapLayout({ rows, cols, compact, fixedRows, showDendrograms }),
    [rows, cols, compact, fixedRows, showDendrograms]
  );

  const drawParams = useMemo(() => ({
    matrix,
    rowLabels,
    colLabels,
    stats,
    mode,
    maxV,
    maxAbs,
    filter,
    layout,
    rowGroups,
    rowDendrogram,
    columnDendrogram,
    rowLeafOrder,
    columnLeafOrder,
  }), [matrix, rowLabels, colLabels, stats, mode, maxV, maxAbs, filter, layout, rowGroups, rowDendrogram, columnDendrogram, rowLeafOrder, columnLeafOrder]);

  const createSnapshot = useCallback((scale = SNAPSHOT_SCALE, includeNote = false) => {
    const canvas = document.createElement('canvas');
    drawHeatmap(canvas, drawParams, scale, { includeNote });
    return canvas.toDataURL('image/png');
  }, [drawParams]);

  const handleExport = useCallback(() => {
    if (exporting) return;

    setExporting(true);
    try {
      const link = document.createElement('a');
      link.href = createSnapshot(SNAPSHOT_SCALE, true);
      const filterStr = `p${filter?.pValueMax ?? 0.05}-log2FC${filter?.log2FcMinAbs ?? 1}`;
      const filename = `heatmap_${chartSubType}_${filterStr}_${dateStamp()}.png`;
      link.download = `${sanitizeFilename(filename)}.png`;
      link.click();
    } catch (error) {
      console.error('Export heatmap failed:', error);
    } finally {
      setExporting(false);
    }
  }, [chartSubType, createSnapshot, exporting, filter]);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawHeatmap(canvasRef.current, drawParams);
  }, [drawParams]);

  const handleMouseMove = useCallback((event) => {
    if (!canvasRef.current) return;
    const point = canvasPoint(event, canvasRef.current, layout);
    const hit = heatmapHitTest(point, layout, rows, cols);
    if (!hit) {
      hide();
      return;
    }

    const value = matrix[hit.i][hit.j];
    const stat = stats[hit.j];
    const tax = formatTaxonomy(stat.fullName);
    const lines = [tax, `p = ${formatP(stat.p)}`, `log2FC = ${fmt(stat.log2FC, 3)}`];
    if (mode === 'diff') {
      lines.push(`AD−NC = ${fmt(value, 4)}`);
    } else {
      lines.push(`样本: ${rowLabels[hit.i]}`, `log10(丰度+1) = ${fmt(value, 4)}`);
      if (rowGroups?.[hit.i]) lines.push(`分组: ${rowGroups[hit.i]}`);
    }
    show(lines.join('<br/>'));
    move(event);
  }, [cols, hide, layout, matrix, mode, move, rowGroups, rowLabels, rows, show, stats]);

  const handleOpen = useCallback(() => {
    if (!onOpen) return;
    onOpen({
      src: createSnapshot(SNAPSHOT_SCALE),
      title,
    });
  }, [createSnapshot, onOpen, title]);

  return (
    <section style={{
      padding: compact ? 12 : 16,
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      background: '#fff',
      minWidth: 0,
      boxSizing: 'border-box',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 2,
      }}>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 600, color: '#0f172a' }}>{title}</div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: compact ? '4px 8px' : '5px 10px',
            borderRadius: 8,
            border: '1px solid #d5dde7',
            background: exporting ? '#f8fafc' : '#fff',
            color: '#475569',
            fontSize: compact ? 10 : 11,
            fontFamily: 'inherit',
            cursor: exporting ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {exporting ? '导出中...' : '导出图片'}
        </button>
      </div>
      <div style={{ fontSize: compact ? 10 : 11, color: '#94a3b8', marginBottom: 6 }}>
        {mode === 'diff'
          ? '红色=AD高 蓝色=NC高'
          : showDendrograms
            ? '颜色越深 log丰度越高 · 分组条：红色=AD 绿色=NC'
            : '颜色越深 log丰度越高'} · 点击热图可放大
      </div>
      <div
        onClick={handleOpen}
        onMouseMove={handleMouseMove}
        onMouseLeave={hide}
        style={{ position: 'relative', width: '100%', overflowX: 'auto', cursor: onOpen ? 'zoom-in' : 'default' }}
      >
        <canvas
          ref={canvasRef}
          aria-label={title}
          data-row-dendrogram={showDendrograms ? 'true' : undefined}
          data-column-dendrogram={showDendrograms ? 'true' : undefined}
          data-row-dendrogram-position={showDendrograms ? 'right' : undefined}
          data-column-dendrogram-position={showDendrograms ? 'bottom' : undefined}
          data-row-groups={Array.isArray(rowGroups) ? rowGroups.join(',') : undefined}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
        <Tooltip />
      </div>
    </section>
  );
});

function Lightbox({ image, onClose }) {
  const contentRef = useRef(null);
  const viewportRef = useRef(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const frame = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const applyTransform = useCallback(() => {
    frame.current = null;
    if (!contentRef.current) return;
    const { x, y, scale } = transform.current;
    contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }, []);

  const scheduleTransform = useCallback(() => {
    if (frame.current) return;
    frame.current = window.requestAnimationFrame
      ? window.requestAnimationFrame(applyTransform)
      : window.setTimeout(applyTransform, 16);
  }, [applyTransform]);

  const setScaleBy = useCallback((delta) => {
    transform.current.scale = clampLightboxScale(transform.current.scale + delta);
    scheduleTransform();
  }, [scheduleTransform]);

  const zoomAt = useCallback((delta, clientX, clientY) => {
    const previous = transform.current;
    const nextScale = clampLightboxScale(previous.scale + delta);
    if (nextScale === previous.scale) return;

    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) {
      transform.current.scale = nextScale;
      scheduleTransform();
      return;
    }

    const anchorX = clientX - rect.left - rect.width / 2;
    const anchorY = clientY - rect.top - rect.height / 2;
    const ratio = nextScale / previous.scale;

    transform.current = {
      scale: nextScale,
      x: anchorX - (anchorX - previous.x) * ratio,
      y: anchorY - (anchorY - previous.y) * ratio,
    };
    scheduleTransform();
  }, [scheduleTransform]);

  const resetTransform = useCallback(() => {
    transform.current = { x: 0, y: 0, scale: 1 };
    scheduleTransform();
  }, [scheduleTransform]);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (frame.current) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout;
        cancel(frame.current);
      }
    };
  }, [onClose]);

  const handleWheel = event => {
    event.preventDefault();
    zoomAt(event.deltaY > 0 ? -0.2 : 0.2, event.clientX, event.clientY);
  };

  const handleMouseDown = event => {
    event.preventDefault();
    dragging.current = true;
    setIsDragging(true);
    lastPos.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseMove = event => {
    if (!dragging.current) return;
    const dx = event.clientX - lastPos.current.x;
    const dy = event.clientY - lastPos.current.y;
    lastPos.current = { x: event.clientX, y: event.clientY };
    transform.current.x += dx;
    transform.current.y += dy;
    scheduleTransform();
  };

  const handleMouseUp = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        cursor: 'zoom-out',
      }}
    >
      <div
        ref={viewportRef}
        onClick={event => event.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: 'relative',
          width: 'min(94vw, 1400px)',
          height: 'min(90vh, 900px)',
          overflow: 'hidden',
          borderRadius: 14,
          background: '#fff',
          padding: 18,
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.38)',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: 'translate(0px, 0px) scale(1)',
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 100ms ease',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={image.src}
            alt={`${image.title} 放大预览`}
            draggable={false}
            onDragStart={event => event.preventDefault()}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
        <div style={{
          position: 'absolute',
          right: 18,
          bottom: 18,
          display: 'flex',
          gap: 8,
        }}>
          <button type="button" onClick={() => setScaleBy(0.5)}>放大</button>
          <button type="button" onClick={() => setScaleBy(-0.5)}>缩小</button>
          <button type="button" onClick={resetTransform}>重置</button>
        </div>
      </div>
    </div>
  );
}

/* ====== 主组件 ====== */

function Heatmap({ data, featureLabel = '物种' }) {
  const result = data;
  const resolvedFeatureLabel = result?.featureLabel || featureLabel;
  const [lightboxImage, setLightboxImage] = useState(null);

  const stats = Array.isArray(result?.stats) ? result.stats : null;
  const adMatrix = Array.isArray(result?.adMatrix) ? result.adMatrix : null;
  const ncMatrix = Array.isArray(result?.ncMatrix) ? result.ncMatrix : null;
  const diffMatrix = Array.isArray(result?.diffMatrix) ? result.diffMatrix : null;
  const adLabels = Array.isArray(result?.adLabels) ? result.adLabels : null;
  const ncLabels = Array.isArray(result?.ncLabels) ? result.ncLabels : null;
  const colLabels = Array.isArray(result?.colLabels) ? result.colLabels : null;
  const diffLabels = Array.isArray(result?.diffLabels) ? result.diffLabels : DEFAULT_DIFF_LABELS;

  const colOrder = useMemo(
    () => validColumnOrder(result?.colOrder, colLabels?.length ?? 0),
    [result?.colOrder, colLabels]
  );

  const orderedData = useMemo(() => {
    if (!stats || !adMatrix || !ncMatrix || !diffMatrix || !colLabels) return null;
    return {
      stats: colOrder.map(index => stats[index]),
      colLabels: colOrder.map(index => colLabels[index]),
      adMatrix: reorderMatrix(adMatrix, colOrder),
      ncMatrix: reorderMatrix(ncMatrix, colOrder),
      diffMatrix: reorderMatrix(diffMatrix, colOrder),
    };
  }, [adMatrix, colLabels, colOrder, diffMatrix, ncMatrix, stats]);

  const combinedData = useMemo(() => {
    if (!orderedData || !adLabels || !ncLabels) return null;
    return buildCombinedHeatmapData(result, orderedData);
  }, [adLabels, ncLabels, orderedData, result]);

  const handleOpen = useCallback((image) => {
    setLightboxImage(image);
  }, []);

  const handleClose = useCallback(() => {
    setLightboxImage(null);
  }, []);

  if (!result) return <div className="placeholder"><p>暂无数据</p></div>;
  if (result.error) return <div className="placeholder"><p>{result.error}</p></div>;

  if (!stats || !adMatrix || !ncMatrix || !diffMatrix || !adLabels || !ncLabels || !colLabels || !orderedData) {
    return (
      <div className="placeholder placeholder--error">
        <span className="placeholder-icon">&#9888;</span>
        <p>热图数据结构不完整</p>
        <small>请确认当前图表接口返回的是 heatmap 缓存 JSON。</small>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', color: '#0f172a' }}>
      {/* 筛选信息 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 14,
        padding: '8px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0',
        fontSize: 12, color: '#475569',
      }}>
        <span><b style={{ color: '#0f172a' }}>筛选：</b>Wilcoxon p&lt;0.05, |log₂FC|&gt;1</span>
        <span><b style={{ color: '#0f172a' }}>差异{resolvedFeatureLabel}：</b>{stats.length}</span>
        <span style={{ color: '#c0392b' }}><b>AD：</b>{adLabels.length} 样本</span>
        <span style={{ color: '#27ae60' }}><b>NC：</b>{ncLabels.length} 样本</span>
        <span><b style={{ color: '#0f172a' }}>列排序：</b>层次聚类（average linkage）</span>
      </div>

      {/* AD → NC → 合并 → 差异纵向排列，列顺序保持一致 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <HeatmapCanvas
          title="AD 组丰度热图"
          matrix={orderedData.adMatrix}
          rowLabels={adLabels}
          colLabels={orderedData.colLabels}
          stats={orderedData.stats}
          mode="abundance"
          maxV={result.maxV}
          maxAbs={result.maxAbs}
          chartSubType="AD-abundance"
          filter={result.filter}
          onOpen={handleOpen}
        />
        <HeatmapCanvas
          title="NC 组丰度热图"
          matrix={orderedData.ncMatrix}
          rowLabels={ncLabels}
          colLabels={orderedData.colLabels}
          stats={orderedData.stats}
          mode="abundance"
          maxV={result.maxV}
          maxAbs={result.maxAbs}
          chartSubType="NC-abundance"
          filter={result.filter}
          onOpen={handleOpen}
        />

        {combinedData ? (
          <HeatmapCanvas
            title="AD + NC 合并丰度热图（层次聚类）"
            matrix={combinedData.matrix}
            rowLabels={combinedData.rowLabels}
            rowGroups={combinedData.rowGroups}
            colLabels={orderedData.colLabels}
            stats={orderedData.stats}
            mode="abundance"
            maxV={result.maxV}
            maxAbs={result.maxAbs}
            chartSubType="AD-NC-combined-abundance"
            filter={result.filter}
            onOpen={handleOpen}
            compact
            rowDendrogram={combinedData.rowDendrogram}
            columnDendrogram={combinedData.columnDendrogram}
            rowLeafOrder={combinedData.rowLeafOrder}
            columnLeafOrder={combinedData.columnLeafOrder}
          />
        ) : (
          <section style={{
            padding: 16,
            border: '1px dashed #cbd5e1',
            borderRadius: 14,
            background: '#f8fafc',
            color: '#475569',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              合并聚类热图需要重新预计算数据
            </div>
            <div style={{ marginTop: 4, fontSize: 12 }}>
              当前缓存缺少共同聚类树信息；原有 AD、NC 和差异热图仍可正常查看。
            </div>
          </section>
        )}

        {/* 差异热图 */}
        <HeatmapCanvas
          title="差异热图 (AD − NC 平均 log 丰度)"
          matrix={orderedData.diffMatrix}
          rowLabels={diffLabels}
          colLabels={orderedData.colLabels}
          stats={orderedData.stats}
          mode="diff"
          maxV={result.maxV}
          maxAbs={result.maxAbs}
          chartSubType="diff"
          filter={result.filter}
          onOpen={handleOpen}
        />
      </div>

      {lightboxImage && (
        <Lightbox
          image={lightboxImage}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

export default Heatmap;
