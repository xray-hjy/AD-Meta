import { createSectionMotionController } from './createSectionMotionController';
import { createSectionRegistry } from './createSectionRegistry';
import { heroSectionMotion, showcaseSectionMotion, revealSectionMotion } from './sectionMotionPresets';

let page, controller, registry, y;
beforeEach(() => {
  vi.useFakeTimers(); y = 0;
  vi.stubGlobal('innerHeight', 1000);
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(10000);
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y);
  page = document.createElement('div');
  page.innerHTML = '<header class="site-header"></header><section class="hero"><div class="hero-surface"></div><div class="hero-chart-backdrop"></div></section><div class="story-layout"><div class="visual-stage"></div><div class="chapter-reader"></div><div class="chapter-list"></div></div><section class="evidence"><div class="evidence-inner"></div></section>';
  document.body.append(page);
  page.style.setProperty('--stage-top', '150px');
  page.querySelector('.site-header').getBoundingClientRect = () => ({ height: 126 });
  for (const [selector, top] of [['.hero', 0], ['.story-layout', 700], ['.evidence', 5000]]) {
    page.querySelector(selector).getBoundingClientRect = () => ({ top: top - y, bottom: top + 1000 - y, height: 1000 });
  }
  registry = createSectionRegistry();
  for (const [id, selector, motion] of [['hero', '.hero', heroSectionMotion], ['showcase', '.story-layout', showcaseSectionMotion], ['foundation', '.evidence', revealSectionMotion]]) {
    registry.register({ id, element: page.querySelector(selector), motion });
  }
});
afterEach(() => { controller?.dispose(); page.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function scroll(top) { y = top; window.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(20); }
const opacity = selector => Number(page.querySelector(selector).style.opacity);

test('keeps the initial hero intact, transitions boundaries continuously and reverses on upward scrolling', async () => {
  controller = createSectionMotionController(page, true, registry);
  expect(opacity('.hero-surface')).toBe(1);
  await scroll(120);
  expect(opacity('.hero-surface')).toBeGreaterThan(0);
  expect(opacity('.hero-surface')).toBeLessThan(1);
  expect(page.style.getPropertyValue('--section-duration')).toBe('620ms');
  await scroll(275);
  expect(opacity('.visual-stage')).toBeCloseTo(.64);
  await scroll(550);
  expect(opacity('.visual-stage')).toBe(1);
  await scroll(4250);
  const arrival = opacity('.evidence-inner');
  expect(arrival).toBeGreaterThan(0);
  expect(arrival).toBeLessThan(1);
  expect(opacity('.chapter-reader')).toBeCloseTo(1 - .85 * arrival);
  await scroll(4700);
  expect(opacity('.evidence-inner')).toBe(1);
  await scroll(0);
  expect(opacity('.hero-surface')).toBe(1);
  expect(opacity('.evidence-inner')).toBe(0);
});

test('flow layout remains visible and disposal removes pending frames and owned styles', async () => {
  controller = createSectionMotionController(page, false, registry);
  expect(opacity('.chapter-list')).toBe(1);
  expect(opacity('.visual-stage')).toBe(1);
  await scroll(4250);
  expect(opacity('.chapter-reader')).toBe(1);
  window.dispatchEvent(new Event('scroll'));
  controller.dispose();
  await vi.runAllTimersAsync();
  expect(page).not.toHaveClass('section-motion');
  expect(page.querySelector('.evidence-inner').style.opacity).toBe('');
  expect(page.querySelector('.hero-surface').style.transform).toBe('');
  expect(vi.getTimerCount()).toBe(0);
});

test('scroll writes compositor properties on display surfaces and skips unchanged values', async () => {
  controller = createSectionMotionController(page, true, registry);
  expect(page.style.getPropertyValue('--story-progress')).toBe('');
  expect(page.querySelector('.hero').style.getPropertyValue('--hero-departure')).toBe('');
  const surface = page.querySelector('.hero-surface');
  const unchanged = surface.getAttribute('style');
  await scroll(0);
  expect(surface.getAttribute('style')).toBe(unchanged);
  await scroll(120);
  expect(surface.getAttribute('style')).not.toBe(unchanged);
  expect(page.querySelector('.evidence-inner').style.opacity).toBe('0');
});

test('new sections participate in transitions in DOM order and removed surfaces are cleaned', async () => {
  controller = createSectionMotionController(page, true, registry);
  const extra = document.createElement('section');
  extra.innerHTML = '<div data-section-surface>Future research section</div>';
  page.querySelector('.evidence').before(extra);
  extra.getBoundingClientRect = () => ({ top: 2500 - y, bottom: 3500 - y, height: 1000 });
  const unregister = registry.register({ id: 'research', element: extra, motion: revealSectionMotion });
  await scroll(1800);
  expect(Number(extra.firstElementChild.style.opacity)).toBeGreaterThan(0);
  expect(opacity('.chapter-reader')).toBeLessThan(1);
  unregister(); extra.remove();
  await scroll(1800);
  expect(extra.firstElementChild.style.opacity).toBe('');
  expect(opacity('.chapter-reader')).toBe(1);
});
