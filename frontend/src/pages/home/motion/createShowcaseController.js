import { createGalleryController } from './createGalleryController';
import { createWheelInput } from './createWheelInput';
import { createPanelTransition } from './panelTransition';
import { HOME_MOTION, clamp } from './motionConfig';
import { positionOnTimeline } from './galleryGeometry';

// Orchestration for the desktop showcase only. React supplies the markup and
// data; this module measures its tracks and connects scroll to the gallery API.
export function createShowcaseController({ page, story, host, chapters, onSelection, onOpen, dialogOpen }) {
  const events = new AbortController();
  const transition = createPanelTransition({ config: HOME_MOTION.chapter, exitClass: 'is-leaving', contentSelector: '.chapter-content', previewSelector: '.chapter-preview' });
  const articles = chapters.map(chapter => story.querySelector(`[data-home-chapter="${chapter.key}"]`));
  const tracks = [...story.querySelectorAll('.chapter-track')];
  const stage = story.querySelector('.visual-stage');
  const rail = story.querySelector('.stage-rail');
  const header = page.querySelector('.site-header');
  let timelines = [], currentKey = chapters[0].key, frame = 0, disposed = false, syncing = false;
  let input, gallery;
  const chapterIndex = key => chapters.findIndex(chapter => chapter.key === key);
  function setActive(key, index, immediate = false) {
    const previousIndex = chapterIndex(currentKey), nextIndex = chapterIndex(key);
    articles.forEach((article, i) => {
      const active = i === nextIndex;
      article.classList.toggle('is-active', active);
      article.inert = !active;
      if (active) article.removeAttribute('aria-hidden'); else article.setAttribute('aria-hidden', 'true');
    });
    if (key !== currentKey) {
      input?.clear();
      transition.play(articles[previousIndex], articles[nextIndex], Math.sign(nextIndex - previousIndex), immediate);
    }
    currentKey = key;
    gallery.activate(key, index, immediate);
    stage.style.setProperty('--gallery-accent', chapters[nextIndex].accent);
  }
  function anchor(index) {
    const timeline = timelines[chapterIndex(currentKey)];
    if (!timeline || disposed) return;
    syncing = true;
    window.scrollTo({ top: timeline.start + timeline.hold + index * timeline.step, behavior: 'instant' });
    syncing = false;
  }
  function boundary(direction) {
    const state = gallery.state();
    const next = chapters[chapterIndex(currentKey) + direction];
    if (!next || state.target !== (direction > 0 ? state.last : 0)) return false;
    const index = direction > 0 ? 0 : next.slides.length - 1;
    setActive(next.key, index);
    anchor(index);
    paint();
    return true;
  }
  gallery = createGalleryController(host, chapters, {
    onSelection(key, index) {
      const last = chapters[chapterIndex(key)].slides.length - 1;
      stage.style.setProperty('--gallery-completion', String(index / Math.max(1, last)));
      onSelection({ key, index });
    },
    onMove(index, options) { input?.move(index, options); },
    onEnd() { input?.end(); },
    onOpen,
  });
  input = createWheelInput({ gallery, onAnchor: anchor, onBoundary: boundary, eligible(event) {
    if (disposed || event.ctrlKey || event.metaKey || event.defaultPrevented || !event.cancelable || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)
      || dialogOpen() || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return false;
    // Select the chapter from the native position before deciding who owns
    // this event, even if the pending scroll animation frame has not run yet.
    paint();
    const timeline = timelines[chapterIndex(currentKey)];
    return timeline && scrollY >= timeline.start - 24 && scrollY <= timeline.start + timeline.range + 24;
  } });
  function measure() {
    if (disposed) return;
    transition.clear();
    const height = stage.offsetHeight;
    const top = Math.max(header.getBoundingClientRect().bottom + 24, (innerHeight + header.getBoundingClientRect().bottom - height) / 2);
    page.style.setProperty('--stage-height', height + 'px');
    page.style.setProperty('--stage-top', top + 'px');
    const bounds = rail.getBoundingClientRect();
    page.style.setProperty('--stage-center-x', (innerWidth / 2 - bounds.left - rail.clientWidth / 2) + 'px');
    const hold = HOME_MOTION.chapterHold;
    const step = Math.max(HOME_MOTION.minimumSlideTravel, innerHeight * HOME_MOTION.slideTravelRatio);
    const ranges = chapters.map(chapter => hold + (chapter.slides.length - 1) * step + HOME_MOTION.chapterGap);
    tracks.forEach((track, i) => { track.style.height = (ranges[i] + (i === tracks.length - 1 ? height : 0)) + 'px'; });
    timelines = tracks.map((track, i) => ({ start: track.getBoundingClientRect().top + scrollY - top, range: ranges[i], hold, step }));
    const gap = clamp(innerHeight * HOME_MOTION.contextGap.ratio, HOME_MOTION.contextGap.min, HOME_MOTION.contextGap.max);
    articles.forEach(article => {
      const content = article.querySelector('.chapter-content');
      article.style.setProperty('--preview-top-height', Math.max(0, content.offsetTop - gap) + 'px');
      article.style.setProperty('--preview-bottom-height', Math.max(0, height - content.offsetTop - content.offsetHeight - gap) + 'px');
    });
    input.clear(); gallery.resize(); paint();
  }
  function paint() {
    if (disposed || !timelines.length) return;
    let i = 0;
    timelines.forEach((timeline, index) => { if (scrollY >= timeline.start) i = index; });
    const chapter = chapters[i];
    const position = positionOnTimeline(timelines[i], scrollY, chapter.slides.length - 1);
    if (currentKey !== chapter.key) setActive(chapter.key, Math.round(position));
    else if (!input.isOwned() && Math.round(position) !== gallery.state()?.target) gallery.go(position);
  }
  function onScroll() {
    if (syncing || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; paint(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true, signal: events.signal });
  window.addEventListener('resize', measure, { signal: events.signal });
  host.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); input.move(gallery.state().target + (event.key === 'ArrowRight' ? 1 : -1));
  }, { signal: events.signal });
  setActive(currentKey, 0, true);
  measure();
  document.fonts?.ready.then(() => { if (!disposed) measure(); });
  return {
    goto(key) { setActive(key, 0); anchor(0); paint(); },
    shift(direction) { input.move(gallery.state().target + direction); },
    state: () => ({ ...gallery.state(), timelines }),
    sectionStops() {
      if (!timelines.length) return null;
      const first = timelines[0], last = timelines.at(-1);
      return { start: first.start + first.hold, end: last.start + last.hold + (chapters.at(-1).slides.length - 1) * last.step };
    },
    isBusy: () => input.isOwned() || Boolean(gallery.state()?.swiper.animating),
    dispose() {
      disposed = true; events.abort(); cancelAnimationFrame(frame);
      input.dispose(); transition.clear(); gallery.dispose();
      articles.forEach(article => { article.inert = false; article.classList.remove('is-active', 'is-leaving', 'is-changing'); article.removeAttribute('aria-hidden'); });
      tracks.forEach(track => { track.style.removeProperty('height'); });
      for (const property of ['--stage-height', '--stage-top', '--stage-center-x']) page.style.removeProperty(property);
    },
  };
}
