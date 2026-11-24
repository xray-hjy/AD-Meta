import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ChartNavigationDock from '../../components/Charts/ChartNavigationDock';
import ChartStyleToolbar from '../../components/Charts/ChartStyleToolbar';
import { useChartFrameActions, useChartFrameToolbarTarget } from '../../components/Charts/ChartFrameActionsContext';
import useChartStylePreferences from '../../components/Charts/useChartStylePreferences';
import { pageChartGeometry } from '../../components/Charts/taxonomy/TaxonomyPageOverview';
import '../../components/Charts/chart-zoom.css';
import { PRESENCE_PALETTES } from './magPresencePalette';
import MagPhylogenySurface from './MagPhylogenySurface';
import MagPhylogenyRange from './MagPhylogenyRange';
import { buildPhylogenyModel, phylogenyMinLeafSpacing, phylogenyPreview, PHYLOGENY_LEAF_COLORS, PHYLOGENY_LEAF_INSET_START } from './magPhylogenySurfaceModel';
import { centeredLeafRange, clamp, leafCapacity, PHYLOGENY_LEAF_INSETS, phylogenyDrawing, phylogenyTrackWindow } from './magPhylogenyNavigation';
import { exportPhylogeny } from './magPhylogenyExport';
import './mag-phylogeny-tracks.css';

const INITIAL_VIEW = { height: 'auto', fit: false, transposed: false, scale: 1, range: [0, 1] };
const HEIGHTS = [{ value: 'auto', label: '自动' }, ...[1000, 1400, 2000].map(value => ({ value: String(value), label: `${value} px` }))];
const BRANCH_STYLES = [{ value: 'rounded', label: '圆角' }, { value: 'orthogonal', label: '直角' }, { value: 'diagonal', label: '斜线' }];
const FIELDS = [
  { key: 'height', label: '画布高度', options: HEIGHTS },
  { key: 'transposed', label: '交换横纵轴', type: 'toggle' },
  { key: 'branchStyle', label: '枝线样式', options: BRANCH_STYLES },
  { key: 'leafColor', label: '叶节点颜色', type: 'palette', options: PHYLOGENY_LEAF_COLORS },
  { key: 'presencePalette', label: 'KO 轨道配色', type: 'palette', options: PRESENCE_PALETTES },
  { key: 'labels', label: '标签', type: 'switch' },
  { key: 'fontSize', label: '字号', options: [{ value: '10', label: '小' }, { value: '11', label: '中' }, { value: '13', label: '大' }, { value: '16', label: '特大' }], more: true },
  { key: 'hover', label: '悬浮', type: 'switch', more: true },
];
const DEFAULT_STYLE = { branchStyle: 'rounded', leafColor: PHYLOGENY_LEAF_COLORS[0].value, presencePalette: PRESENCE_PALETTES[0].value, labels: true, hover: true, fontSize: '11' };

function chartFrame(svg) {
  const frame = pageChartGeometry(svg);
  const bar = svg.closest('.result-section')?.querySelector(':scope > .result-section__bar')?.getBoundingClientRect();
  const outerTop = frame.verticalScroller === window ? 0 : Math.max(0, frame.verticalScroller.getBoundingClientRect().top);
  const top = Math.min(frame.clip.bottom, Math.max(frame.clip.top, bar?.bottom ?? 0));
  return { ...frame, pageTop: outerTop + (bar?.height ?? 0), clip: { ...frame.clip, top }, visible: { ...frame.visible,
    y: clamp(top - frame.rect.top, 0, frame.world.height), height: Math.max(0, Math.min(frame.rect.bottom, frame.clip.bottom) - Math.max(frame.rect.top, top)) } };
}

export default function MagPhylogenyTracks({ data, mode, onSelect }) {
  const [view, setView] = useState(INITIAL_VIEW);
  const [hostWidth, setHostWidth] = useState(815);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [frame, setFrame] = useState(null);
  const [panMode, setPanMode] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState(null);
  const [exportStatus, setExportStatus] = useState('');
  const stageRef = useRef(null), scrollRef = useRef(null), svgRef = useRef(null);
  const selectedLeaf = useRef(null), pendingAnchor = useRef(null), savedFitAnchor = useRef(null);
  const drag = useRef(null), suppressClick = useRef(false), fractionalPan = useRef(0);
  const toolbarTarget = useChartFrameToolbarTarget();
  const preferences = useChartStylePreferences('mag-phylogeny-tracks');
  const style = useMemo(() => ({ ...DEFAULT_STYLE, ...preferences.values }), [preferences.values]);
  const model = useMemo(() => buildPhylogenyModel(data, mode), [data, mode]);
  const indices = useMemo(() => new Map(model.leaves.map((leaf, index) => [leaf.magId, index])), [model]);
  const count = model.leaves.length;
  const transposed = view.transposed;
  const hasSideRange = !transposed && !view.fit && view.height !== 'auto';
  const minSpacing = phylogenyMinLeafSpacing(style.fontSize);
  const drawing = phylogenyDrawing(count, view, minSpacing, hostWidth, viewportHeight);
  const { width, height, start, end, step, world, policy, capacity } = drawing;
  const axis = transposed ? 'x' : 'y';
  const extent = transposed ? 'width' : 'height';

  const measure = useCallback(() => {
    if (!svgRef.current || !stageRef.current || !scrollRef.current) return;
    if (scrollRef.current.clientWidth) setHostWidth(scrollRef.current.clientWidth);
    setViewportHeight(window.innerHeight);
    const measured = chartFrame(svgRef.current);
    const stageBox = stageRef.current.getBoundingClientRect();
    const scrollBottom = measured.verticalScroller === window
      ? window.innerHeight : Math.min(window.innerHeight, measured.verticalScroller.getBoundingClientRect().bottom);
    // Keep the pointer coordinate frame stationary while a minimap drag scrolls a tall tree.
    const long = measured.world.height > scrollBottom - measured.clip.top;
    const bottom = long ? scrollBottom : Math.min(scrollBottom, measured.rect.bottom);
    setNavigationTarget(previous => previous ?? stageRef.current?.closest('.app') ?? document.body);
    const next = { visible: measured.visible,
      dockBottom: Math.max(8, window.innerHeight - bottom + 10),
      dockRight: Math.max(8, window.innerWidth - Math.min(stageBox.right, measured.clip.right) + 10),
      railTop: Math.max(0, Math.max(measured.clip.top, measured.rect.top) - stageBox.top),
      visibleStageWidth: scrollRef.current.clientWidth };
    setFrame(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);

  useEffect(() => {
    let pending;
    const schedule = () => {
      if (pending != null) return;
      pending = requestAnimationFrame(() => { pending = null; measure(); });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(scrollRef.current);
    observer.observe(svgRef.current);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (pending != null) cancelAnimationFrame(pending);
    };
  }, [measure]);

  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    if (!anchor || !svgRef.current || !scrollRef.current) return;
    pendingAnchor.current = null;
    const { clip, pageTop, rect, verticalScroller } = chartFrame(svgRef.current);
    const axisOrigin = PHYLOGENY_LEAF_INSET_START + (anchor.index - start) * step;
    const place = anchor.offset ?? (transposed ? clip.right - clip.left : clip.bottom - clip.top) / 2;
    const target = anchor.alignTop ? 0 : Math.max(0, axisOrigin - place);
    if (transposed) {
      scrollRef.current.scrollLeft = target;
      if (anchor.alignTop || rect.bottom < clip.top + 100 || rect.top > clip.bottom - 100) verticalScroller.scrollBy({ top: rect.top - pageTop, behavior: 'instant' });
    } else {
      if (anchor.alignTop) scrollRef.current.scrollLeft = 0;
      verticalScroller.scrollBy({ top: rect.top - (anchor.alignTop ? pageTop : clip.top) + target, behavior: 'instant' });
    }
  }, [view, width, height, start, step, transposed]);

  const visible = frame?.visible ?? { x: 0, y: 0, width: Math.min(width, hostWidth), height: Math.min(height, viewportHeight) };
  const visibleStart = clamp(start + Math.floor((visible[axis] - PHYLOGENY_LEAF_INSET_START) / step), start, end);
  const visibleEnd = clamp(start + Math.ceil((visible[axis] + visible[extent] - PHYLOGENY_LEAF_INSET_START) / step), visibleStart, end);
  const previewVisible = { ...visible, [axis]: visible[axis] + start * step };
  const [cellStart, cellEnd] = policy === 'auto' ? phylogenyTrackWindow(start, end, visibleStart, visibleEnd) : [start, end];

  function anchorFromFrame() {
    const box = svgRef.current ? chartFrame(svgRef.current).visible : visible;
    const localStart = start + (box[axis] - PHYLOGENY_LEAF_INSET_START) / step;
    const last = selectedLeaf.current;
    const selectedIsVisible = last != null && last >= localStart && last < localStart + box[extent] / step;
    return { index: selectedIsVisible ? last + .5 : clamp(localStart + box[extent] / step / 2, start + .5, end - .5) };
  }

  function changeView(next, anchor = anchorFromFrame()) {
    pendingAnchor.current = anchor;
    fractionalPan.current = 0;
    setView({ ...view, ...next });
  }

  function setRange(range) {
    setView(current => current.range[0] === range[0] && current.range[1] === range[1] ? current : { ...current, range });
  }

  function changeStyle(key, value) {
    if (key === 'height') {
      const anchor = anchorFromFrame();
      const next = { height: value, fit: false };
      if (value !== 'auto') {
        const viewCap = leafCapacity(count, Number(value), minSpacing);
        const zoomed = policy === 'fixed' && end - start < capacity;
        const desired = zoomed ? Math.round((Number(value) - PHYLOGENY_LEAF_INSETS) / step) : viewCap;
        next.range = centeredLeafRange(count, Math.min(viewCap, desired), anchor.index);
      }
      changeView(next, anchor);
    } else if (key === 'transposed') {
      const anchor = anchorFromFrame();
      changeView({ transposed: value, ...(policy === 'fixed' ? { range: centeredLeafRange(count, end - start, anchor.index) } : {}) }, anchor);
    } else if (key === 'fontSize') {
      const anchor = anchorFromFrame();
      const next = policy === 'fixed' ? centeredLeafRange(count, Math.min(end - start,
        leafCapacity(count, Number(view.height), phylogenyMinLeafSpacing(value))), anchor.index) : view.range;
      preferences.update(key, value);
      changeView({ range: next }, anchor);
    } else preferences.update(key, value);
  }

  function toggleFit() {
    if (view.fit) { changeView({ fit: false }, savedFitAnchor.current ?? anchorFromFrame()); return; }
    savedFitAnchor.current = anchorFromFrame();
    changeView({ fit: true }, { index: .5, alignTop: true });
  }

  function actualSize() {
    const anchor = view.fit ? savedFitAnchor.current ?? anchorFromFrame() : anchorFromFrame();
    const fittedRange = view.height === 'auto' ? view.range
      : centeredLeafRange(count, leafCapacity(count, Number(view.height), minSpacing), anchor.index);
    changeView({ scale: 1, fit: false, range: fittedRange }, anchor);
  }

  function goOverview() {
    changeView({ height: 'auto', scale: 1, fit: false }, { index: .5, alignTop: true });
  }

  const navigate = (x, y) => {
    if (!svgRef.current || !scrollRef.current) return;
    const current = chartFrame(svgRef.current);
    let localX = x, localY = y;
    if (policy === 'fixed') {
      const projected = transposed ? x : y;
      const offset = projected - current.visible[axis];
      const range = centeredLeafRange(count, end - start, offset / step + (end - start) / 2);
      setRange(range);
      if (transposed) localX -= range[0] * step;
      else localY -= range[0] * step;
    }
    scrollRef.current.scrollLeft = localX;
    const target = clamp(localY, 0, Math.max(0, height - current.visible.height));
    if (Math.abs(target - current.visible.y) > .5) current.verticalScroller.scrollBy({ top: current.rect.top - current.clip.top + target, behavior: 'instant' });
  };

  const pan = (dx, dy) => {
    if (policy !== 'fixed') { navigate(previewVisible.x + dx, previewVisible.y + dy); return; }
    fractionalPan.current += transposed ? dx : dy;
    const rows = Math.trunc(fractionalPan.current / step);
    fractionalPan.current -= rows * step;
    const shift = rows * step;
    navigate(previewVisible.x + (transposed ? shift : dx), previewVisible.y + (transposed ? dy : shift));
  };

  useEffect(() => {
    const node = scrollRef.current;
    const onWheel = event => {
      if (!event.altKey || event.deltaY === 0 || !svgRef.current) return;
      event.preventDefault();
      const { rect, clip } = chartFrame(svgRef.current);
      const pointer = transposed ? event.clientX : event.clientY;
      const local = pointer - (transposed ? rect.left : rect.top);
      const index = clamp(start + (local - PHYLOGENY_LEAF_INSET_START) / step, start + .5, end - .5);
      const anchor = { index, offset: pointer - (transposed ? clip.left : clip.top) };
      const factor = event.deltaY > 0 ? 1.22 : 1 / 1.22;
      if (policy === 'auto') {
        const scale = clamp(view.scale / factor, 1, 3);
        if (scale === view.scale) return;
        pendingAnchor.current = anchor;
        setView({ ...view, scale });
      } else if (policy === 'fixed') {
        const previous = end - start;
        const next = clamp(Math.round(previous * factor + (event.deltaY > 0 ? .5 : -.5)), 1, capacity);
        const fraction = clamp((index - start) / previous, 0, 1);
        setView({ ...view, range: centeredLeafRange(count, next, index, fraction) });
      } else if (event.deltaY < 0) {
        const readableRows = leafCapacity(count, Number(view.height), minSpacing);
        pendingAnchor.current = anchor;
        setView({ ...view, fit: false, range: view.height === 'auto' ? view.range : centeredLeafRange(count, readableRows, index) });
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [axis, capacity, count, end, minSpacing, policy, start, step, transposed, view]);

  const select = useCallback(cell => {
    selectedLeaf.current = indices.get(cell.magId);
    onSelect?.(cell);
  }, [indices, onSelect]);

  const surface = useMemo(() => ({ model, transposed, ...style }), [model, transposed, style]);
  const preview = useMemo(() => phylogenyPreview(model, { ...surface, width: world.width, height: world.height }), [model, surface, world.width, world.height]);
  const actions = useMemo(() => [{ id: 'export', icon: 'export', label: '导出图像', supportsCustomSize: true,
    suggestedSize: { width: clamp(Math.ceil(world.width), 640, 60000), height: clamp(Math.ceil(world.height), 420, 60000) },
    disabled: exportStatus === '正在导出…', onClick: async settings => {
      setExportStatus('正在导出…');
      try { await exportPhylogeny(`MAG-${data.id || 'tree'}-${data.projectionFingerprint?.slice(0, 12) || 'tracks'}`, surface, settings); setExportStatus('图像已导出'); }
      catch { setExportStatus('导出失败，请重试'); }
    } }], [data.id, data.projectionFingerprint, exportStatus, surface, world.width, world.height]);
  useChartFrameActions(actions);

  const tools = <div className="mag-phylogeny-tools">
    <ChartStyleToolbar fields={FIELDS} values={{ ...style, height: view.height, transposed }} onChange={changeStyle}
      onReset={() => { preferences.reset(); changeView(INITIAL_VIEW, { index: .5, alignTop: true }); }} />
    <div className="mag-phylogeny-layout-actions" role="group" aria-label="树图浏览方式">
      <button type="button" className="analysis-button" aria-pressed={view.fit} onClick={toggleFit}>适应一屏</button>
      <button type="button" className="analysis-button" onClick={actualSize}>1:1</button>
      <button type="button" className="analysis-button" onClick={goOverview}>全树总览</button>
    </div>
  </div>;
  const canPan = { left: previewVisible.x > 1, right: previewVisible.x + previewVisible.width < world.width - 1,
    up: previewVisible.y > 1, down: previewVisible.y + previewVisible.height < world.height - 1 };
  const renderRange = rangeStyle => <MagPhylogenyRange count={count} start={start} end={end} capacity={capacity}
    onChange={setRange} transposed={transposed} style={rangeStyle} />;
  return <div className="mag-phylogeny-tracks" data-phylogeny-policy={policy} data-phylogeny-capacity={capacity}
    data-visible-start={visibleStart} data-visible-end={visibleEnd}>
    {toolbarTarget ? createPortal(tools, toolbarTarget) : tools}
    <p className="mag-phylogeny-scope">{policy === 'fixed' ? `叶节点 ${start + 1}–${end} / ${count} · 最多 ${capacity} 个` :
      policy === 'fit' ? `适应一屏 · 全部 ${count} 个叶节点` : `自动展开 · 全部 ${count} 个叶节点 · ${transposed ? '横向滚动' : '页面滚动'}`}
      {exportStatus && <span role="status">{exportStatus}</span>}</p>
    <div ref={stageRef} className={`mag-phylogeny-stage${hasSideRange ? ' mag-phylogeny-stage--rail' : ''}`}>
      <div ref={scrollRef} className={`mag-phylogeny-scroll${panMode ? ' is-panning' : ''}`} tabIndex={0} role="group" aria-label="MAG 系统发育树与功能轨道"
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
          if (direction) { event.preventDefault(); pan(direction[0] * step * 3, direction[1] * step * 3); }
        }}
        onPointerDownCapture={event => {
          suppressClick.current = false;
          if (event.button !== 0 || (!event.altKey && !panMode)) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY };
          suppressClick.current = true;
        }} onPointerMove={event => {
          if (!drag.current) return;
          pan(drag.current.x - event.clientX, drag.current.y - event.clientY);
          drag.current = { x: event.clientX, y: event.clientY };
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onClickCapture={event => { if (suppressClick.current && event.detail > 0) { event.stopPropagation(); suppressClick.current = false; } }}>
        <MagPhylogenySurface ref={svgRef} {...surface} width={width} height={height} start={start} end={end}
          cellStart={cellStart} cellEnd={cellEnd} onSelect={select} />
      </div>
      {hasSideRange && renderRange({ top: (frame?.railTop ?? 0) + 12, height: Math.max(96, Math.min(480, (visible.height || height) - 24)) })}
    </div>
    {navigationTarget && createPortal(<ChartNavigationDock world={world} visible={previewVisible} preview={preview} stretch onNavigate={navigate} onPan={pan} canPan={canPan}
        open={navigationOpen} onOpenChange={setNavigationOpen} panMode={panMode} onTogglePan={() => setPanMode(current => !current)} viewport={visible}
        style={{ position: 'fixed', zIndex: 8, transition: 'none', bottom: frame?.dockBottom ?? 8, right: frame?.dockRight ?? 8,
          width: Math.min(304, Math.max(140, (frame?.visibleStageWidth ?? width) - 24)), display: frame && (visible.height < 74 || visible.width < 140) ? 'none' : undefined }} />, navigationTarget)}
    {transposed && policy === 'fixed' && renderRange()}
  </div>;
}
