import { useEffect, useMemo, useRef, useState } from 'react';

export default function AuditFilterSelect({
  id,
  label,
  emptyLabel,
  value,
  options,
  loading,
  search,
  onSearch,
  onChange,
  onOpen,
  optionLabel,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedLabel = useMemo(() => {
    if (!value) return emptyLabel;
    const selected = options.find(option => option.value === value);
    return selected ? optionLabel(selected) : value;
  }, [emptyLabel, optionLabel, options, value]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const toggle = () => {
    setOpen(current => {
      const next = !current;
      if (next) onOpen();
      return next;
    });
  };

  const choose = nextValue => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className="projection-audit__filter-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        className="projection-audit__select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        <span title={selectedLabel}>{selectedLabel}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="projection-audit__select-menu">
          <input
            type="search"
            value={search}
            aria-label={`搜索${label}`}
            placeholder={`搜索${label}`}
            autoFocus
            onChange={event => onSearch(event.target.value)}
          />
          <div role="listbox" aria-label={`${label}选项`}>
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={!value ? 'is-selected' : ''}
              onClick={() => choose('')}
            >
              {emptyLabel}
            </button>
            {options.map(option => (
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                className={value === option.value ? 'is-selected' : ''}
                key={option.value}
                onClick={() => choose(option.value)}
              >
                {optionLabel(option)}
              </button>
            ))}
            {loading ? <p>正在读取选项...</p> : null}
            {!loading && options.length === 0 ? <p>没有匹配选项</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
