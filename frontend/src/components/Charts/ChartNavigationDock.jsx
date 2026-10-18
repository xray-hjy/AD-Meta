import { useId, useLayoutEffect, useRef, useState } from 'react';
import ChartMinimap from './ChartMinimap';
import ChartPanJoystick from './ChartPanJoystick';
import useNavigationMorph from './useNavigationMorph';
import './chart-navigation.css';

export default function ChartNavigationDock({ world, visible, preview, stretch, onNavigate,
  onPan, canPan, panMode, onTogglePan, viewport, style, ariaLabel, open: controlledOpen, onOpenChange }) {
  const [localOpen, setLocalOpen] = useState(true);
  const open = controlledOpen ?? localOpen;
  const contentId = useId();
  const dockRef = useRef(null), shellRef = useRef(null), contentRef = useRef(null);
  const orbRef = useRef(null), closeRef = useRef(null), focusRequestedRef = useRef(false);
  useNavigationMorph({ open, dockRef, shellRef, contentRef, orbRef });

  useLayoutEffect(() => {
    if (!focusRequestedRef.current) return;
    (open ? closeRef.current : orbRef.current)?.focus({ preventScroll: true });
    focusRequestedRef.current = false;
  }, [open]);

  const changeOpen = next => {
    focusRequestedRef.current = true;
    if (onOpenChange) onOpenChange(next);
    else setLocalOpen(next);
  };

  return <div ref={dockRef} className="chart-navigation-dock" style={style}
    onKeyDown={event => {
      // Keep navigation keys inside controls from also moving the chart camera.
      event.stopPropagation();
      if (event.key === 'Escape' && open) { event.preventDefault(); changeOpen(false); }
    }}>
    <aside ref={shellRef} className="chart-navigation-shell" aria-label={ariaLabel || '全局预览'}>
      <div ref={contentRef} id={contentId} className="chart-navigation-content" inert={!open} aria-hidden={!open}>
        <header className="chart-navigation-header">
          <span>全局预览</span>
          <button ref={closeRef} type="button" className="chart-navigation-close" aria-label="收起全局预览"
            title="收起为小球" aria-expanded={open} aria-controls={contentId} onClick={() => changeOpen(false)}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10" /></svg>
          </button>
        </header>
        <div className="chart-navigation-grid">
          <ChartPanJoystick embedded enabled={open} onPan={onPan} canPan={canPan} panMode={panMode}
            world={world} visible={visible} viewport={viewport} onTogglePan={onTogglePan} />
          <ChartMinimap active={open} world={world} visible={visible} preview={preview}
            stretch={stretch} ariaLabel={ariaLabel} onNavigate={onNavigate} />
        </div>
        <div className="chart-navigation-hint">Alt + 滚轮缩放 <span>·</span> Alt + 拖动平移</div>
      </div>
      <button ref={orbRef} type="button" className="chart-navigation-orb" disabled={open}
        aria-label="展开全局预览" aria-expanded={open} aria-controls={contentId} title="全局预览"
        onClick={() => changeOpen(true)}>
        <span className="chart-navigation-orb__icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M6 12s2.3-4 6-4 6 4 6 4-2.3 4-6 4-6-4-6-4Z" /><circle cx="12" cy="12" r="1.5" /></svg>
        </span>
      </button>
    </aside>
  </div>;
}
