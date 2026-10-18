import { createSectionSnapController } from './createSectionSnapController';
import { createSectionRegistry } from './createSectionRegistry';

let page, registry, controller, y, busy, blocked, resizeCallback;
beforeEach(() => {
  vi.useFakeTimers(); y = 0; busy = blocked = false;
  vi.stubGlobal('innerHeight', 1000); vi.stubGlobal('innerWidth', 1600);
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y);
  vi.spyOn(window, 'scrollTo').mockImplementation(({ top }) => { y = top; window.dispatchEvent(new Event('scroll')); });
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(10000);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resizeCallback = callback; }
    observe() {} unobserve() {} disconnect() {}
  });
  page = document.createElement('main');
  page.innerHTML = '<header class="site-header"></header><div></div><div></div><div></div>';
  document.body.append(page);
  page.firstElementChild.getBoundingClientRect = () => ({ height: 76 });
  registry = createSectionRegistry();
  [...page.children].slice(1).forEach((element, i) => {
    const top = [100, 1100, 7100][i], height = [1000, 5900, 1000][i];
    element.getBoundingClientRect = () => ({ top: top - y, bottom: top + height - y, height });
    registry.register({ id: ['hero', 'showcase', 'foundation'][i], snap: i === 1 ? 'managed' : 'start', element,
      adapter: i === 1 ? { getStops: () => ({ start: 1000, end: 6000 }), isBusy: () => busy } : undefined });
  });
});
afterEach(() => { controller?.dispose(); page.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const start = options => { controller = createSectionSnapController({ page, registry, blocked: () => blocked, ...options }); };
async function scroll(top) { window.scrollTo({ top }); await vi.advanceTimersByTimeAsync(800); }

test('settles near a section, preserves gallery reading, and enters its last stop in reverse', async () => {
  start(); await scroll(820); expect(y).toBe(1000);
  await scroll(4500); expect(y).toBe(4500);
  await scroll(6200); // Forward: do not pull the reader back into the gallery.
  expect(y).toBe(6200);
  await scroll(6400); await scroll(6190); expect(y).toBe(6000);
});

test('new wheel input immediately cancels an in-flight snap without consuming the gesture', async () => {
  start(); window.scrollTo({ top: 820 }); await vi.advanceTimersByTimeAsync(300);
  expect(y).toBeGreaterThan(820); expect(y).toBeLessThan(1000);
  const interrupted = y;
  const event = new WheelEvent('wheel', { deltaY: -80, cancelable: true });
  window.dispatchEvent(event); await vi.advanceTimersByTimeAsync(800);
  expect(y).toBe(interrupted); expect(event.defaultPrevented).toBe(false);
});

test('gallery ownership, modal previews, keyboard input and reduced motion suppress automatic snapping', async () => {
  start(); busy = true; await scroll(820); expect(y).toBe(820);
  busy = false; blocked = true; await scroll(830); expect(y).toBe(830);
  blocked = false; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
  await scroll(840); expect(y).toBe(840);
  controller.dispose(); start({ reducedMotion: true });
  await scroll(850); expect(y).toBe(850);
  controller.goto('foundation'); expect(y).toBe(7000);
});

test('navigation guards chapter jumps and new sections are measured without changing the controller', async () => {
  start(); controller.navigate(() => window.scrollTo({ top: 820 }));
  await vi.advanceTimersByTimeAsync(800); expect(y).toBe(820);
  const extra = document.createElement('section'); page.append(extra);
  extra.getBoundingClientRect = () => ({ top: 9000 - y, bottom: 10000 - y, height: 1000 });
  const remove = registry.register({ id: 'future', snap: 'start', element: extra });
  await scroll(8700); expect(y).toBe(8900);
  remove(); extra.remove();
  const count = window.scrollTo.mock.calls.length;
  controller.goto('future'); await vi.advanceTimersByTimeAsync(800);
  expect(window.scrollTo).toHaveBeenCalledTimes(count);
});

test('resize cancels stale positioning and dragging does not trigger an unsolicited jump', async () => {
  start(); window.scrollTo({ top: 820 }); await vi.advanceTimersByTimeAsync(300);
  resizeCallback(); const stopped = y; await vi.advanceTimersByTimeAsync(800); expect(y).toBe(stopped);
  window.dispatchEvent(new Event('pointerdown')); await scroll(950); expect(y).toBe(950);
  window.dispatchEvent(new Event('pointerup')); await vi.advanceTimersByTimeAsync(800); expect(y).toBe(1000);
  window.scrollTo({ top: 6800 }); controller.dispose();
  await vi.advanceTimersByTimeAsync(800); expect(y).toBe(6800); expect(vi.getTimerCount()).toBe(0);
});

test('a long smooth chapter navigation is guarded through its final scroll event', async () => {
  start(); controller.navigate(() => window.scrollTo({ top: 200 }));
  for (let step = 0; step < 14; step++) {
    await vi.advanceTimersByTimeAsync(100);
    window.scrollTo({ top: 200 + step * 50 });
  }
  await vi.advanceTimersByTimeAsync(800);
  expect(y).toBe(850); // A free scroll at 850 would otherwise approach 1000.
  await scroll(860); expect(y).toBe(1000);
});

test('fixed-size screenshot loads do not interrupt an explicit region navigation', async () => {
  start(); controller.goto('foundation'); await vi.advanceTimersByTimeAsync(100);
  page.lastElementChild.dispatchEvent(new Event('load'));
  await vi.advanceTimersByTimeAsync(700); expect(y).toBe(7000);
});
