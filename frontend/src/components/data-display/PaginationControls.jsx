import { useEffect, useMemo, useState } from 'react';

function clampPage(value, pageCount) {
  return Math.max(1, Math.min(pageCount, value));
}

export function buildPaginationItems(currentPage, pageCount) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([1, pageCount]);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page > 1 && page < pageCount) pages.add(page);
  }
  if (currentPage <= 3) pages.add(2);
  if (currentPage >= pageCount - 2) pages.add(pageCount - 1);

  const sorted = [...pages].sort((left, right) => left - right);
  return sorted.flatMap((page, index) => {
    if (index === 0 || page === sorted[index - 1] + 1) return [page];
    return [`ellipsis-${sorted[index - 1]}-${page}`, page];
  });
}

export default function PaginationControls({
  page,
  pageCount,
  onPageChange,
  disabled = false,
  ariaLabel = '\u5206\u9875',
}) {
  const [draftPage, setDraftPage] = useState(String(page));
  const items = useMemo(
    () => buildPaginationItems(page, pageCount),
    [page, pageCount],
  );

  useEffect(() => setDraftPage(String(page)), [page]);

  if (pageCount <= 1) return null;

  const goToPage = nextPage => {
    if (disabled) return;
    onPageChange(clampPage(nextPage, pageCount));
  };

  const submitJump = event => {
    event.preventDefault();
    const target = Number(draftPage);
    if (!Number.isInteger(target)) {
      setDraftPage(String(page));
      return;
    }
    goToPage(target);
  };

  return (
    <nav className="data-pagination" aria-label={ariaLabel}>
      <button
        type="button"
        className="data-pagination__icon-button"
        aria-label={'\u9996\u9875'}
        title={'\u9996\u9875'}
        onClick={() => goToPage(1)}
        disabled={disabled || page === 1}
      >
        {'\u00ab'}
      </button>
      <button
        type="button"
        className="data-pagination__icon-button"
        aria-label={'\u4e0a\u4e00\u9875'}
        title={'\u4e0a\u4e00\u9875'}
        onClick={() => goToPage(page - 1)}
        disabled={disabled || page === 1}
      >
        {'\u2039'}
      </button>
      <div className="data-pagination__pages" aria-label={'\u9875\u7801'}>
        {items.map(item => (typeof item === 'number' ? (
          <button
            type="button"
            key={item}
            className={item === page ? 'is-current' : ''}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`\u7b2c ${item} \u9875`}
            onClick={() => goToPage(item)}
            disabled={disabled}
          >
            {item}
          </button>
        ) : (
          <span className="data-pagination__ellipsis" key={item} aria-hidden="true">...</span>
        )))}
      </div>
      <button
        type="button"
        className="data-pagination__icon-button"
        aria-label={'\u4e0b\u4e00\u9875'}
        title={'\u4e0b\u4e00\u9875'}
        onClick={() => goToPage(page + 1)}
        disabled={disabled || page === pageCount}
      >
        {'\u203a'}
      </button>
      <button
        type="button"
        className="data-pagination__icon-button"
        aria-label={'\u672b\u9875'}
        title={'\u672b\u9875'}
        onClick={() => goToPage(pageCount)}
        disabled={disabled || page === pageCount}
      >
        {'\u00bb'}
      </button>
      <form className="data-pagination__jump" onSubmit={submitJump}>
        <label>
          {'\u8df3\u81f3'}
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={pageCount}
            value={draftPage}
            aria-label={'\u8df3\u81f3\u9875\u7801'}
            onChange={event => setDraftPage(event.target.value)}
            disabled={disabled}
          />
          {'\u9875'}
        </label>
        <button
          type="submit"
          className="data-pagination__jump-button"
          aria-label={'\u8df3\u8f6c'}
          title={'\u8df3\u8f6c'}
          disabled={disabled}
        >
          {'\u2192'}
        </button>
      </form>
    </nav>
  );
}
