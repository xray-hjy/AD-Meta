import { useEffect, useMemo, useRef, useState } from 'react';

export default function AuditFilterSelect({
  id,
  label,
  emptyLabel,
  value,
  options,
  loading,
  searching = false,
  search,
  onSearch,
  onChange,
  onOpen,
  optionLabel,
  helperText = '',
  resultSummary = '',
  scrollSelectedValue = false,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedValueOverflows, setSelectedValueOverflows] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listboxRef = useRef(null);
  const selectedValueRef = useRef(null);
  const selectedValueTextRef = useRef(null);
  const selectedLabel = useMemo(() => {
    if (!value) return emptyLabel;
    const selected = options.find(option => option.value === value);
    return selected ? optionLabel(selected) : value;
  }, [emptyLabel, optionLabel, options, value]);
  const listboxId = `${id}-listbox`;
  const visibleOptions = useMemo(
    () => [
      { value: '', label: emptyLabel },
      ...(searching ? [] : options.map(option => ({ value: option.value, label: optionLabel(option) }))),
    ],
    [emptyLabel, optionLabel, options, searching]
  );

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = visibleOptions.findIndex(option => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, value, visibleOptions]);

  useEffect(() => {
    if (!open) return;
    const activeOption = document.getElementById(`${listboxId}-option-${activeIndex}`);
    activeOption?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listboxId, open]);

  useEffect(() => {
    if (!scrollSelectedValue || !value) {
      setSelectedValueOverflows(false);
      return undefined;
    }

    const measureOverflow = () => {
      const viewport = selectedValueRef.current;
      const text = selectedValueTextRef.current;
      if (!viewport || !text) return;
      setSelectedValueOverflows(text.scrollWidth > viewport.clientWidth + 1);
    };

    measureOverflow();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(selectedValueRef.current);
    return () => observer.disconnect();
  }, [scrollSelectedValue, selectedLabel, value]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) onOpen();
  };

  const choose = nextValue => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = offset => {
    setActiveIndex(current => Math.max(0, Math.min(visibleOptions.length - 1, current + offset)));
  };

  const handleListboxKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(visibleOptions.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(visibleOptions[activeIndex]?.value ?? '');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="projection-audit__filter-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`projection-audit__select-trigger${scrollSelectedValue ? ' is-marquee-enabled' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={toggle}
      >
        <span className="projection-audit__select-value" ref={selectedValueRef} title={selectedLabel}>
          <span
            className={`projection-audit__select-value-text${selectedValueOverflows ? ' is-scrolling' : ''}`}
            ref={selectedValueTextRef}
            style={selectedValueOverflows ? {
              '--audit-marquee-duration': `${Math.min(20, Math.max(9, selectedLabel.length * 0.32))}s`,
            } : undefined}
          >
            {selectedLabel}
          </span>
        </span>
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
            aria-controls={listboxId}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                moveActive(event.key === 'ArrowDown' ? 1 : -1);
                listboxRef.current?.focus();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
          />
          {resultSummary ? (
            <p className="projection-audit__select-summary" aria-live="polite">
              {resultSummary}
            </p>
          ) : null}
          <div
            id={listboxId}
            ref={listboxRef}
            role="listbox"
            aria-label={`${label}选项`}
            aria-activedescendant={`${listboxId}-option-${activeIndex}`}
            tabIndex={0}
            onKeyDown={handleListboxKeyDown}
          >
            {visibleOptions.map((option, index) => (
              <button
                type="button"
                role="option"
                id={`${listboxId}-option-${index}`}
                aria-selected={value === option.value}
                className={[
                  value === option.value ? 'is-selected' : '',
                  activeIndex === index ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                key={option.value}
                tabIndex={-1}
                onClick={() => choose(option.value)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.label}
              </button>
            ))}
            {searching ? <p role="status">正在检索匹配项...</p> : null}
            {!searching && loading ? <p>正在读取选项...</p> : null}
            {!searching && !loading && options.length === 0 ? <p>没有匹配选项</p> : null}
          </div>
          {helperText ? <p className="projection-audit__select-helper">{helperText}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
