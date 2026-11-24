import { memo, useId, useMemo } from 'react';
import { ticks } from 'd3';
import { PRESENCE_GEOMETRY, presencePalette, presenceState } from './magPresencePalette';
import { formatMagNumber } from './magDistributionView';
import {
  PHYLOGENY_BRANCH_COLOR, PHYLOGENY_LEAF_INSET_START, phylogenyBranchPath, phylogenyGeometry,
  phylogenyLeafColor, phylogenyTrackFill,
} from './magPhylogenySurfaceModel';

const TEXT_COLOR = '#43536a';
const TEXT_SIZE = 11;
const GRAPHIC_LINE = '#ced6df';
const KO_FIELD = { role: 'function' };
const LEAF_LABEL = id => id.replace(/__(CRR\d+)_cleanbin_/, ' · ');

function cellState(raw) {
  if (raw == null) return 'missing';
  return raw === 0 ? 'zero' : 'hit';
}

function TrackGlyph({ box, raw, preset, field = KO_FIELD, patternId, compact, size = Math.min(box.width, box.height) }) {
  const rect = <rect {...box} fill={phylogenyTrackFill(raw, field, preset)} />;
  if (compact || field.role === 'quality' || raw > 0) return rect;
  if (raw == null) return <>{rect}<rect {...box} fill={`url(#${patternId})`} pointerEvents="none" /></>;

  const scale = Math.min(size, 18) / 18;
  const strokeWidth = 2 * scale;
  const inset = 2.5 * scale + strokeWidth / 2;
  return <>{rect}
    <rect x={box.x + inset} y={box.y + inset} width={box.width - 2 * inset} height={box.height - 2 * inset}
      fill="none" stroke={preset.zeroStroke} strokeWidth={strokeWidth} pointerEvents="none" data-phylogeny-zero-outline />
  </>;
}

function PhylogenyLegend({ width, fontSize, preset, patternId }) {
  const columns = Math.max(1, Math.min(3, Math.floor((width - 24) / 108)));
  return <g aria-label="KO 轨道与质量图例" fontSize={Math.min(11, fontSize)}>
    {[1, 0, null].map((raw, i) => {
      const x = 14 + (i % columns) * 108, y = 6 + Math.floor(i / columns) * 20;
      return <g key={cellState(raw)} data-phylogeny-legend-state={cellState(raw)}>
        <TrackGlyph box={{ x, y, width: 18, height: 18 }} raw={raw} preset={preset} patternId={patternId} />
        <text x={x + 23} y={y + 9} dominantBaseline="middle" fill={TEXT_COLOR}>{presenceState(raw)}</text>
      </g>;
    })}
    {width >= 690 && <g fill={TEXT_COLOR} dominantBaseline="middle">
      <text x={340} y={16}>完整度 0–100% · 污染率色深上限 10%</text>
      <text x={340} y={32}>质量轨道使用百分比着色，灰色表示不可评价</text>
    </g>}
  </g>;
}

function PhylogenyScale({ layout, model, fontSize }) {
  const { xy, transposed, progressStart, treeEnd, leafExtent, progressAxis } = layout;
  const leafCoordinate = transposed ? PHYLOGENY_LEAF_INSET_START - 7 : PHYLOGENY_LEAF_INSET_START + leafExtent + 17;
  const [x1, y1] = xy(progressStart, leafCoordinate), [x2, y2] = xy(treeEnd, leafCoordinate);
  const label = model.mode === 'length' ? '累计原始分支长度' : '拓扑层级';
  const center = (progressStart + treeEnd) / 2;
  const [labelX, labelY] = xy(center, transposed ? 12 : leafCoordinate + 41);
  const values = model.maximum > 0
    ? ticks(0, model.maximum, Math.min(5, Math.max(2, Math.floor((treeEnd - progressStart) / 75)))).filter(value => model.mode === 'length' || Number.isInteger(value))
    : [0];
  return <g data-phylogeny-scale data-mode={model.mode} data-max={model.maximum} aria-label={label} fontSize={fontSize}>
    <line {...{ x1, y1, x2, y2 }} stroke={GRAPHIC_LINE} />
    {values.map(value => {
      const progress = progressAxis(value);
      const [labelX, labelY] = xy(progress, leafCoordinate + (transposed ? -8 : 18));
      const [x1, y1] = xy(progress, leafCoordinate), [x2, y2] = xy(progress, leafCoordinate + (transposed ? -4 : 4));
      return <g key={value} data-scale-value={value}>
        <line {...{ x1, y1, x2, y2 }} stroke={GRAPHIC_LINE} />
        <text x={labelX} y={labelY} textAnchor={transposed ? 'end' : 'middle'} dominantBaseline="middle" fill={TEXT_COLOR}>
          {formatMagNumber(value)}
        </text>
      </g>;
    })}
    <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fontWeight={500}
      fill={TEXT_COLOR} transform={transposed ? `rotate(-90 ${labelX} ${labelY})` : undefined}>{label}</text>
  </g>;
}

function TrackTitles({ model, layout, fontSize, trailing = false }) {
  const coordinate = trailing ? PHYLOGENY_LEAF_INSET_START + layout.leafExtent + 14
    : PHYLOGENY_LEAF_INSET_START - (layout.transposed ? 5 : 10);
  return <g fontSize={Math.min(fontSize, 11)} fill={TEXT_COLOR} fontWeight={600} data-phylogeny-track-titles>
    {model.fields.map((field, index) => {
      const [x, y] = layout.xy(layout.trackStart + layout.trackWidth * (index + .5), coordinate);
      return <text key={field.featureId} x={x} y={y} dominantBaseline="middle"
        textAnchor={layout.transposed ? trailing ? 'start' : 'end' : 'middle'}>{field.featureId}</text>;
    })}
  </g>;
}

const PhylogenyLeaves = memo(function PhylogenyLeaves({ model, layout, labels, leafColor, fontSize, hover }) {
  const { leafAxis, progressAxis, spacing, xy, treeEnd, readable, transposed } = layout;
  const dotRadius = Math.min(3, spacing * .38);
  return model.leaves.slice(layout.start, layout.end).map(leaf => {
    const v = leafAxis(leaf.position), u = progressAxis(leaf.coordinate);
    const [cx, cy] = xy(u, v);
    const [labelX, labelY] = xy(treeEnd + 8, v);
    const [x1, y1] = xy(u + 4, v), [x2, y2] = xy(treeEnd + 3, v);
    return <g key={leaf.magId} data-phylogeny-leaf data-mag-id={leaf.magId} data-leaf-index={leaf.position} data-coordinate={leaf.coordinate}
      data-distance={leaf.distance} data-depth={leaf.depth} role="button" tabIndex={leaf.position === layout.start ? 0 : -1}
      aria-label={`查看 MAG ${leaf.magId}`}>
      {hover && <title>{leaf.magId}</title>}
      {readable && x2 + y2 > x1 + y1 && <line {...{ x1, y1, x2, y2 }} strokeDasharray="2 3" stroke={GRAPHIC_LINE} strokeWidth={.75} />}
      <circle cx={cx} cy={cy} r={dotRadius} fill={leafColor} />
      {labels && readable && <text data-phylogeny-leaf-label x={labelX} y={labelY}
        transform={transposed ? `rotate(90 ${labelX} ${labelY})` : undefined}
        dominantBaseline="middle" fill={TEXT_COLOR} fontSize={fontSize}>{LEAF_LABEL(leaf.magId)}</text>}
    </g>;
  });
});

const PhylogenyTrackCells = memo(function PhylogenyTrackCells({ model, layout, hover, palette, patternId, cellStart, cellEnd }) {
  const { leafAxis, spacing, box, trackStart, trackWidth, readable } = layout;
  const padding = readable ? .2 : 0;
  const size = Math.min(spacing, trackWidth);
  return model.leaves.slice(cellStart, cellEnd).flatMap(leaf => model.fields.map((field, index) => {
    const shape = box(trackStart + index * trackWidth + padding, leafAxis(leaf.position) - spacing / 2 + padding,
      trackWidth - 2 * padding, spacing - 2 * padding);
    const raw = leaf.values[index], quality = field.role === 'quality';
    const title = quality ? `${leaf.magId}\n${field.featureId} ${raw == null ? '不可评价' : formatMagNumber(raw)}`
      : `${leaf.magId}\n${field.featureId}\n${presenceState(raw)}\n原始注释基因计数 ${raw == null ? '不可评价' : raw}`;
    return <g key={`${leaf.position}:${index}`} data-phylogeny-cell data-mag-id={leaf.magId} data-leaf-index={leaf.position}
      data-track-role={field.role} data-feature-id={field.featureId} data-track-index={index} data-raw-count={raw ?? ''}
      data-track-state={quality && raw != null ? 'continuous' : cellState(raw)} role="button" tabIndex={-1} aria-label={title.replaceAll('\n', ' · ')}>
      {hover && <title>{title}</title>}
      <TrackGlyph box={shape} raw={raw} field={field} preset={palette} patternId={patternId} compact={!readable} size={size} />
    </g>;
  }));
});

export default memo(function MagPhylogenySurface({
  model, width, height, start = 0, end = model.leaves.length, transposed = false, fontSize = TEXT_SIZE, labels = true,
  cellStart = start, cellEnd = end,
  branchStyle = 'rounded', leafColor = 'mist-blue', presencePalette: presetName, hover = true, onSelect, ref,
}) {
  const id = useId().replaceAll(':', '');
  const patternId = `phylogeny-pattern-${id}`, clipId = `phylogeny-branches-${id}`;
  const layout = useMemo(() => phylogenyGeometry(model, { width, height, start, end, transposed, fontSize }),
    [model, width, height, start, end, transposed, fontSize]);
  const branches = useMemo(() => phylogenyBranchPath(model, layout, branchStyle), [model, layout, branchStyle]);
  const preset = presencePalette({ presencePalette: presetName });
  const clip = layout.box(0, PHYLOGENY_LEAF_INSET_START, transposed ? height : width, layout.leafExtent);
  const { stripeStep, stripeWidth } = PRESENCE_GEOMETRY;
  const datumElement = event => event.target.closest?.('[data-phylogeny-leaf],[data-phylogeny-cell]');
  const select = event => {
    const target = datumElement(event);
    if (!target) return;
    const leaf = model.leaves[Number(target.dataset.leafIndex)];
    if (target.hasAttribute('data-phylogeny-leaf')) {
      onSelect?.({ magId: leaf.magId, role: 'leaf' });
    } else {
      const trackIndex = Number(target.dataset.trackIndex), field = model.fields[trackIndex];
      onSelect?.({ magId: leaf.magId, role: field.role, featureId: field.role === 'function' ? field.featureId : '',
        name: field.name, rawCount: leaf.values[trackIndex] });
    }
  };
  function handleKeys(event) {
    const target = datumElement(event);
    if (!target) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(event);
      return;
    }
    const [previousLeaf, nextLeaf, previousTrack, nextTrack] = transposed
      ? ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
      : ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    let leaf = Number(target.dataset.leafIndex), track = Number(target.dataset.trackIndex ?? -1);
    switch (event.key) {
      case previousLeaf: leaf = Math.max(start, leaf - 1); break;
      case nextLeaf: leaf = Math.min(end - 1, leaf + 1); break;
      case previousTrack: track = Math.max(-1, track - 1); break;
      case nextTrack: track = Math.min(model.fields.length - 1, track + 1); break;
      case 'Home': leaf = start; break;
      case 'End': leaf = end - 1; break;
      default: return;
    }
    event.preventDefault();
    const item = track < 0 ? 'data-phylogeny-leaf' : `data-track-index="${track}"`;
    const targetIndex = `[data-leaf-index="${leaf}"]`;
    const next = event.currentTarget.querySelector(`[${item}]${targetIndex}`)
      || event.currentTarget.querySelector(`[data-phylogeny-leaf]${targetIndex}`);
    next?.focus();
  }
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
    role="group" aria-label="MAG 系统发育及功能轨道" data-phylogeny-surface data-leaf-start={start} data-leaf-end={end}
    data-leaf-count={model.leaves.length} data-leaf-spacing={layout.spacing} data-transposed={transposed} data-branch-style={branchStyle}
    data-track-window-start={cellStart} data-track-window-end={cellEnd}
    style={{ display: 'block', flexShrink: 0, fontFamily: 'system-ui, sans-serif', background: '#fff' }}
    onClick={select} onKeyDown={handleKeys}>
    <style>{`
      [data-phylogeny-leaf]:focus-visible > circle,
      [data-phylogeny-cell]:focus-visible > rect:first-of-type {
        stroke: #242d39;
        stroke-width: 1.5px;
      }
    `}</style>
    <defs>
      <clipPath id={clipId}><rect {...clip} /></clipPath>
      <pattern id={patternId} width={stripeStep} height={stripeStep} patternUnits="userSpaceOnUse">
        <path stroke={preset.stripe} strokeWidth={stripeWidth} fill="none"
          d={`M-2,2L2,-2 M-2,${stripeStep + 2}L${stripeStep + 2},-2 M${stripeStep - 2},${stripeStep + 2}L${stripeStep + 2},${stripeStep - 2}`} />
      </pattern>
    </defs>
    <rect width={width} height={height} fill="#fff" pointerEvents="none" />
    <PhylogenyLegend width={width} fontSize={Number(fontSize)} preset={preset} patternId={patternId} />
    <TrackTitles {...{ model, layout, fontSize: Number(fontSize) }} />
    <path data-phylogeny-branches d={branches} fill="none" stroke={PHYLOGENY_BRANCH_COLOR}
      strokeWidth={layout.readable ? .9 : .5} strokeLinecap="round" clipPath={`url(#${clipId})`} pointerEvents="none" />
    <g style={{ cursor: 'pointer' }}>
      <PhylogenyLeaves {...{ model, layout, labels, fontSize: Number(fontSize), hover }} leafColor={phylogenyLeafColor(leafColor)} />
      <PhylogenyTrackCells {...{ model, layout, hover, patternId, cellStart, cellEnd }} palette={preset} />
    </g>
    {layout.leafExtent > 600 && <TrackTitles {...{ model, layout, fontSize: Number(fontSize) }} trailing />}
    <PhylogenyScale {...{ model, layout }} fontSize={Math.min(Number(fontSize), TEXT_SIZE)} />
  </svg>;
});
