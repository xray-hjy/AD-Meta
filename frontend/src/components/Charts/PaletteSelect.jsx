import { useEffect, useId, useRef, useState } from 'react';
import SlidingHighlight from '../ui/SlidingHighlight';
import useSlidingHighlight from '../ui/useSlidingHighlight';
import usePopupPresence from '../ui/usePopupPresence';

export default function PaletteSelect({ field, value, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const id = useId();
  const current = field.options.find(option => option.value === value) || field.options[0];
  const [active, setActive] = useState(current.value);
  const highlight = useRef(null);
  const mounted = usePopupPresence(open);
  useSlidingHighlight({ containerRef: list, highlightRef: highlight, enabled: mounted, selector: '[data-highlighted]' });
  const gradient = colors => ({ background: `linear-gradient(90deg, ${field.discrete
    ? colors.flatMap((color, index) => [`${color} ${index / colors.length * 100}%`, `${color} ${(index + 1) / colors.length * 100}%`]).join(', ')
    : colors.join(', ')})` });
  const focusOption = index => list.current?.querySelectorAll('[role=option]')[index]?.focus();
  useEffect(() => {
    if (!open) return undefined;
    const selectedIndex = Math.max(0, field.options.findIndex(option => option.value === value));
    focusOption(selectedIndex);
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, field.options, value]);
  const select = option => { onChange(field.key, option.value); setOpen(false); trigger.current?.focus(); };
  return <div className="chart-palette-select" ref={root}>
    <span className="chart-palette-select__label">{field.label}</span>
    <button ref={trigger} type="button" className="chart-palette-select__trigger" aria-label={field.label}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={id} disabled={field.disabled}
      onClick={() => setOpen(v => !v)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}>
      <span className="chart-palette-select__swatch" style={gradient(current.colors)} aria-hidden="true" />
      <span>{current.shortLabel || current.label}</span><span aria-hidden="true">⌄</span>
    </button>
    {mounted && <div className="chart-palette-select__panel selection-popup-motion" data-ending-style={!open ? '' : undefined} inert={!open} aria-hidden={!open || undefined}>
      <div className="chart-palette-select__hint">{field.description}</div>
      <div id={id} ref={list} className="sliding-option-list" role="listbox" aria-label={`${field.label}系列`} onKeyDown={event => {
        const options = Array.from(list.current.querySelectorAll('[role=option]'));
        const index = options.indexOf(document.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
        } else if (event.key === 'Tab') setOpen(false);
      }}>
        <SlidingHighlight ref={highlight} />
        {field.options.map(option => <button type="button" role="option" tabIndex={-1} key={option.value}
          data-highlighted={active === option.value ? '' : undefined} onFocus={() => setActive(option.value)}
          onPointerMove={event => { if (event.pointerType !== 'touch') setActive(option.value); }}
          aria-selected={option.value === current.value} onClick={() => select(option)}>
          <span className="chart-palette-select__option-name">{option.label}<span aria-hidden="true">{option.value === current.value ? '✓' : ''}</span></span>
          <span className="chart-palette-select__ramp" style={gradient(option.colors)} aria-hidden="true" />
        </button>)}
      </div>
      {current.source && <a className="chart-palette-select__source" href={current.source} target="_blank" rel="noreferrer">查看 {current.shortLabel || current.label} 配色来源 ↗</a>}
    </div>}
  </div>;
}
