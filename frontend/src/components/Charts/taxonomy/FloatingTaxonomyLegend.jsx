import { useEffect, useRef, useState } from 'react';
import { clampLegendPosition } from '../taxonomyExploration';

export default function FloatingTaxonomyLegend({ children, resetKey, visible: controlledVisible, onVisibleChange }) {
  const cardRef = useRef(null);
  const drag = useRef(null);
  const [position, setPosition] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [localVisible, setLocalVisible] = useState(true);
  const visible = controlledVisible ?? localVisible;
  const setVisible = value => { setLocalVisible(value); onVisibleChange?.(value); };
  const fit = value => {
    const card = cardRef.current;
    const area = card?.parentElement;
    if (!area || !card) return value;
    return clampLegendPosition(value, { width: area.clientWidth, height: area.clientHeight }, { width: card.offsetWidth, height: card.offsetHeight });
  };
  useEffect(() => { setPosition(null); setCollapsed(false); setLocalVisible(true); }, [resetKey]);
  useEffect(() => {
    const area = cardRef.current?.parentElement;
    if (!area || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setPosition(current => current ? fit(current) : null));
    observer.observe(area);
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [visible]);
  if (!visible) return <button type="button" className="taxonomy-legend-show" onClick={() => { setVisible(true); setPosition(null); }}>显示门级图例</button>;
  return <aside ref={cardRef} className="taxonomy-floating-legend" aria-label="门级图例卡片" style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}>
    <header className="taxonomy-floating-legend__header">
      <button type="button" className="taxonomy-legend-handle" aria-label="拖动图例；方向键移动" title="拖动或使用方向键移动图例"
        onPointerDown={event => {
          if (getComputedStyle(cardRef.current).position !== 'absolute') return;
          const card = cardRef.current, area = card.parentElement;
          const rect = card.getBoundingClientRect(), box = area.getBoundingClientRect();
          drag.current = { pointerX: event.clientX, pointerY: event.clientY, x: rect.left - box.left, y: rect.top - box.top };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          setPosition(fit({ x: drag.current.x + event.clientX - drag.current.pointerX, y: drag.current.y + event.clientY - drag.current.pointerY }));
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={event => {
          const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
          if (!delta || getComputedStyle(cardRef.current).position !== 'absolute') return;
          event.preventDefault(); const card = cardRef.current, area = card.parentElement;
          const rect = card.getBoundingClientRect(), box = area.getBoundingClientRect();
          setPosition(fit({ x: rect.left - box.left + delta[0], y: rect.top - box.top + delta[1] }));
        }}>⠿ 门级图例</button>
      <button type="button" aria-label="恢复图例默认位置" onClick={() => setPosition(null)}>复位</button>
      <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? '展开图例' : '收起图例'}</button>
      <button type="button" aria-label="隐藏门级图例" onClick={() => setVisible(false)}>×</button>
    </header>
    {!collapsed ? <div className="taxonomy-floating-legend__body">{children}</div> : null}
  </aside>;
}
