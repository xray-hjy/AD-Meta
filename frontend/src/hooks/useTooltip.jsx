import { useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/** Shared tooltip hook for canvas and D3 chart components. */
export function resolveTooltipPosition({
  clientX,
  clientY,
  tooltipWidth,
  tooltipHeight,
  viewportWidth,
  viewportHeight,
  offset = 14,
  margin = 12,
}) {
  const maxLeft = Math.max(margin, viewportWidth - tooltipWidth - margin);
  const maxTop = Math.max(margin, viewportHeight - tooltipHeight - margin);
  const preferredLeft = clientX + offset + tooltipWidth <= viewportWidth - margin
    ? clientX + offset
    : clientX - tooltipWidth - offset;
  const preferredTop = clientY - tooltipHeight - offset;

  return {
    left: Math.min(Math.max(preferredLeft, margin), maxLeft),
    top: Math.min(Math.max(preferredTop, margin), maxTop),
  };
}

export default function useTooltip() {
  const ref = useRef(null);

  const show = useCallback((html) => {
    if (!ref.current) return;
    ref.current.style.opacity = 1;
    ref.current.innerHTML = html;
  }, []);

  const move = useCallback((event) => {
    if (!ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    const position = resolveTooltipPosition({
      clientX: event.clientX,
      clientY: event.clientY,
      tooltipWidth: bounds.width,
      tooltipHeight: bounds.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    ref.current.style.left = `${position.left}px`;
    ref.current.style.top = `${position.top}px`;
  }, []);

  const hide = useCallback(() => {
    if (ref.current) ref.current.style.opacity = 0;
  }, []);

  const Tooltip = useCallback(() => createPortal(
    <div
      ref={ref}
      data-chart-tooltip="true"
      role="tooltip"
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        opacity: 0,
        zIndex: 9999,
        padding: '6px 10px',
        borderRadius: 6,
        background: 'rgba(15, 23, 42, 0.92)',
        color: '#fff',
        fontSize: 12,
        lineHeight: 1.5,
        maxWidth: 340,
        maxHeight: 'calc(100vh - 24px)',
        overflow: 'hidden',
        whiteSpace: 'pre-line',
        wordBreak: 'break-all',
      }}
    />,
    document.body
  ), []);

  return { tooltipRef: ref, Tooltip, show, move, hide };
}
