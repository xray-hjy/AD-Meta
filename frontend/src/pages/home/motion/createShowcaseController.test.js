import { createShowcaseController } from './createShowcaseController';
import { HOME_CHAPTERS } from '../homeContent';
import { HOME_MOTION } from './motionConfig';

// Use the installed Swiper. jsdom supplies neither layout nor CSS transition
// completion; only those browser facilities are represented by this fixture.
let controller, page, scrollTop;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('innerWidth', 1600);
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('DOMMatrixReadOnly', class {
    constructor(value) {
      const match = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(value);
      this.m41 = match ? Number(match[1]) : 0;
      this.m42 = match ? Number(match[2]) : 0;
    }
  });
  scrollTop = 0;
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollTop);
  vi.spyOn(window, 'scrollTo').mockImplementation(({ top }) => { scrollTop = top; window.dispatchEvent(new Event('scroll')); });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () { return this.classList.contains('stage-slide') ? parseFloat(this.style.width) : 1000; });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(650);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return parseFloat(this.style.width) || 1000; });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.classList.contains('chapter-content') ? 460 : 834; });
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(180);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const tracks = [...page.querySelectorAll('.chapter-track')];
    const precedingHeight = tracks.slice(0, tracks.indexOf(this)).reduce((total, track) => total + parseFloat(track.style.height || 0), 0);
    const top = this.classList.contains('chapter-track') ? 1000 + precedingHeight - scrollTop : 44;
    return { top, bottom: this.classList.contains('site-header') ? 110 : top + 834, left: 60, right: 1060, width: 1000, height: 834 };
  });
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const style = computed(element);
    return new Proxy(style, { get(target, key) {
      if (key === 'getPropertyValue') return name => name === 'width' ? element.style.width || '1000px' : name === 'box-sizing' ? 'border-box' : target.getPropertyValue(name);
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  });
  page = document.createElement('div');
  page.innerHTML = `<header class="site-header"></header><div class="story-layout">
    <div class="stage-rail"><div class="visual-stage"><div class="stage-image-wrap"></div></div></div>
    <div class="chapter-reader">${HOME_CHAPTERS.map(chapter => `<article data-home-chapter="${chapter.key}"><div class="chapter-content">${chapter.label}</div><div class="chapter-preview"></div></article>`).join('')}</div>
    <div class="chapter-timeline">${HOME_CHAPTERS.map(() => '<div class="chapter-track"></div>').join('')}</div></div>`;
  document.body.append(page);
  controller = createShowcaseController({ page, story: page.querySelector('.story-layout'), host: page.querySelector('.stage-image-wrap'), chapters: HOME_CHAPTERS, onSelection: vi.fn(), onOpen: vi.fn(), dialogOpen: () => false });
  controller.goto('species');
});
afterEach(() => { controller?.dispose(); page?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function wheel(deltaY, options = {}) {
  const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...options });
  page.querySelector('.stage-image-wrap').dispatchEvent(event);
  return event;
}
function finishSlide() { controller.state().swiper.wrapperEl.dispatchEvent(new Event('transitionend', { bubbles: true })); }

test('one notch advances one image, a large input advances several, and the final image releases to the next chapter', () => {
  expect(wheel(120).defaultPrevented).toBe(true);
  expect(controller.state().target).toBe(1);
  finishSlide();
  vi.advanceTimersByTime(HOME_MOTION.gestureGap + 1);
  wheel(360);
  expect(controller.state().target).toBe(3);
  finishSlide();
  wheel(120);
  expect(controller.state()).toMatchObject({ key: 'function', target: 0 });
  finishSlide();
  wheel(-120);
  expect(controller.state()).toMatchObject({ key: 'species', target: 3 });
});

test('retains one boundary intent during the final transition and cancels it when direction reverses', () => {
  wheel(360);
  wheel(120);
  finishSlide();
  vi.advanceTimersByTime(20);
  expect(controller.state().key).toBe('function');
  controller.goto('species');
  wheel(360);
  wheel(120);
  wheel(-120);
  finishSlide();
  vi.advanceTimersByTime(20);
  expect(controller.state()).toMatchObject({ key: 'species', target: 2 });
});

test('snaps fine wheel input to a complete picture after idle', () => {
  wheel(12);
  vi.advanceTimersByTime(HOME_MOTION.idleSnapDelay + 1);
  finishSlide();
  expect(controller.state().position).toBe(controller.state().target);
  expect(Number.isInteger(controller.state().target)).toBe(true);
});

test('native scrolling selects chapters, preserves the short boundary gap, and reuses cached Swiper instances', () => {
  const firstSwiper = controller.state().swiper;
  const { timelines } = controller.state();
  expect(timelines[1].start - (timelines[0].start + timelines[0].hold + 3 * timelines[0].step)).toBe(HOME_MOTION.chapterGap);
  window.scrollTo({ top: timelines[2].start + timelines[2].hold });
  vi.advanceTimersByTime(20);
  expect(controller.state().key).toBe('mag');
  controller.goto('species');
  expect(controller.state().swiper).toBe(firstSwiper);
  expect(page.querySelectorAll('.stage-carousel:not(.is-parked)')).toHaveLength(1);
});

test('releases native scrolling outside the section, ignores browser zoom, and removes every cached scene on exit', () => {
  expect(wheel(120, { ctrlKey: true }).defaultPrevented).toBe(false);
  controller.goto('custom');
  wheel(480); finishSlide();
  expect(wheel(120).defaultPrevented).toBe(false);
  const instances = [...page.querySelectorAll('.stage-carousel')].map(element => element.swiper);
  controller.dispose(); controller = null;
  expect(instances.every(swiper => swiper.destroyed)).toBe(true);
  expect(page.querySelectorAll('.stage-carousel')).toHaveLength(0);
  expect(wheel(120).defaultPrevented).toBe(false);
});
