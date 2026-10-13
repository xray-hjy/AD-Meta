import { memo, useId, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3';
import '../../components/Charts/HeatmapEChart'; // Register the heatmap renderer for isolated exports.
import ZoomableChartViewport from '../../components/Charts/ZoomableChartViewport';
import { useChartFrameActions } from '../../components/Charts/ChartFrameActionsContext';
import { exportEChart } from '../../components/Charts/chartExport';
import { buildMagHeatmapOption, HEATMAP_STYLE_DEFAULTS, heatmapColors } from './magHeatmapOption';
import HeatmapTransposeMotion from './HeatmapTransposeMotion';
import { CELL_W, CELL_H, sourceCell, transposeCamera } from './magHeatmapGeometry';
import { chartTextMetrics, shortenChartLabel } from '../../components/Charts/chartLabel';
import { dendrogramSegments, heatmapTrees, treeMaximum, TREE_DEPTH, TREE_SPACE } from './magDendrogram';

const number = value => value == null || !Number.isFinite(value) ? '缺失' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const shortMag = id => id.replace(/__(CRR\d+)_cleanbin_/, ' · ');

export function heatmapRenderModel(data, preferences) {
  const style = { ...HEATMAP_STYLE_DEFAULTS, ...preferences };
  // Reuse the export option's scientific color domain and annotation semantics.
  const option = buildMagHeatmapOption(data, { ...style, transposed: false }, { count: 0 });
  const z = data.settings?.colorMode === 'rowZ';
  const colors = heatmapColors(style, z);
  const { min, max } = option.visualMap[0];
  const color = scaleLinear().domain(colors.map((_, i) => min + (max - min) * i / (colors.length - 1))).range(colors).clamp(true);
  const display = data.displayValues || data.values.map(row => row.map(value => value == null ? null : Math.log10(1 + value)));
  const constant = new Set(data.constantMagIds || []);
  const fills = display.map(row => row.map((value, y) => value == null || !Number.isFinite(value) ? '#8f929b'
    : z && constant.has(data.magIds[y]) ? colors[8] : color(value)));
  return { data, style, z, min, max, colors, display, fills, constant,
    features: new Map((data.features || []).map(row => [row.magId, row])),
    annotations: option.yAxis[1]?.data || [], annotationCells: option.series[1]?.data || [] };
}

function overviewImage(model, transposed = false) {
  const canvas = document.createElement('canvas');
  canvas.width = transposed ? model.data.magIds.length : model.data.samples.length;
  canvas.height = transposed ? model.data.samples.length : model.data.magIds.length;
  const context = canvas.getContext('2d');
  if (!context) return {};
  model.fills.forEach((column, x) => column.forEach((fill, y) => { context.fillStyle = fill; context.fillRect(transposed ? y : x, transposed ? x : y, 1, 1); }));
  return { image: canvas, url: canvas.toDataURL('image/png') };
}

const HeatmapSurface = memo(function HeatmapSurface({ model, transposed, image, camera, plot, dimensions, visible, panMode, onSelect }) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const surfaceRef = useRef(null), matrixRef = useRef(null), movingRef = useRef(false);
  const { data, style } = model;
  const trees = heatmapTrees(data, { ...style, transposed });
  const xCount = transposed ? data.magIds.length : data.samples.length, yCount = transposed ? data.samples.length : data.magIds.length;
  const xStart = Math.max(0, Math.floor(visible.x / CELL_W) - 1), xEnd = Math.min(xCount, Math.ceil((visible.x + visible.width) / CELL_W) + 1);
  const yStart = Math.max(0, Math.floor(visible.y / CELL_H) - 1), yEnd = Math.min(yCount, Math.ceil((visible.y + visible.height) / CELL_H) + 1);
  const sampleStart = transposed ? yStart : xStart, sampleEnd = transposed ? yEnd : xEnd;
  const magStart = transposed ? xStart : yStart, magEnd = transposed ? xEnd : yEnd;
  // Group equal-color cells into vector paths instead of creating one SVG DOM node per cell.
  const paths = useMemo(() => {
    const groups = new Map();
    for (let x = sampleStart; x < sampleEnd; x++) for (let y = magStart; y < magEnd;) {
      const fill = model.fills[x][y];
      let end = y + 1;
      // Merge adjacent equal-color regions while cell borders are disabled.
      // Source lookup still resolves every original cell independently.
      if (!model.style.borders) while (end < magEnd && model.fills[x][end] === fill) end++;
      if (!groups.has(fill)) groups.set(fill, []);
      groups.get(fill).push(`M${x * CELL_W},${y * CELL_H}h${CELL_W}v${(end - y) * CELL_H}h-${CELL_W}Z`);
      y = end;
    }
    return Array.from(groups, ([fill, commands]) => ({ fill, d: commands.join('') }));
  }, [model, sampleStart, sampleEnd, magStart, magEnd]);
  const fontSize = { small: 9, standard: 11, large: 13 }[style.font] || 11;
  const columnMetrics = useMemo(() => chartTextMetrics(fontSize - 1), [fontSize]);
  const rowStep = Math.max(1, Math.ceil((fontSize + 4) / (CELL_H * camera.k)));
  const columnStep = Math.max(1, Math.ceil(68 / (CELL_W * camera.k)));
  const rows = [], columns = [];
  for (let y = Math.ceil(yStart / rowStep) * rowStep; y < yEnd; y += rowStep) {
    const center = camera.y + (y + .5) * CELL_H * camera.k;
    if (center >= plot.top && center <= plot.top + plot.height) rows.push(y);
  }
  for (let x = Math.ceil(xStart / columnStep) * columnStep; x < xEnd; x += columnStep) columns.push(x);
  const locate = event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - bounds.left, py = event.clientY - bounds.top;
    const x = Math.floor((px - camera.x) / (CELL_W * camera.k)), y = Math.floor((py - camera.y) / (CELL_H * camera.k));
    return px >= plot.left && px <= plot.left + plot.width && py >= plot.top && py <= plot.top + plot.height
      && x >= 0 && x < xCount && y >= 0 && y < yCount ? { x, y, px, py, ...sourceCell(x, y, transposed) } : null;
  };
  const active = hover && hover.camera === camera && hover.transposed === transposed && !panMode ? hover : null;
  const sample = active ? data.samples[active.sample] : null, id = active ? data.magIds[active.mag] : null;
  const boundary = data.settings?.sampleOrder !== 'cluster' ? data.samples.findIndex((s, i) => i > 0 && s.disease !== data.samples[i - 1].disease) : -1;
  // Anchor the legend and annotation names to the visible matrix, which may
  // be centered inside the plot when the complete matrix is fitted.
  const matrixLeft = Math.max(plot.left, camera.x);
  const matrixTop = Math.max(plot.top, camera.y);
  const headerOffset = matrixTop - plot.top;
  const annotationWidth = transposed && model.annotations.length ? model.annotations.length * 14 + 8 : 0;
  const rowLabelX = matrixLeft - annotationWidth - (trees.left.length ? TREE_SPACE : 0) - 8;
  // At least the original label allowance; centered, narrow matrices leave
  // extra space that can reveal more of the taxonomy and MAG identifier.
  const maxLabelChars = Math.max(8, Math.floor((rowLabelX - 4) / (fontSize * .6)));
  const axisBottom = Math.min(plot.top + plot.height, camera.y + yCount * CELL_H * camera.k);
  const columnLabelBottom = Math.min(axisBottom + 90, dimensions.height - 8);
  const view = useMemo(() => ({ data, transposed, image, camera: { x: camera.x, y: camera.y, k: camera.k }, plot, dimensions,
    visible: { x: visible.x, y: visible.y, width: visible.width, height: visible.height } }),
    [data, transposed, image, camera.x, camera.y, camera.k, plot, dimensions, visible.x, visible.y, visible.width, visible.height]);
  const magLabel = index => {
    const id = data.magIds[index], taxonomy = model.features.get(id)?.taxonomyName;
    return `${taxonomy ? `${taxonomy} · ` : ''}${shortMag(id)}`;
  };
  return <>
    <svg ref={surfaceRef} className="mag-heatmap-svg" role="img" aria-label={`MAG 热图，完整集合 ${data.magIds.length} 个 MAG、${data.samples.length} 个样本；横轴 ${transposed ? 'MAG' : '样本'}，纵轴 ${transposed ? '样本' : 'MAG'}`}
      data-renderer="svg" data-transposed={transposed} data-visible-cells={(xEnd - xStart) * (yEnd - yStart)} data-total-rows={yCount}
      onMouseMove={event => { const point = event.buttons || movingRef.current ? null : locate(event); setHover(point ? { ...point, camera, transposed } : null); }}
      onMouseLeave={() => setHover(null)} onClick={event => { const point = locate(event); if (point && !movingRef.current && !panMode && !event.altKey) onSelect?.(data.magIds[point.mag]); }}>
      <defs>
        <clipPath id={`${uid}-plot`}><rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} /></clipPath>
        <clipPath id={`${uid}-rows`}><rect x="0" y={plot.top - fontSize} width={rowLabelX + 3} height={plot.height + fontSize * 2} /></clipPath>
        <clipPath id={`${uid}-tree-top`}><rect x={plot.left} y={matrixTop - TREE_SPACE} width={plot.width} height={TREE_SPACE} /></clipPath>
        <clipPath id={`${uid}-tree-left`}><rect x={matrixLeft - annotationWidth - TREE_SPACE} y={plot.top}
          width={TREE_SPACE} height={plot.height} /></clipPath>
        <clipPath id={`${uid}-annotations`}><rect x={transposed ? matrixLeft - annotationWidth : plot.left} y={transposed ? plot.top : headerOffset + 43}
          width={transposed ? model.annotations.length * 14 : plot.width} height={transposed ? plot.height : model.annotations.length * 14} /></clipPath>
        <linearGradient id={`${uid}-color`}>{model.colors.map((fill, index) => <stop key={index} offset={`${index * 100 / (model.colors.length - 1)}%`} stopColor={fill} />)}</linearGradient>
      </defs>
      <g className="mag-heatmap-color-legend">
        <rect x={matrixLeft} y={headerOffset + 8} width="140" height="12" fill={`url(#${uid}-color)`} />
        <text x={matrixLeft} y={headerOffset + 34} fill="currentColor" fontSize="10">{number(model.min)}</text>
        <text x={matrixLeft + 146} y={headerOffset + 18} fill="currentColor" fontSize="10">{number(model.max)} · {model.z ? '按 MAG 标准化 Z-score' : 'log10(1 + 丰度%)'}</text>
      </g>
      <g className="mag-heatmap-annotations" clipPath={`url(#${uid}-annotations)`}>{model.annotationCells.filter(cell => cell.value[0] >= (transposed ? yStart : xStart) && cell.value[0] < (transposed ? yEnd : xEnd)).map(cell => {
        const [x, y] = cell.value;
        return <rect key={`${x}-${y}`} x={transposed ? matrixLeft - annotationWidth + y * 14 : camera.x + x * CELL_W * camera.k}
          y={transposed ? camera.y + x * CELL_H * camera.k : headerOffset + 43 + y * 14} width={transposed ? 12 : CELL_W * camera.k + .2}
          height={transposed ? CELL_H * camera.k + .2 : 12} fill={cell.itemStyle.color} />;
      })}</g>
      {model.annotations.map((label, y) => <text key={label} x={transposed ? matrixLeft - annotationWidth + y * 14 + 6 : matrixLeft - 7}
        y={transposed ? matrixTop - 5 : headerOffset + 49 + y * 14} dominantBaseline={transposed ? 'auto' : 'middle'} textAnchor={transposed ? 'start' : 'end'}
        transform={transposed ? `rotate(-90 ${matrixLeft - annotationWidth + y * 14 + 6} ${matrixTop - 5})` : undefined}
        fontSize="9" fill="currentColor">{label}</text>)}
      {['top', 'left'].map(orientation => {
        const ids = orientation === 'top' ? (transposed ? data.magIds : data.samples.map(s => s.sampleId))
          : (transposed ? data.samples.map(s => s.sampleId) : data.magIds);
        const center = i => orientation === 'top' ? camera.x + (i + .5) * CELL_W * camera.k : camera.y + (i + .5) * CELL_H * camera.k;
        const baseline = orientation === 'top' ? matrixTop - 8 : matrixLeft - annotationWidth - 8;
        const maxDistance = treeMaximum(trees[orientation]);
        return trees[orientation].length ? <g key={orientation} className={`mag-heatmap-dendrogram mag-heatmap-dendrogram--${orientation}`}
          data-axis={orientation === 'top' ? (transposed ? 'MAG' : 'sample') : (transposed ? 'sample' : 'MAG')}
          clipPath={`url(#${uid}-tree-${orientation})`} fill="none" stroke="#64748b" strokeWidth="1" pointerEvents="none">
          {trees[orientation].map((tree, group) => <g key={group} data-group={tree.group || 'MAG'}>
            {dendrogramSegments(tree, ids, { orientation, center, baseline, depth: TREE_DEPTH, maxDistance }).map(segment =>
              <polyline key={segment.id} points={segment.points.map(point => point.join(',')).join(' ')}>
                <title>{tree.group && tree.group !== 'all' ? `${tree.group} · ` : ''}{segment.size} 个对象合并 · 欧氏距离 {number(segment.distance)}</title>
              </polyline>)}
          </g>)}
        </g> : null;
      })}
      <g ref={matrixRef} clipPath={`url(#${uid}-plot)`}>
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          <g transform={transposed ? `matrix(0 ${CELL_H / CELL_W} ${CELL_W / CELL_H} 0 0 0)` : undefined}>
          {paths.map(path => <path key={path.fill} {...path} shapeRendering="crispEdges" stroke={style.borders ? '#727d8660' : 'none'} strokeWidth={style.borders ? Math.min(2, .5 / camera.k) : 0} />)}
          </g>
          {boundary > 0 && <line x1={transposed ? 0 : boundary * CELL_W} x2={transposed ? xCount * CELL_W : boundary * CELL_W}
            y1={transposed ? boundary * CELL_H : 0} y2={transposed ? boundary * CELL_H : yCount * CELL_H} stroke="#586677" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        </g>
        {active && <rect x={camera.x + active.x * CELL_W * camera.k} y={camera.y + active.y * CELL_H * camera.k}
          width={CELL_W * camera.k} height={CELL_H * camera.k} fill="none" stroke="var(--color-text-main)" />}
      </g>
      {style.labels && <><g className="mag-heatmap-row-labels" clipPath={`url(#${uid}-rows)`}>{rows.map(y => {
        const full = transposed ? data.samples[y].sampleId : magLabel(y);
        return <text key={y} x={rowLabelX} y={camera.y + (y + .5) * CELL_H * camera.k} dominantBaseline="middle" textAnchor="end" fill="currentColor" fontSize={fontSize}>
          <title>{full}</title>{full.length > maxLabelChars ? `${full.slice(0, maxLabelChars - 1)}…` : full}</text>;
      })}</g><g className="mag-heatmap-column-labels">{columns.map(x => {
        const px = camera.x + (x + .5) * CELL_W * camera.k, py = axisBottom + 15;
        if (px < plot.left || px > plot.left + plot.width) return null;
        const full = transposed ? magLabel(x) : data.samples[x].sampleId;
        // Account for the 45° rotation, glyph ascent/descent and the right edge.
        // Trim the string itself rather than slicing glyphs with an SVG clip.
        const available = Math.min((columnLabelBottom - py - 4) * Math.SQRT2 - columnMetrics.descent,
          (plot.left + plot.width - px - 4) * Math.SQRT2 - columnMetrics.ascent);
        const text = shortenChartLabel(full, available, columnMetrics.measure);
        if (!text) return null;
        return <text key={x} x={px} y={py} transform={`rotate(45 ${px} ${py})`} fill="currentColor" fontSize={fontSize - 1}>
          <title>{full}</title>{text}</text>;
      })}</g></>}
    </svg>
    {active && <div role="tooltip" className="mag-heatmap-tooltip" style={{ left: Math.max(4, Math.min(active.px + 14, dimensions.width - 365)), top: Math.max(4, Math.min(active.py + 14, dimensions.height - 190)) }}>
      <strong>{sample.sampleId} · {sample.disease} · Batch {sample.batch}</strong>
      年龄 {sample.age ?? '—'} · 性别 {sample.gender ?? '—'}<br />{id}<br />{model.features.get(id)?.taxonomyName}<br />
      原始丰度 {number(data.values[active.sample][active.mag])}{data.values[active.sample][active.mag] == null ? '' : '%'}<br />{model.z ? '按 MAG 标准化 Z-score' : 'log10(1 + 丰度%)'} {number(model.display[active.sample][active.mag])}{model.constant.has(id) && model.z ? '（无变异）' : ''}<br />点击查看该 MAG 分布与证据
    </div>}
    <HeatmapTransposeMotion view={view} surfaceRef={surfaceRef} matrixRef={matrixRef} movingRef={movingRef} />
  </>;
});

export default function MagZoomableHeatmap({ data, heatmapStyle, exportConfig, onSelect, toolbarTarget }) {
  const [exportStatus, setExportStatus] = useState('');
  const { palette, divergingPalette, annotations, demographics, labels, borders, dendrograms, font } = { ...HEATMAP_STYLE_DEFAULTS, ...heatmapStyle };
  const transposed = Boolean(heatmapStyle?.transposed);
  const visualStyle = useMemo(() => ({ palette, divergingPalette, annotations, demographics, labels, borders, dendrograms, font }),
    [palette, divergingPalette, annotations, demographics, labels, borders, dendrograms, font]);
  const model = useMemo(() => heatmapRenderModel(data, visualStyle), [data, visualStyle]);
  const previews = useMemo(() => [overviewImage(model), overviewImage(model, true)], [model]);
  const preview = previews[transposed ? 1 : 0];
  const world = useMemo(() => ({ width: (transposed ? data.magIds.length : data.samples.length) * CELL_W,
    height: (transposed ? data.samples.length : data.magIds.length) * CELL_H }), [data.samples.length, data.magIds.length, transposed]);
  const insets = useMemo(() => {
    const trees = heatmapTrees(data, { ...model.style, transposed });
    return { left: (model.style.labels ? 260 : 65) + (transposed && model.annotations.length ? model.annotations.length * 14 + 8 : 0) + (trees.left.length ? TREE_SPACE : 0),
      top: (transposed ? 61 : 61 + model.annotations.length * 14) + (trees.top.length ? TREE_SPACE : 0) };
  }, [data, model.style, model.annotations.length, transposed]);
  const actions = useMemo(() => [{ id: 'export', icon: 'export', label: exportConfig.title, disabled: exportStatus === '正在导出完整矩阵…',
    onClick: async () => {
      setExportStatus('正在导出完整矩阵…');
      // Supply the full sample axis to the shared export size calculation, independently of the camera.
      const ok = await exportEChart({ getWidth: () => 0, getHeight: () => 0,
        getOption: () => ({ xAxis: { data: transposed ? data.magIds : data.samples.map(sample => sample.sampleId) } }) }, exportConfig);
      setExportStatus(ok ? '完整矩阵已导出' : '导出失败，请重试或选择 SVG 格式');
    } }], [exportConfig, data.samples, data.magIds, transposed, exportStatus]);
  useChartFrameActions(actions);
  // Style edits and folding preserve the camera; a new matrix/order resets it.
  const resetKey = `${data.projectionFingerprint || ''}:${data.magIds.join('|')}:${data.samples.map(s => s.sampleId).join('|')}`;
  return <>{exportStatus && <p className="mag-muted" role="status">{exportStatus}</p>}<ZoomableChartViewport world={world} resetKey={resetKey} preview={preview.url} insets={insets} toolbarTarget={toolbarTarget}
    coordinateKey={transposed} remapCamera={transposeCamera} viewportHeight="clamp(480px, 65vh, 720px)" ariaLabel="MAG 热图">
    {viewport => <HeatmapSurface {...viewport} model={model} transposed={transposed} image={preview.image} onSelect={onSelect} />}
  </ZoomableChartViewport></>;
}
