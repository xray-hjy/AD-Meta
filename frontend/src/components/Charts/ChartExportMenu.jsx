import { useEffect, useId, useRef, useState } from 'react';
import ChartImageExportSettings from './ChartImageExportSettings';
import './chart-export-menu.css';

export default function ChartExportMenu({ action }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef(null), trigger = useRef(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    root.current?.querySelector('[role="dialog"] button')?.focus();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="chart-toolbar-popover chart-toolbar-popover--export" ref={root}>
    <button ref={trigger} type="button" className="analysis-button chart-export-trigger" disabled={action.disabled}
      aria-label={action.label || '导出图像'} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 18v3h16v-3" /></svg>
      导出图像<span className="chart-export-trigger__chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div id={id} className="chart-toolbar-popover__panel" role="dialog" aria-label="图像导出设置">
      <div className="chart-toolbar-popover__heading"><strong>图像导出设置</strong><button type="button" className="analysis-button" aria-label="关闭图像导出设置" onClick={close}>×</button></div>
      <ChartImageExportSettings action={action} close={close} />
    </div>}
  </div>;
}
