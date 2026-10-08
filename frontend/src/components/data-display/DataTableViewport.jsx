import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './data-query.css';

export const QUERY_TABLE_PAGE_SIZE = 300;
const DEFAULT_ROWS = 20;

function scrollParents(element) {
  const parents = [];
  const root = document.scrollingElement || document.documentElement;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent !== root && parent !== document.body && /(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) parents.push(parent);
  }
  parents.push(root);
  return parents;
}

const scrollPosition = parents => parents.reduce((total, parent) => total + parent.scrollTop, 0);
const dragHeight = drag => drag.height + drag.currentY - drag.y + scrollPosition(drag.parents) - drag.scrollStart + drag.extra;

function cancelDrag(ref) {
  if (ref.current?.frame != null) cancelAnimationFrame(ref.current.frame);
  ref.current = null;
}

export default function DataTableViewport({
  ariaLabel,
  children,
  className = '',
  footer = null,
  description = null,
  maxHeight,
  resizable = false,
  pagination = null,
  pageKey,
}) {
  const viewportRef = useRef(null);
  const tableRef = useRef(null);
  const dragRef = useRef(null);
  const viewportId = useId();
  const [maximumRows, setMaximumRows] = useState(QUERY_TABLE_PAGE_SIZE);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rowHeights, setRowHeights] = useState([]);
  const [viewportPadding, setViewportPadding] = useState(2);
  const [headerHeight, setHeaderHeight] = useState(36);
  useLayoutEffect(() => {
    if (!resizable) return undefined;
    const table = tableRef.current;
    const measure = () => {
      const top = table.getBoundingClientRect().top;
      const headerHeight = table.tHead?.getBoundingClientRect().height || 36;
      setHeaderHeight(headerHeight);
      const rows = Array.from(table.querySelectorAll('tbody > tr')).slice(0, QUERY_TABLE_PAGE_SIZE);
      const heights = rows.map((row, index) => row.getBoundingClientRect().bottom - top || headerHeight + (index + 1) * 36);
      setRowHeights(previous => previous.length === heights.length && previous.every((height, index) => height === heights[index]) ? previous : heights);
      setViewportPadding(Math.max(2, viewportRef.current.offsetHeight - viewportRef.current.clientHeight));
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(table);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [children, resizable]);
  useEffect(() => { if (viewportRef.current) viewportRef.current.scrollTop = 0; }, [pageKey]);
  useEffect(() => {
    const stop = event => {
      const drag = dragRef.current;
      if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
      cancelDrag(dragRef);
      setDragging(false);
      if (drag.grip.hasPointerCapture?.(drag.pointerId)) drag.grip.releasePointerCapture(drag.pointerId);
    };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelDrag(dragRef);
      window.removeEventListener('blur', stop);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => { cancelDrag(dragRef); setDragging(false); }, [pageKey, resizable]);
  const visibleRows = Math.min(rowHeights.length, expanded ? maximumRows : DEFAULT_ROWS);
  const viewportHeight = rowHeights[visibleRows - 1];
  const classes = ['data-table-viewport', className].filter(Boolean).join(' ');
  const style = resizable
    ? { '--data-table-header-height': `${headerHeight}px`, maxHeight: 'none', height: viewportHeight ? `${viewportHeight + viewportPadding}px` : undefined }
    : maxHeight
    ? { '--data-table-viewport-max-height': typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
    : undefined;

  const table = (
    <div
      id={viewportId}
      ref={viewportRef}
      className={classes}
      role="region"
      tabIndex={0}
      aria-label={ariaLabel}
      style={style}
      data-visible-rows={resizable ? visibleRows : undefined}
    >
      <table ref={tableRef} className="data-table">{children}</table>
      {footer ? <div className="data-table-viewport__footer">{footer}</div> : null}
    </div>
  );
  if (!resizable) return table;

  const setMaximum = value => {
    setMaximumRows(Math.max(DEFAULT_ROWS, Math.min(QUERY_TABLE_PAGE_SIZE, value)));
    setExpanded(true);
  };
  const startDrag = event => {
    if (event.button !== 0 || rowHeights.length <= DEFAULT_ROWS) return;
    cancelDrag(dragRef);
    const parents = scrollParents(event.currentTarget);
    const drag = {
      y: event.clientY, currentY: event.clientY, height: viewportHeight,
      parents, scrollStart: scrollPosition(parents), extra: 0, active: false,
      grip: event.currentTarget, pointerId: event.pointerId, lastTime: null, frame: null,
    };
    const resize = () => {
      const targetHeight = dragHeight(drag);
      const nearest = rowHeights.reduce((best, height, index) => Math.abs(height - targetHeight) < Math.abs(rowHeights[best] - targetHeight) ? index : best, 0);
      setMaximum(nearest + 1);
    };
    drag.resize = resize;
    const tick = time => {
      if (dragRef.current !== drag) return;
      const elapsed = Math.min(32, drag.lastTime == null ? 16 : time - drag.lastTime) / 1000;
      drag.lastTime = time;
      if (drag.active) {
        let top = 0;
        let bottom = window.innerHeight;
        for (const parent of parents) {
          if (parent === document.documentElement || parent === document.body) continue;
          const rect = parent.getBoundingClientRect();
          top = Math.max(top, rect.top + parent.clientTop);
          bottom = Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight);
        }
        const edge = Math.min(72, (bottom - top) / 3);
        const direction = drag.currentY > bottom - edge ? 1 : drag.currentY < top + edge ? -1 : 0;
        if (direction && edge > 0) {
          const proximity = Math.min(1, Math.max(0, direction > 0 ? (drag.currentY - bottom + edge) / edge : (top + edge - drag.currentY) / edge));
          const distance = (100 + 700 * proximity * proximity) * (direction > 0 ? 2 : 1) * elapsed;
          const height = dragHeight(drag);
          const limit = direction > 0 ? rowHeights.at(-1) : rowHeights[DEFAULT_ROWS - 1];
          // Advance the resize even at the page's current bottom. Newly added rows
          // create scroll room on the next frame; compensate for actual scrolling.
          drag.extra += direction * Math.min(distance, Math.max(0, direction * (limit - height)));
          resize();
          const gripRect = drag.grip.getBoundingClientRect();
          const anchor = Math.max(top + gripRect.height / 2, Math.min(bottom - gripRect.height / 2, drag.currentY));
          let remaining = Math.min(distance, Math.max(0, direction * ((gripRect.top + gripRect.bottom) / 2 - anchor)));
          for (const parent of parents) {
            if (remaining <= 0) break;
            const before = parent.scrollTop;
            const max = Math.max(0, parent.scrollHeight - parent.clientHeight);
            parent.scrollTop = Math.max(0, Math.min(max, before + direction * remaining));
            const moved = parent.scrollTop - before;
            drag.extra -= moved;
            remaining -= Math.abs(moved);
          }
        }
      }
      drag.frame = requestAnimationFrame(tick);
    };
    dragRef.current = drag;
    drag.frame = requestAnimationFrame(tick);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = event => {
    const drag = dragRef.current;
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    drag.currentY = event.clientY;
    if (!drag.active && Math.abs(event.clientY - drag.y) < 3) return;
    drag.active = true;
    setDragging(true);
    drag.resize();
  };
  const finishDrag = event => {
    if (event.pointerId != null && dragRef.current?.pointerId !== event.pointerId) return;
    cancelDrag(dragRef);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const adjustMaximum = event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setMaximum(event.key === 'Home' ? DEFAULT_ROWS : event.key === 'End' ? QUERY_TABLE_PAGE_SIZE : maximumRows + (event.key === 'ArrowDown' ? 1 : -1) * (event.shiftKey ? 10 : 1));
  };
  const expansionLabel = expanded ? '收起至20行' : `展开至${Math.min(maximumRows, rowHeights.length)}行`;
  return <div className={`data-query-table${dragging ? ' is-resizing' : ''}`}>
    {table}
    {description ? <div className="data-query-table__description">{description}</div> : null}
    <div className="data-query-table__bar">
      <div className="data-query-table__resize">
        <div className="data-query-table__handles">
          <button type="button" className="data-query-table__grip" aria-label="拖动设置最大展示行数" title="向下拖动设置最大展示行数，上限300行；方向键微调" disabled={rowHeights.length <= DEFAULT_ROWS}
            aria-controls={viewportId} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag} onKeyDown={adjustMaximum}><span /></button>
          <button type="button" className="data-query-table__expand" aria-label={expansionLabel} title={expansionLabel} aria-controls={viewportId} aria-expanded={expanded}
            disabled={Math.min(maximumRows, rowHeights.length) <= DEFAULT_ROWS} onClick={() => { setExpanded(value => !value); viewportRef.current.scrollTop = 0; }}><span className={expanded ? 'is-expanded' : ''} aria-hidden="true" /></button>
        </div>
        {dragging ? <span className="data-query-table__hint">最大展示 {maximumRows} 行</span> : null}
      </div>
      {pagination ? <div className="data-query-table__pagination">{pagination}</div> : null}
    </div>
  </div>;
}
