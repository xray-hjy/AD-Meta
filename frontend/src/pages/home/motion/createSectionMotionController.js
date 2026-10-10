import { HOME_MOTION, clamp } from './motionConfig';

const properties = ['--story-progress', '--copy-progress', '--hero-departure', '--showcase-departure', '--foundation-arrival'];
const smooth = value => value * value * (3 - 2 * value);

// Only observes native scrolling. Transform the visual surfaces, never their
// layout anchors: sticky tracks and wheel ownership retain their geometry.
export function createSectionMotionController(page, pinned) {
  const story = page.querySelector('.story-layout');
  const foundation = page.querySelector('.evidence');
  const header = page.querySelector('.site-header');
  const events = new AbortController();
  let frame = 0, disposed = false;
  function paint() {
    if (disposed) return;
    const viewport = innerHeight;
    const storyTop = story.getBoundingClientRect().top;
    const foundationTop = foundation.getBoundingClientRect().top;
    const stageTop = parseFloat(page.style.getPropertyValue('--stage-top')) || header.getBoundingClientRect().bottom + 24;
    const entryEnd = Math.max(1, storyTop + scrollY - stageTop);
    const entryStart = Math.max(0, entryEnd - viewport * HOME_MOTION.sections.entryTravel);
    const entry = smooth(clamp((scrollY - entryStart) / (entryEnd - entryStart)));
    const hero = smooth(clamp(scrollY / Math.min(entryEnd, viewport * HOME_MOTION.sections.heroTravel)));
    const arrival = smooth(clamp((viewport - foundationTop) / (viewport * HOME_MOTION.sections.exitTravel)));
    page.style.setProperty('--story-progress', String(pinned ? entry : 1));
    const copyStart = HOME_MOTION.sections.copyStart;
    page.style.setProperty('--copy-progress', String(pinned ? smooth(clamp((entry - copyStart) / (1 - copyStart))) : 1));
    page.style.setProperty('--hero-departure', String(hero));
    page.style.setProperty('--showcase-departure', String(pinned ? arrival : 0));
    page.style.setProperty('--foundation-arrival', String(arrival));
  }
  function schedule() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => { frame = 0; paint(); });
  }
  page.style.setProperty('--section-hero-distance', HOME_MOTION.sections.heroDistance + 'px');
  page.style.setProperty('--section-exit-distance', HOME_MOTION.sections.exitDistance + 'px');
  page.style.setProperty('--section-foundation-distance', HOME_MOTION.sections.foundationDistance + 'px');
  page.style.setProperty('--section-duration', HOME_MOTION.sections.duration + 'ms');
  window.addEventListener('scroll', schedule, { passive: true, signal: events.signal });
  window.addEventListener('resize', schedule, { signal: events.signal });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  resize?.observe(page);
  document.fonts?.ready.then(schedule);
  paint();
  // Apply the restored scroll position before enabling temporal interpolation.
  page.classList.add('section-motion');
  return { dispose() {
    disposed = true; events.abort(); resize?.disconnect(); cancelAnimationFrame(frame);
    page.classList.remove('section-motion');
    [...properties, '--section-hero-distance', '--section-exit-distance', '--section-foundation-distance', '--section-duration'].forEach(property => page.style.removeProperty(property));
  } };
}
