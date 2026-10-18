import { HOME_MOTION, clamp } from './motionConfig';
import { measureHomeSections, selectSectionSnap } from './sectionGeometry';

const editable = target => target?.closest?.('input, textarea, select, [contenteditable="true"]');
function nestedScroller(target, page) {
  for (let node = target?.nodeType === 1 ? target : target?.parentElement; node && node !== page; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
  }
  return false;
}

// Observe native scrolling. Never prevent a wheel event or create another scroller.
export function createSectionSnapController({ page, registry, reducedMotion = false, blocked = () => false }) {
  const events = new AbortController(), config = HOME_MOTION.snap;
  const observed = new Set();
  let sections = [], timer = 0, frame = 0, disposed = false, dragging = false, navigating = false;
  let lastY = scrollY, direction = 0, suppressedUntil = 0, active = null, dirty = true;
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(invalidate) : null;
  function cancel() { clearTimeout(timer); cancelAnimationFrame(frame); timer = frame = 0; navigating = false; }
  function invalidate() { dirty = true; cancel(); }
  function measure() {
    if (!dirty) return;
    sections = measureHomeSections(registry, page); dirty = false;
    const elements = new Set([page, ...sections.map(section => section.element)]);
    for (const element of observed) if (!elements.has(element)) { resize?.unobserve(element); observed.delete(element); }
    for (const element of elements) if (!observed.has(element)) { resize?.observe(element); observed.add(element); }
  }
  function activate(position) {
    const current = [...sections].reverse().find(section => position >= section.start - 2) || sections[0];
    if (active === current?.element) return;
    active?.removeAttribute('data-home-active'); active = current?.element;
    active?.setAttribute('data-home-active', 'true');
  }
  function animate(top) {
    cancel();
    if (reducedMotion || Math.abs(top - scrollY) < 2) { window.scrollTo({ top, behavior: 'instant' }); return; }
    const from = scrollY, start = performance.now();
    function tick(now) {
      if (disposed || blocked()) { cancel(); return; }
      const progress = clamp((now - start) / config.duration);
      window.scrollTo({ top: from + (top - from) * (1 - (1 - progress) ** 3), behavior: 'instant' });
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { frame = 0; lastY = scrollY; activate(scrollY); }
    }
    frame = requestAnimationFrame(tick);
  }
  function settle() {
    timer = 0;
    if (disposed || reducedMotion || dragging || blocked() || performance.now() < suppressedUntil) return;
    measure();
    if (sections.some(section => section.adapter?.isBusy?.())) return;
    const radius = clamp(innerHeight * (innerWidth < HOME_MOTION.desktopWidth ? config.smallRadius : config.radius), config.minimumRadius, config.maximumRadius);
    const target = selectSectionSnap(sections, scrollY, direction, radius);
    if (target) animate(target.top);
  }
  function onScroll() {
    const y = scrollY;
    if (!frame) {
      direction = Math.sign(y - lastY) || direction; clearTimeout(timer);
      timer = setTimeout(navigating ? () => { timer = 0; navigating = false; } : settle, config.idleDelay);
    }
    lastY = y; measure(); activate(y);
  }
  function input(event) {
    cancel(); suppressedUntil = 0;
    if (event.type === 'wheel') {
      direction = Math.sign(event.deltaY) || direction;
      if (event.ctrlKey || event.metaKey || editable(event.target) || nestedScroller(event.target, page)) suppressedUntil = performance.now() + 1000;
    } else if (event.type === 'keydown') suppressedUntil = performance.now() + 1000;
  }
  const pointerDown = event => { input(event); dragging = true; };
  const pointerUp = () => { dragging = false; clearTimeout(timer); timer = setTimeout(settle, config.idleDelay); };
  window.addEventListener('scroll', onScroll, { passive: true, signal: events.signal });
  window.addEventListener('wheel', input, { passive: true, capture: true, signal: events.signal });
  window.addEventListener('keydown', input, { capture: true, signal: events.signal });
  window.addEventListener('pointerdown', pointerDown, { passive: true, signal: events.signal });
  window.addEventListener('pointerup', pointerUp, { passive: true, signal: events.signal });
  window.addEventListener('pointercancel', pointerUp, { passive: true, signal: events.signal });
  window.addEventListener('resize', invalidate, { signal: events.signal });
  // Fixed-size gallery images load during navigation without changing layout.
  // ResizeObserver catches real geometry changes; load is only its fallback.
  if (!resize) page.addEventListener('load', invalidate, { capture: true, signal: events.signal });
  const unsubscribe = registry.subscribe(invalidate);
  document.fonts?.ready.then(() => { if (!disposed) invalidate(); });
    measure(); activate(scrollY);
  return {
    goto(id) {
      if (disposed) return;
      dirty = true; measure();
      const section = sections.find(item => item.id === id);
      if (section && !blocked()) animate(section.start);
    },
    navigate(action) {
      if (disposed) return;
      cancel(); navigating = true;
      try { action(); } catch (error) { cancel(); throw error; }
      // Smooth native jumps can last longer than a fixed guard. Their final
      // scroll event ends this guard; the timeout covers actions with no scroll.
      if (!timer) timer = setTimeout(() => { timer = 0; navigating = false; }, config.navigationGuard);
    },
    dispose() { disposed = true; cancel(); events.abort(); unsubscribe(); resize?.disconnect(); active?.removeAttribute('data-home-active'); },
  };
}
