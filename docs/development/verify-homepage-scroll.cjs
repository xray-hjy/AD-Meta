// Logic regression checks with the actual bundled Swiper, not a fake carousel.
// jsdom has no layout/CSS transitions; geometry and transition completion are
// supplied here. These checks do not assess visual smoothness on real hardware.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('../../frontend/node_modules/jsdom');
const portable = process.argv.includes('--portable');
const html = fs.readFileSync(path.join(__dirname, portable ? '../previews/homepage-motion-demo.html' : 'homepage-layout-demo.html'), 'utf8');
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => {
  // Swiper 14 ships valid native CSS nesting, which jsdom 26 cannot parse.
  // CSS rendering is outside the scope of this logic-only verification.
  if (error.type === 'css parsing' && error.detail?.includes('Swiper 14.3.0')) return;
  throw error;
});
const dom = new JSDOM(html, { url: 'https://demo.local/#showcase', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
const w = dom.window;
w.innerWidth = 1600;
w.innerHeight = 1000;
let reduceMotion = false;
w.matchMedia = () => ({ get matches() { return reduceMotion; }, addEventListener() {} });
w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
w.DOMMatrixReadOnly = class {
  constructor(value) {
    const match = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(value);
    this.m41 = match ? Number(match[1]) : 0;
    this.m42 = match ? Number(match[2]) : 0;
  }
};
let scroll = 0;
Object.defineProperty(w, 'scrollY', { get: () => scroll });
w.scrollTo = ({ top }) => { scroll = top; w.dispatchEvent(new w.Event('scroll')); };
const prototype = w.HTMLElement.prototype;
Object.defineProperties(prototype, {
  offsetParent: { get() {
    if (this.classList.contains('chapter-track')) return w.document.getElementById('showcase');
    if (this.classList.contains('chapter')) return this.parentElement;
    return this.closest('.chapter') || null;
  } },
  offsetTop: { get() {
    if (this.id === 'showcase') return 1000;
    if (this.classList.contains('chapter-track')) {
      const tracks = [...w.document.querySelectorAll('.chapter-track')];
      return tracks.slice(0, tracks.indexOf(this)).reduce((height, track) => height + parseFloat(track.style.getPropertyValue('--track-height') || 0), 0);
    }
    if (this.classList.contains('chapter-content')) return 180;
    if (this.matches('h3')) return 180;
    if (this.classList.contains('chapter-index')) return 130;
    if (this.classList.contains('chapter-link')) return 580;
    return 0;
  } },
  offsetHeight: { get() {
    if (this.classList.contains('site-header')) return 70;
    if (this.classList.contains('visual-stage')) return 834;
    if (this.classList.contains('chapter-content')) return 474;
    if (this.id === 'showcase') return 14500;
    return 60;
  } },
  clientWidth: { get() { return this.classList.contains('stage-slide') ? parseFloat(this.style.width) || 820 : this.id === 'stage-carousel' || this.classList.contains('stage-rail') ? 1000 : 1600; } },
  clientHeight: { get() { return this.id === 'stage-carousel' ? 650 : 1000; } },
  offsetWidth: { get() { return this.classList.contains('stage-slide') ? parseFloat(this.style.width) || 820 : 1000; } },
});
const computedStyle = w.getComputedStyle.bind(w);
w.getComputedStyle = (element, pseudo) => {
  const style = computedStyle(element, pseudo);
  if (!element.classList.contains('stage-slide')) return style;
  return new Proxy(style, { get(target, key) {
    if (key === 'getPropertyValue') return name => name === 'width' ? element.style.width || '820px' : name === 'box-sizing' ? 'border-box' : target.getPropertyValue(name);
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
};
prototype.getBoundingClientRect = function () {
  return { top: this.classList.contains('site-header') ? 44 : this.offsetTop - scroll, left: 60, width: 1000, height: this.offsetHeight, bottom: this.offsetHeight, right: 1060 };
};
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
w.eval(portable ? scripts.find(match => match[1].includes('var Swiper=')).at(1) : fs.readFileSync(path.join(__dirname, 'vendor/swiper-14.3.0/swiper-bundle.min.js'), 'utf8'));
w.eval(scripts.at(-1)[1] + `\nwindow.demoTest = {
  state: () => ({ domain: activeDomain, target: galleryTargetPosition, position: readGalleryPosition(), owned: galleryInputOwned, swiper: gallerySwiper, scroll: scrollY, rendered: renderedScroll }),
  enter(domain, index = 0) { clearWheelGesture(); setDomain(domain); animateGalleryTo(index, { immediate: true }); syncScrollToGallery(index); updateFromScroll({ immediate: true }); },
  paint: () => updateFromScroll({ immediate: true }),
  reset: () => { clearWheelGesture(); galleryInputOwned = false; },
  nextChapterTop: () => chapterTimelines[1].start + chapterTimelines[1].hold,
  timelines: () => chapterTimelines,
  cache: () => galleryCache,
};`);
const api = w.demoTest;
function wheel(deltaY, options = {}) {
  const event = new w.WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...options });
  w.document.getElementById('stage-carousel').dispatchEvent(event);
  return event;
}
function finishTransition() {
  w.document.getElementById('stage-gallery').dispatchEvent(new w.Event('transitionend', { bubbles: true }));
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  api.enter('species');
  const chapters = [...w.document.querySelectorAll('.chapter')];
  function assertReader(domain) {
    const reader = w.document.querySelector('.chapter-reader');
    const timeline = w.document.querySelector('.chapter-timeline');
    const readerStyle = computedStyle(reader);
    assert.equal(computedStyle(reader.parentElement).display, 'grid', 'reader and timeline share the full chapter-list grid row');
    assert.equal(readerStyle.gridArea, computedStyle(timeline).gridArea, 'timeline overlaps the reader without a negative margin');
    assert.equal(readerStyle.marginBottom, '0px', 'sticky reader retains its full margin-box height at the section exit');
    assert.equal(readerStyle.alignSelf, 'start', 'reader does not stretch to the full timeline height');
    assert.equal(readerStyle.top, computedStyle(w.document.querySelector('.stage-rail')).top, 'both columns share the sticky top');
    assert.equal(computedStyle(w.document.getElementById('showcase')).overflow, 'clip', 'showcase content cannot paint into the following section');
    assert.equal(w.document.querySelectorAll('.chapter-timeline > .chapter-track').length, 4);
    assert.equal(w.document.querySelectorAll('.chapter-reader > .chapter').length, 4, 'all desktop chapters share one pinned viewport');
    assert.equal(w.document.querySelectorAll('.chapter-track > .chapter').length, 0, 'scroll spacers do not display duplicate live text');
    assert.equal(w.document.querySelectorAll('.chapter.is-active').length, 1);
    for (const chapter of chapters) {
      const active = chapter.dataset.domain === domain;
      assert.equal(computedStyle(chapter).visibility, active ? 'visible' : 'hidden');
      assert.equal(chapter.inert, !active);
      assert.equal(chapter.hasAttribute('aria-hidden'), !active);
      assert.equal(chapter.style.getPropertyValue('--preview-top-height'), '70.0px');
      assert.equal(chapter.style.getPropertyValue('--preview-bottom-height'), '70.0px');
      for (const preview of chapter.querySelectorAll('.chapter-preview')) {
        const neighbor = chapters.find(item => item.dataset.domain === preview.dataset.neighbor);
        const context = preview.querySelector('.chapter-preview__content');
        const original = neighbor.querySelector('.chapter-content');
        for (const selector of ['.chapter-index', 'h3', '.chapter-copy', 'ul', '.chapter-link']) {
          assert.equal(context.querySelector(selector).textContent, original.querySelector(selector).textContent, 'both neighbors preserve the complete source text');
        }
        assert.equal(context.querySelectorAll('.reveal-item').length, 0, 'context opacity is not multiplied by the original reveal state');
        assert.equal(computedStyle(context.querySelector('h3')).fontSize, computedStyle(original.querySelector('h3')).fontSize, 'context keeps the same heading typography');
      }
    }
  }
  assertReader('species');
  const originalSpeciesSwiper = api.state().swiper;
  const timelines = api.timelines();
  for (let index = 0; index < timelines.length - 1; index++) {
    const current = timelines[index];
    const lastAnchor = current.start + current.hold + (current.chapter.dataset.domain === 'custom' ? 4 : 3) * current.step;
    assert.equal(timelines[index + 1].start - lastAnchor, 96, 'native module boundary has no repeated viewport-sized dead gap');
  }
  assert.equal(api.state().swiper.size, 1000);
  assert.equal(api.state().swiper.params.effect, 'coverflow');
  assert.equal(api.state().swiper.params.centeredSlides, true);
  assert.equal(api.state().swiper.slidesSizesGrid[0], 820);
  assert.equal(api.state().swiper.slidesGrid[0], -90, '82%-wide first card has a centering offset');
  assert.equal(api.state().position, 0, 'centering offset is not mistaken for gallery progress');
  assert(api.state().swiper.slides[1].style.transform.includes('rotateY'), 'side preview receives the actual coverflow transform');
  assert.equal(w.document.querySelectorAll('.stage-dots').length, 0, 'gallery is no longer framed as a browser window');
  for (const slide of api.state().swiper.slides) {
    const card = slide.querySelector('.stage-slide__sheet');
    const image = card.querySelector('img');
    const width = parseFloat(card.style.width), height = parseFloat(card.style.height);
    assert(width <= 800 && height <= 602, 'complete screenshot fits the scene bounds');
    assert(Math.abs(width / height - image.width / image.height) < .001, 'card matches the actual screenshot aspect ratio');
  }
  assert(api.state().swiper.slidesSizesGrid[3] < api.state().swiper.slidesSizesGrid[0], 'portrait panel is fitted as a narrower card');
  assert.equal(wheel(100).defaultPrevented, true);
  assert.equal(api.state().target, 1, 'one notch advances immediately');
  wheel(100);
  wheel(100);
  assert.equal(api.state().target, 3, 'rapid input retargets across images before any transition completes');
  assert.equal(api.state().swiper.params.speed, 420);
  finishTransition();
  assert.equal(api.state().position, 3);
  assert.equal(wheel(100).defaultPrevented, true, 'one tick at the aligned final image enters the next module');
  assert.equal(api.state().domain, 'function');
  assert.equal(api.state().target, 0);
  assert.equal(wheel(-100).defaultPrevented, true, 'one reverse tick returns to the previous module');
  assert.equal(api.state().domain, 'species');
  assert.equal(api.state().target, 3, 'reverse module navigation resumes at its final picture');
  assert.equal(api.state().swiper, originalSpeciesSwiper, 'returning to a module reuses its Swiper instance');
  assert.equal(originalSpeciesSwiper.destroyed, undefined);
  const oldLastScroll = api.state().scroll;
  w.scrollTo({ top: oldLastScroll + 100 });
  await wait(30);
  assert.equal(api.state().domain, 'function', 'one native 100px scroll crosses a module boundary');
  assert.equal(api.state().rendered, api.state().scroll, 'chapter paint uses the native position without an extra smoothing lag');

  api.enter('function', 2);
  wheel(100);
  wheel(100);
  assert.equal(api.state().domain, 'function', 'boundary input waits only for the final picture currently moving');
  finishTransition();
  await wait(30);
  assert.equal(api.state().domain, 'mag', 'input during final-picture movement is retained and crosses the boundary');
  assert.equal(api.state().target, 0);
  await wait(30);
  assert.equal(api.state().domain, 'mag', 'a boundary intent cannot replay as a queue of module jumps');

  api.enter('function', 2);
  wheel(100);
  wheel(100);
  wheel(-100);
  finishTransition();
  await wait(30);
  assert.equal(api.state().domain, 'function', 'reverse input cancels a pending forward boundary');
  assert.equal(api.state().target, 2);

  api.enter('species');
  wheel(280);
  assert.equal(api.state().target, 3, 'large wheel input traverses several pictures directly');
  wheel(120);
  assert.equal(api.state().swiper.animating, true, 'same endpoint input does not interrupt the ongoing transition');
  wheel(-100);
  assert.equal(api.state().target, 2, 'reverse input cancels the former direction immediately');
  finishTransition();

  api.enter('species');
  wheel(3, { deltaMode: 1 });
  assert.equal(api.state().target, 1, 'line-mode mouse wheel is normalized');
  finishTransition();

  api.enter('species');
  wheel(8);
  assert(api.state().position > 0 && api.state().position < 1, 'fine input uses real Swiper continuous translation');
  await wait(180);
  assert.equal(api.state().target, 1, 'short fine gesture snaps forward to a complete picture');
  finishTransition();

  api.enter('species');
  const headerWheel = new w.WheelEvent('wheel', { deltaY: 8, bubbles: true, cancelable: true });
  w.document.querySelector('.site-header').dispatchEvent(headerWheel);
  assert.equal(headerWheel.defaultPrevented, true, 'fine wheel input over the floating header follows the pinned gallery');
  await wait(180); finishTransition();
  assert.equal(api.state().target, 1);

  api.enter('species');
  for (let i = 0; i < 10; i++) wheel(35);
  assert(Math.abs(api.state().position - 1050 / 820) < .00001, 'continuous progress accounts for card width and centering');
  await wait(180); finishTransition();
  assert.equal(api.state().position, 2, 'continuous gesture finishes on a whole image');

  api.enter('custom');
  assert.equal(api.cache().size, 4);
  assert.equal(w.document.querySelectorAll('.stage-carousel').length, 4, 'one scene per visited module, with no cloned image tracks');
  assert.equal(w.document.querySelectorAll('.stage-gallery-back').length, 0);
  wheel(360);
  assert.equal(api.state().target, 3);
  wheel(120);
  assert.equal(api.state().target, 4, 'five-picture gallery has the correct endpoint');
  finishTransition();
  assert.equal(wheel(100).defaultPrevented, false);

  api.enter('species');
  assert.equal(wheel(-100).defaultPrevented, false, 'first picture releases upward page scrolling');
  assert.equal(wheel(100, { ctrlKey: true }).defaultPrevented, false, 'browser zoom is untouched');
  assert.equal(wheel(10, { deltaX: 100 }).defaultPrevented, false, 'unrelated horizontal gesture is untouched');
  w.scrollTo({ top: 0 }); api.paint();
  assert.equal(wheel(100).defaultPrevented, false, 'wheel outside story is native');

  w.scrollTo({ top: api.nextChapterTop() }); api.paint();
  assert.equal(api.state().domain, 'function', 'native page scroll switches chapters');
  assertReader('function');
  wheel(100); finishTransition();
  assert.equal(api.state().target, 1, 'replacement Swiper instance responds in the next chapter');
  assert.equal(w.document.querySelectorAll('.chapter-preview').length, 6);
  assert.equal(w.document.querySelectorAll('.stage-gallery').length >= 1, true);
  api.enter('function');
  api.state().swiper.slides[1].querySelector('button').click();
  assert.equal(api.state().target, 1, 'clicking an adjacent preview focuses that card');
  finishTransition();
  w.innerWidth = 760;
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(w.document.querySelectorAll('.chapter-reader > .chapter').length, 0);
  assert.notEqual(computedStyle(w.document.querySelector('.chapter-list')).display, 'grid', 'mobile uses normal flow rather than overlapping grid layers');
  assert.equal(w.document.querySelectorAll('.chapter-track > .chapter').length, 4, 'mobile restores chapters to the native document flow');
  assert(chapters.every(chapter => !chapter.inert && !chapter.hasAttribute('aria-hidden')), 'mobile text remains accessible');
  assert.equal(wheel(100).defaultPrevented, false, 'mobile wheel stays native');
  const mobileGallery = w.document.querySelector('.chapter[data-domain="' + api.state().domain + '"] .mobile-gallery');
  const beforeMobile = api.state().target;
  mobileGallery.querySelector('.mobile-gallery__actions button:last-child').click();
  assert.equal(api.state().target, (beforeMobile + 1) % 4, 'mobile controls synchronize with the shared gallery');
  w.innerWidth = 1600;
  w.dispatchEvent(new w.Event('resize'));
  assertReader(api.state().domain);
  // Exercise the browser animation path separately. We inspect actual requested
  // keyframes and control completion; jsdom cannot render their intermediate pixels.
  const animationCalls = [];
  prototype.animate = function (frames, options) {
    let resolve;
    const finished = new Promise(done => { resolve = done; });
    const animation = { element: this, frames, options, cancelled: false, finished,
      cancel() { this.cancelled = true; resolve(); }, finish() { resolve(); } };
    animationCalls.push(animation);
    return animation;
  };
  const bodyCalls = () => animationCalls.filter(call => call.element.classList.contains('chapter-content') && !call.element.classList.contains('chapter-preview__content'));
  api.enter('species');
  let transition = bodyCalls().slice(-2);
  assert.equal(transition[0].frames.at(-1).transform, 'translateY(32px)', 'upward chapter navigation moves old text downward');
  assert.equal(transition[1].frames[0].transform, 'translateY(-40px)', 'previous chapter enters from above');
  assert.equal(transition[1].options.duration, 420);
  assert.equal(w.document.querySelectorAll('.chapter.is-leaving').length, 1, 'old body remains visible for its exit animation');
  api.enter('function');
  assert(transition.every(call => call.cancelled), 'rapid reversal cancels the earlier motion');
  transition = bodyCalls().slice(-2);
  assert.equal(transition[0].frames.at(-1).transform, 'translateY(-32px)', 'forward chapter navigation exits upward');
  assert.equal(transition[1].frames.at(-1).opacity, 1);
  assert(animationCalls.some(call => call.element.classList.contains('chapter-preview') && call.frames.at(-1).opacity === .36), 'context previews enter with the body');
  api.enter('mag');
  api.enter('custom');
  assert.equal(w.document.querySelectorAll('.chapter.is-leaving').length, 1, 'rapid multi-chapter jumps retain only the latest outgoing body');
  for (const chapter of chapters) {
    assert([...chapter.querySelector('.chapter-content').querySelectorAll('.reveal-item')].every(part => part.style.getPropertyValue('--reveal') === '1.0000'), 'pinned text does not also use offscreen reveal opacity');
  }
  for (const call of animationCalls) call.finish();
  await wait(0);
  assert.equal(w.document.querySelectorAll('.chapter.is-leaving, .chapter.is-changing').length, 0, 'completed transitions clean up temporary visibility');
  assertReader('custom');
  assert.equal(w.document.querySelectorAll('.stage-carousel.is-exiting, .stage-carousel.is-moving').length, 0, 'gallery motion also cleans up after completion');
  assert.equal(api.cache().get('species').swiper, originalSpeciesSwiper);
  for (const [domain, cached] of api.cache()) {
    assert.equal(cached.scene.inert, domain !== 'custom', 'parked scenes cannot intercept input');
    assert.equal(cached.scene.classList.contains('is-parked'), domain !== 'custom');
  }
  api.enter('mag');
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(w.document.querySelectorAll('.chapter.is-leaving').length, 0, 'resize cancels active text transitions');
  reduceMotion = true;
  w.dispatchEvent(new w.Event('resize'));
  const beforeReduced = bodyCalls().length;
  api.enter('function');
  assert.equal(bodyCalls().length, beforeReduced, 'reduced-motion preference skips text transitions');
  api.reset();
  dom.window.close();
  console.log('PASS (' + (portable ? 'portable' : 'source') + '): bounded sticky reader/grid layers, section clipping/mobile flow, responsive module boundaries, cached galleries and directional transitions.');
})().catch(error => { console.error(error.message); dom.window.close(); process.exitCode = 1; });
