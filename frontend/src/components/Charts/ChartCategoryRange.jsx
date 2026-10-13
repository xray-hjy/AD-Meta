import { useEffect, useMemo, useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';

// A data interval, not a second data selection. Dragging the filled window
// translates the same camera used by the joystick, wheel and overview.
export default function ChartCategoryRange({ count, start, end, onChange, overview }) {
  const root = useRef(null), drag = useRef(null), frame = useRef(null), pending = useRef(null);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);
  const change = interval => {
    pending.current = interval;
    if (frame.current == null) frame.current = requestAnimationFrame(() => {
      frame.current = null;
      callback.current(...pending.current); pending.current = null;
    });
  };
  const path = useMemo(() => {
    // Downsample only the decoration; the interval always indexes every MAG.
    const bins = Math.min(240, overview.length), max = Math.max(0, ...overview) || 1;
    return Array.from({ length: bins }, (_, i) => {
      const values = overview.slice(Math.floor(i * overview.length / bins), Math.ceil((i + 1) * overview.length / bins));
      return `${i ? 'L' : 'M'}${i / Math.max(1, bins - 1) * 1000},${27 - Math.max(0, ...values) / max * 23}`;
    }).join(' ') + ' L1000,30 L0,30 Z';
  }, [overview]);
  const from = Math.max(0, Math.min(count - 1, start)), to = Math.max(from + 1, Math.min(count, end));
  return <div className="chart-category-range" aria-label="MAG 浏览区间">
    <div className="chart-category-range__caption"><span>浏览区间 <strong>{Math.floor(from) + 1}–{Math.ceil(to)}</strong> / {count}</span>
      <span>数值轴随当前区间自动调整</span></div>
    <div className="chart-category-range__track" ref={root}>
      <svg viewBox="0 0 1000 30" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg>
      <Slider.Root className="chart-category-range__slider" min={0} max={count} step={1} minStepsBetweenThumbs={1}
        value={[from, to]} onValueChange={change} disabled={count < 2}>
        <Slider.Track className="chart-category-range__rail"><Slider.Range className="chart-category-range__window"
          onPointerDown={event => {
            if (event.button !== 0 || count < 2) return;
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, from, to, width: root.current.clientWidth };
          }} onPointerMove={event => {
            if (!drag.current) return;
            event.preventDefault(); event.stopPropagation();
            const { x, from: initial, to: last, width } = drag.current;
            const next = Math.max(0, Math.min(count - (last - initial), initial + (event.clientX - x) / width * count));
            change([next, next + last - initial]);
          }} onPointerUp={event => { if (drag.current) { event.stopPropagation(); drag.current = null; } }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          tabIndex={count < 2 ? -1 : 0} role="button" aria-label="拖动浏览区间" title="拖动整个区间，或拖动两端调整范围"
          onKeyDown={event => {
            const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
            if (direction) { event.preventDefault(); const next = Math.max(0, Math.min(count - (to - from), from + direction * Math.max(1, (to - from) / 10))); change([next, next + to - from]); }
          }} /></Slider.Track>
        <Slider.Thumb className="chart-category-range__thumb" aria-label="浏览起点" />
        <Slider.Thumb className="chart-category-range__thumb" aria-label="浏览终点" />
      </Slider.Root>
    </div>
  </div>;
}
