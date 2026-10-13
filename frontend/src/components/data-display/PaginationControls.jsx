import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './data-query.css';

function clampPage(value, pageCount) {
  return Math.max(1, Math.min(pageCount, value));
}

export function buildPaginationItems(currentPage, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount]);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page > 1 && page < pageCount) pages.add(page);
  }
  if (currentPage <= 3) { pages.add(2); pages.add(3); }
  if (currentPage >= pageCount - 2) { pages.add(pageCount - 1); pages.add(pageCount - 2); }
  const sorted = [...pages].sort((left, right) => left - right);
  return sorted.flatMap((page, index) => index === 0 || page === sorted[index - 1] + 1 ? [page] : [`ellipsis-${sorted[index - 1]}-${page}`, page]);
}

export default function PaginationControls({ page, pageCount, onPageChange, disabled = false, ariaLabel = '分页' }) {
  const [draftPage, setDraftPage] = useState(String(page));
  const [openRange, setOpenRange] = useState(null);
  const navRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();
  const items = useMemo(() => buildPaginationItems(page, pageCount), [page, pageCount]);
  useEffect(() => { setDraftPage(String(page)); setOpenRange(null); }, [page, pageCount, disabled]);
  useEffect(() => {
    if (!openRange) return undefined;
    panelRef.current?.querySelector('button')?.focus();
    const dismiss = event => { if (!navRef.current?.contains(event.target)) setOpenRange(null); };
    const escape = event => { if (event.key === 'Escape') { setOpenRange(null); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [openRange]);
  if (pageCount <= 1) return null;
  const goToPage = nextPage => {
    if (disabled) return;
    setOpenRange(null);
    onPageChange(clampPage(nextPage, pageCount));
    requestAnimationFrame(() => navRef.current?.querySelector('[aria-current="page"]')?.focus());
  };
  const submitJump = event => {
    event.preventDefault();
    const target = Number(draftPage);
    if (Number.isInteger(target)) goToPage(target);
    else setDraftPage(String(page));
  };
  return <nav className="data-pagination" aria-label={ariaLabel} ref={navRef}>
    <button type="button" className="data-pagination__direction" aria-label="上一页" onClick={() => goToPage(page - 1)} disabled={disabled || page === 1}><span aria-hidden="true">‹</span><span className="data-pagination__direction-text">上一页</span></button>
    <div className="data-pagination__pages" aria-label="页码">
      {items.map(item => typeof item === 'number' ? <button type="button" key={item} className={item === page ? 'is-current' : ''} aria-current={item === page ? 'page' : undefined} aria-label={`第 ${item} 页`} onClick={() => goToPage(item)} disabled={disabled}>{item}</button>
        : <button type="button" key={item} className="data-pagination__ellipsis" aria-label="选择页码" title="选择页码" aria-haspopup="dialog" aria-controls={panelId} aria-expanded={openRange?.key === item} disabled={disabled}
          onClick={event => { triggerRef.current = event.currentTarget; const [, from, to] = item.split('-'); setOpenRange(current => current?.key === item ? null : { key: item, from: Number(from) + 1, to: Number(to) - 1 }); }}>…</button>)}
    </div>
    <button type="button" className="data-pagination__direction" aria-label="下一页" onClick={() => goToPage(page + 1)} disabled={disabled || page === pageCount}><span className="data-pagination__direction-text">下一页</span><span aria-hidden="true">›</span></button>
    {openRange ? <div className="data-pagination__picker" id={panelId} role="dialog" aria-label="选择页码" ref={panelRef}>
      <strong>选择页码</strong>
      <div className="data-pagination__page-grid">
        {Array.from({ length: Math.min(20, openRange.to - openRange.from + 1) }, (_, index) => openRange.from + index).map(value => <button type="button" key={value} aria-label={`第 ${value} 页`} onClick={() => goToPage(value)} disabled={disabled}>{value}</button>)}
      </div>
      <form className="data-pagination__jump" onSubmit={submitJump}>
        <label>跳转到（1–{pageCount}）<input type="number" inputMode="numeric" min="1" max={pageCount} step="1" required value={draftPage} aria-label="跳至页码" onChange={event => setDraftPage(event.target.value)} disabled={disabled} /></label>
        <button type="submit" aria-label="跳转" disabled={disabled}>跳转</button>
      </form>
    </div> : null}
  </nav>;
}
