import { createSectionMotionController } from './createSectionMotionController';

let page, controller, y;
beforeEach(() => {
  vi.useFakeTimers(); y = 0;
  vi.stubGlobal('innerHeight', 1000);
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y);
  page = document.createElement('div');
  page.innerHTML = '<header class="site-header"></header><div class="story-layout"></div><section class="evidence"></section>';
  document.body.append(page);
  page.style.setProperty('--stage-top', '150px');
  page.querySelector('.story-layout').getBoundingClientRect = () => ({ top: 700 - y });
  page.querySelector('.evidence').getBoundingClientRect = () => ({ top: 5000 - y });
});
afterEach(() => { controller?.dispose(); page.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function scroll(top) { y = top; window.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(20); }
const value = name => Number(page.style.getPropertyValue('--' + name));

test('keeps the initial hero intact, transitions both boundaries continuously and reverses on upward scrolling', async () => {
  controller = createSectionMotionController(page, true);
  expect(value('hero-departure')).toBe(0);
  await scroll(120);
  expect(value('hero-departure')).toBeGreaterThan(0);
  expect(value('hero-departure')).toBeLessThan(1);
  expect(page.style.getPropertyValue('--section-duration')).toBe('620ms');
  await scroll(275);
  expect(value('story-progress')).toBeCloseTo(.5);
  await scroll(550);
  expect(value('story-progress')).toBe(1);
  await scroll(4250);
  expect(value('foundation-arrival')).toBeGreaterThan(0);
  expect(value('foundation-arrival')).toBeLessThan(1);
  expect(value('showcase-departure')).toBe(value('foundation-arrival'));
  await scroll(4700);
  expect(value('foundation-arrival')).toBe(1);
  await scroll(0);
  expect(value('hero-departure')).toBe(0);
  expect(value('foundation-arrival')).toBe(0);
});

test('flow layout stays fully visible and disposal removes pending frames and section styles', async () => {
  controller = createSectionMotionController(page, false);
  expect(value('copy-progress')).toBe(1);
  expect(value('story-progress')).toBe(1);
  await scroll(4250);
  expect(value('showcase-departure')).toBe(0);
  window.dispatchEvent(new Event('scroll'));
  controller.dispose();
  await vi.runAllTimersAsync();
  expect(page).not.toHaveClass('section-motion');
  expect(page.style.getPropertyValue('--foundation-arrival')).toBe('');
  expect(vi.getTimerCount()).toBe(0);
});
