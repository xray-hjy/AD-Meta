import StyledSelect from '../ui/StyledSelect';
import { useEffect, useId, useRef, useState } from 'react';
import './chart-style.css';
import PaletteSelect from './PaletteSelect';

function StyleControl({ field, value, onChange }) {
  if (field.type === 'toggle') return <button type="button" className="chart-style-toolbar__action"
    aria-label={field.label} aria-pressed={Boolean(value)} title={field.description} disabled={field.disabled}
    onClick={() => onChange(field.key, !value)}><span aria-hidden="true">⇄</span>{field.label}</button>;
  if (field.type === 'palette') return <PaletteSelect field={field} value={value} onChange={onChange} />;
  if (field.type === 'switch') return (
    <button type="button" role="switch" aria-checked={Boolean(value)} aria-label={field.label}
      className="chart-style-switch" title={field.description} onClick={() => onChange(field.key, !value)} disabled={field.disabled}>
      <span className="chart-style-switch__track" aria-hidden="true"><span /></span>{field.label}
    </button>
  );
  return <label className="chart-style-select">{field.label}
    <StyledSelect aria-label={field.label} value={value} onChange={event => onChange(field.key, event.target.value)} disabled={field.disabled}>
      {field.options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </StyledSelect>
  </label>;
}

// Presentation only: each visualization supplies its own fields and values.
export default function ChartStyleToolbar({ fields, values, onChange, onReset, label = '图形样式' }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();
  const primary = fields.filter(field => !field.more);
  const additional = fields.filter(field => field.more);
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <div ref={root} className="chart-style-toolbar" role="group" aria-label={label}>
    <span className="chart-style-toolbar__title">{label}</span>
    {primary.map(field => <StyleControl key={field.key} field={field} value={values[field.key]} onChange={onChange} />)}
    {additional.length > 0 && <button ref={trigger} className="chart-style-toolbar__action" type="button"
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>更多设置<span aria-hidden="true">⌄</span></button>}
    <button className="chart-style-toolbar__action" type="button" onClick={onReset} aria-label="重置图形样式">重置</button>
    {open && <div id={panelId} className="chart-style-toolbar__panel" role="group" aria-label="更多图形样式设置">
      {additional.map(field => <StyleControl key={field.key} field={field} value={values[field.key]} onChange={onChange} />)}
    </div>}
  </div>;
}
