import { HOME_MOTION } from './motionConfig';

// Input policy only: no copy, DOM layout or scene construction.
export function createWheelInput({ gallery, eligible, onAnchor, onBoundary }) {
  let timer = 0, frame = 0, accumulator = 0, direction = 0, lastInput = 0;
  let kind = '', start = 0, owned = false, pendingBoundary = 0;
  const events = new AbortController();
  function clear() {
    clearTimeout(timer); cancelAnimationFrame(frame);
    timer = frame = accumulator = direction = lastInput = pendingBoundary = 0;
    kind = ''; owned = false;
    gallery.state()?.swiper.mousewheel.disable();
  }
  function settle() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      const state = gallery.state();
      if (!state) return;
      const target = Math.abs(accumulator) >= 8
        ? (direction > 0 ? Math.ceil(state.position - .001) : Math.floor(state.position + .001))
        : Math.round(state.position);
      gallery.go(target, { duration: HOME_MOTION.idleSnapSpeed });
      onAnchor(gallery.state().target);
    }, HOME_MOTION.idleSnapDelay);
  }
  function end() {
    if (!timer) owned = false;
    if (!pendingBoundary) return;
    const step = pendingBoundary;
    pendingBoundary = 0;
    frame = requestAnimationFrame(() => { frame = 0; onBoundary(step); });
  }
  function onWheel(event) {
    if (!eligible(event)) { gallery.state()?.swiper.mousewheel.disable(); return; }
    const state = gallery.state();
    if (!state) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? innerHeight : 1);
    const step = Math.sign(delta);
    if (pendingBoundary && pendingBoundary !== step || frame) {
      pendingBoundary = 0; cancelAnimationFrame(frame); frame = 0;
    }
    const atEdge = step > 0 ? state.position >= state.last - .002 : state.position <= .002;
    const targetAtEdge = state.target === (step > 0 ? state.last : 0);
    if (atEdge || state.swiper.animating && targetAtEdge) {
      state.swiper.mousewheel.disable();
      if (state.swiper.animating) { event.preventDefault(); pendingBoundary = step; return; }
      clear();
      if (onBoundary(step)) event.preventDefault();
      return;
    }
    const now = performance.now();
    const reversed = direction !== 0 && step !== direction;
    if (now - lastInput > HOME_MOTION.gestureGap || reversed || !kind) {
      accumulator = 0;
      start = reversed || !state.swiper.animating ? Math.round(state.position) : state.target;
      kind = event.deltaMode !== 0 || Math.abs(delta) >= HOME_MOTION.notchThreshold ? 'notch' : 'continuous';
    }
    direction = step; lastInput = now; accumulator += delta; owned = true;
    if (kind === 'notch') {
      event.preventDefault(); state.swiper.mousewheel.disable();
      const distance = Math.max(1, Math.ceil(Math.abs(accumulator) / HOME_MOTION.pixelsPerNotch));
      gallery.go(start + step * distance, { duration: Math.max(280, 440 - distance * 30) });
      onAnchor(gallery.state().target);
      clearTimeout(timer);
      timer = setTimeout(() => { timer = 0; if (!gallery.state()?.swiper.animating) owned = false; }, HOME_MOTION.gestureGap);
    } else state.swiper.mousewheel.enable();
  }
  window.addEventListener('wheel', onWheel, { passive: false, capture: true, signal: events.signal });
  return {
    clear, end, isOwned: () => owned,
    move(index, options = {}) {
      if (options.continuous) { owned = true; onAnchor(index); settle(); }
      else if (options.drag) { clear(); owned = true; onAnchor(index); }
      else { clear(); owned = true; gallery.go(index); onAnchor(gallery.state().target); }
    },
    dispose() { events.abort(); clear(); },
  };
}
