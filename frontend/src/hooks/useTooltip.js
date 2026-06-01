import { useRef, useCallback } from 'react';
import * as d3 from 'd3';

/**
 * 共享悬浮窗 hook — 所有图表组件统一使用
 *
 * 用法:
 *   const { tooltipRef, Tooltip, show, move, hide } = useTooltip();
 *
 *   // 在 D3 事件中
 *   .on('mouseenter', (event, d) => { show(htmlString); move(event); })
 *   .on('mousemove',  event       => { move(event); })
 *   .on('mouseleave', ()          => { hide(); })
 *
 *   // JSX 中渲染 <Tooltip />
 */
export default function useTooltip() {
  const ref = useRef(null);

  const show = useCallback((html) => {
    d3.select(ref.current).style('opacity', 1).html(html);
  }, []);

  const move = useCallback((event) => {
    d3.select(ref.current)
      .style('left', `${event.clientX + 14}px`)
      .style('top', `${event.clientY + 14}px`);
  }, []);

  const hide = useCallback(() => {
    d3.select(ref.current).style('opacity', 0);
  }, []);

  const Tooltip = () => (
    <div
      ref={ref}
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
        whiteSpace: 'pre-line',
        wordBreak: 'break-all',
        transition: 'opacity 120ms ease',
      }}
    />
  );

  return { tooltipRef: ref, Tooltip, show, move, hide };
}
