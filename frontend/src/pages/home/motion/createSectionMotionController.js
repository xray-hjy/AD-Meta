import { HOME_MOTION, clamp } from './motionConfig';
import { measureHomeSections } from './sectionGeometry';

const smooth = value => value * value * (3 - 2 * value);

// Ordered registered sections provide their own recipes; layout shells stay still.
export function createSectionMotionController(page, pinned, registry) {
  const motion = HOME_MOTION.sections, events = new AbortController();
  const written = new Map(), recipes = new Map();
  let frame = 0, disposed = false;
  function clearSurfaces(element) {
    for (const [surface, styles] of written) if (element.contains(surface)) {
      for (const property of styles.keys()) surface.style.removeProperty(property);
      written.delete(surface);
    }
  }
  function write(element, property, value) {
    if (!element) return;
    let values = written.get(element);
    if (!values) { values = new Map(); written.set(element, values); }
    value = String(value);
    if (values.get(property) === value) return;
    element.style[property] = value; values.set(property, value);
  }
  function paint() {
    if (disposed) return;
    // Finish all geometry reads before writing any display surfaces.
    const sections = measureHomeSections(registry, page), viewport = innerHeight;
    const present = new Set(sections.map(section => section.element));
    for (const [element] of recipes) if (!present.has(element)) {
      recipes.delete(element);
      clearSurfaces(element);
    }
    const poses = sections.flatMap((section, index) => {
      if (recipes.get(section.element)?.factory !== section.motion) {
        clearSurfaces(section.element); recipes.delete(section.element);
        if (section.motion) recipes.set(section.element, { factory: section.motion, render: section.motion(section.element, page, pinned) });
      }
      if (!section.motion) return [];
      const next = sections[index + 1];
      const entryStart = Math.max(0, section.start - viewport * motion.entryTravel);
      const entry = smooth(clamp((scrollY - entryStart) / Math.max(1, section.start - entryStart)));
      const arrival = smooth(clamp((viewport - (section.top - scrollY)) / (viewport * motion.exitTravel)));
      const exit = next ? smooth(clamp((viewport - (next.top - scrollY)) / (viewport * motion.exitTravel))) : 0;
      const departure = smooth(clamp((scrollY - section.start) / Math.max(1, Math.min(next ? next.start - section.start : viewport, viewport * motion.heroTravel))));
      return recipes.get(section.element).render({ entry, arrival, exit, departure, smooth });
    });
    for (const { element, styles } of poses) for (const [property, value] of Object.entries(styles)) write(element, property, value);
  }
  function schedule() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => { frame = 0; paint(); });
  }
  page.style.setProperty('--section-duration', motion.duration + 'ms');
  window.addEventListener('scroll', schedule, { passive: true, signal: events.signal });
  window.addEventListener('resize', schedule, { signal: events.signal });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  resize?.observe(page);
  const unsubscribe = registry.subscribe(schedule);
  document.fonts?.ready.then(() => { if (!disposed) schedule(); });
  paint(); page.classList.add('section-motion');
  return { dispose() {
    disposed = true; events.abort(); unsubscribe(); resize?.disconnect(); cancelAnimationFrame(frame);
    page.classList.remove('section-motion');
    for (const [element, values] of written) for (const property of values.keys()) element.style.removeProperty(property);
    page.style.removeProperty('--section-duration');
  } };
}
