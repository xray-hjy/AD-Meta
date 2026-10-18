import { clamp, HOME_MOTION } from './motionConfig';

// One event-driven follow loop, active only until the pointer target settles.
// Keep transform updates on the plane, away from inheritable screenshot styles.
export function createHeroBackdropController(hero, backdrop) {
  const plane = backdrop.querySelector('.hero-chart-backdrop__plane');
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  const motion = HOME_MOTION.heroBackdrop;
  let box = hero.getBoundingClientRect(), dirty = false;
  let visible = box.bottom > 0, disposed = false;
  let frame = 0, lastTime = 0, point = null;
  let x = 0, y = 0, targetX = 0, targetY = 0, lastTransform = '';
  const canRun = () => !disposed && visible && !document.hidden && finePointer?.matches;
  const write = () => {
    const transform = `translate3d(-50%, -50%, 0) rotateX(${(motion.rotateX + y).toFixed(4)}deg) rotateY(${(motion.rotateY + x).toFixed(4)}deg) rotateZ(${motion.rotateZ}deg)`;
    if (transform !== lastTransform) { plane.style.transform = transform; lastTransform = transform; }
  };
  const stop = () => {
    cancelAnimationFrame(frame); frame = 0; lastTime = 0; point = null;
    x = y = targetX = targetY = 0; lastTransform = '';
    plane.style.removeProperty('transform');
  };
  const schedule = () => {
    if (!frame && canRun()) frame = requestAnimationFrame(paint);
  };
  function paint(time) {
    frame = 0;
    if (!canRun()) return;
    if (dirty) { box = hero.getBoundingClientRect(); dirty = false; }
    if (point && box.width && box.height) {
      targetX = clamp((point.x - box.left) / box.width * 2 - 1, -1, 1) * motion.parallax;
      targetY = -clamp((point.y - box.top) / box.height * 2 - 1, -1, 1) * motion.parallax;
    }
    const dt = lastTime ? clamp(time - lastTime, 1, 40) : 16.67;
    lastTime = time;
    const blend = 1 - Math.exp(-dt / motion.response);
    x += (targetX - x) * blend;
    y += (targetY - y) * blend;
    if (Math.abs(targetX - x) + Math.abs(targetY - y) < .002) {
      x = targetX; y = targetY; lastTime = 0; write();
      return;
    }
    write(); schedule();
  }
  const invalidate = () => { dirty = true; if (point) schedule(); };
  const leave = () => { point = null; targetX = targetY = 0; schedule(); };
  const sync = () => {
    backdrop.dataset.running = String(visible && !document.hidden && !disposed);
    if (!canRun()) stop();
  };
  const move = event => {
    if (!canRun() || event.pointerType === 'touch') return;
    point = { x: event.clientX, y: event.clientY }; schedule();
  };
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? false; sync();
  });
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidate);
  observer?.observe(hero); resize?.observe(hero);
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerleave', leave);
  window.addEventListener('resize', invalidate, { passive: true });
  window.addEventListener('scroll', invalidate, { passive: true });
  document.addEventListener('visibilitychange', sync);
  finePointer?.addEventListener('change', sync);
  sync();
  return { dispose() {
    disposed = true; observer?.disconnect(); resize?.disconnect();
    hero.removeEventListener('pointermove', move);
    hero.removeEventListener('pointerleave', leave);
    window.removeEventListener('resize', invalidate);
    window.removeEventListener('scroll', invalidate);
    document.removeEventListener('visibilitychange', sync);
    finePointer?.removeEventListener('change', sync);
    stop(); backdrop.dataset.running = 'false';
  } };
}
