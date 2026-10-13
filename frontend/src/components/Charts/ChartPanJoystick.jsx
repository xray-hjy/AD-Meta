import { useCallback, useEffect, useRef, useState } from 'react';
import { chartPanSpeed } from './chartPanSpeed';

const DIRECTIONS = [
  { key: 'up', label: '向上平移', x: 0, y: -1, angle: 0 },
  { key: 'right', label: '向右平移', x: 1, y: 0, angle: 90 },
  { key: 'down', label: '向下平移', x: 0, y: 1, angle: 180 },
  { key: 'left', label: '向左平移', x: -1, y: 0, angle: 270 },
];
const STICK_DEAD_ZONE = 3;

export default function ChartPanJoystick({ onPan, panMode, onTogglePan, canPan, world, visible, viewport }) {
  const onPanRef = useRef(onPan), frameRef = useRef(null), motionRef = useRef(null), dragRef = useRef(null);
  const speeds = chartPanSpeed(world, visible, viewport);
  const speedsRef = useRef(speeds);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(null);
  useEffect(() => { onPanRef.current = onPan; }, [onPan]);
  useEffect(() => { speedsRef.current = speeds; }, [speeds]);
  const cancelMotion = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null; motionRef.current = null; dragRef.current = null;
  }, []);
  const stop = useCallback(() => {
    cancelMotion(); setThumb({ x: 0, y: 0 }); setActive(null);
  }, [cancelMotion]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelMotion(); window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [stop, cancelMotion]);
  useEffect(() => {
    const motion = motionRef.current;
    if (motion?.kind === 'direction' && !canPan[motion.key]) stop();
  }, [canPan, stop]);

  const begin = useCallback((x, y, kind, key) => {
    const current = motionRef.current;
    if (current && current.kind === kind && current.key === key) {
      // Pointer moves change direction, not the frame clock. Resetting the
      // clock here loses elapsed time and slows a continuously dragged stick.
      current.x = x; current.y = y;
    } else {
      const now = performance.now();
      motionRef.current = { x, y, kind, key, started: now, previous: now };
    }
    if (frameRef.current != null) return;
    const tick = time => {
      const motion = motionRef.current;
      if (!motion) return;
      const elapsed = Math.max(0, Math.min(40, time - motion.previous));
      motion.previous = time;
      if (motion.kind !== 'direction' || time - motion.started >= 180) {
        const acceleration = Math.min(1, Math.max(0, (time - motion.started - (motion.kind === 'direction' ? 180 : 0)) / 600));
        const speed = axis => speedsRef.current[axis].base + (speedsRef.current[axis].speed - speedsRef.current[axis].base) * acceleration;
        onPanRef.current(motion.x * elapsed * speed('x'), motion.y * elapsed * speed('y'));
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);
  return <div className="chart-pan-joystick" role="group" aria-label="悬浮平移摇杆" data-speed-x={speeds.x.speed} data-speed-y={speeds.y.speed}>
    <span className="chart-pan-joystick__title">平移</span>
    <div className={`chart-pan-joystick__pad${panMode ? ' is-active' : ''}`}>
      {DIRECTIONS.map(direction => <button key={direction.key} type="button"
        className={`chart-pan-joystick__direction is-${direction.key}${active === direction.key ? ' is-held' : ''}`}
        aria-label={direction.label} title={`${direction.label}：点按移动，长按连续移动`} disabled={!canPan[direction.key]}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture?.(event.pointerId);
          setActive(direction.key);
          onPanRef.current(direction.x * speedsRef.current.x.tap, direction.y * speedsRef.current.y.tap);
          begin(direction.x, direction.y, 'direction', direction.key);
        }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
        onClick={event => { if (event.detail === 0) onPanRef.current(direction.x * speedsRef.current.x.tap, direction.y * speedsRef.current.y.tap); }}>
        <svg viewBox="0 0 16 16" aria-hidden="true" style={{ transform: `rotate(${direction.angle}deg)` }}><path d="m4 10 4-4 4 4" /></svg>
      </button>)}
      <button type="button" className="chart-pan-joystick__thumb" aria-label="图内拖动模式" aria-pressed={panMode}
        title="拖动中心杆控制方向和速度；点击切换图内拖动模式" style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture?.(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
        }} onPointerMove={event => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.x, dy = event.clientY - drag.y, distance = Math.hypot(dx, dy);
          if (distance > STICK_DEAD_ZONE) drag.moved = true;
          const fraction = distance ? Math.min(18, distance) / distance : 0;
          setThumb({ x: dx * fraction, y: dy * fraction });
          const speed = Math.pow(Math.max(0, Math.min(1, (distance - STICK_DEAD_ZONE) / (18 - STICK_DEAD_ZONE))), 1.7);
          begin(distance ? dx / distance * speed : 0, distance ? dy / distance * speed : 0, 'stick');
        }} onPointerUp={() => {
          const clicked = dragRef.current && !dragRef.current.moved;
          stop(); if (clicked) onTogglePan();
        }} onPointerCancel={stop} onLostPointerCapture={stop}
        onClick={event => { if (event.detail === 0) onTogglePan(); }}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12M8 6l2-2 2 2M8 14l2 2 2-2M6 8l-2 2 2 2M14 8l2 2-2 2" /></svg>
      </button>
    </div>
    <span className="chart-pan-joystick__hint">Alt + 滚轮缩放<br />Alt + 拖动平移</span>
  </div>;
}
