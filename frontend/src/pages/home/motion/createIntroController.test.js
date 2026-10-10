import core from '../../../assets/brand/logo-parts/core.svg?raw';
import { createIntroController } from './createIntroController';
import { chooseLogoMotion, LOGO_MOTIONS } from './logoAnimations';

let controller, effects;
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeEach(() => {
  vi.useFakeTimers();
  effects = [];
  vi.stubGlobal('scrollY', 0);
  // A completed fill effect remains attached until cancel(), just as in WAAPI.
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined });
});
afterEach(() => {
  controller?.dispose(); controller = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else delete Element.prototype.animate;
});

function mount(reduced = false) {
  const page = document.createElement('main');
  page.innerHTML = `<button class="logo-replay"><span class="logo-machine">
    <span class="logo-part--top"></span><span class="logo-part--bottom"></span>
    <span class="logo-part--core">${core}</span></span></button>`;
  document.body.append(page);
  controller = createIntroController(page, reduced);
  return page;
}

function mockAnimation() {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: function () {
    let complete;
    const finished = new Promise(resolve => { complete = resolve; });
    const effect = { finished, complete, cancel: vi.fn(complete), element: this };
    effects.push(effect);
    return effect;
  } });
}

test('all five choices are reachable and the previous motion is always excluded', () => {
  expect(Array.from({ length: 5 }, (_, i) => chooseLogoMotion(null, () => (i + .5) / 5))).toEqual(LOGO_MOTIONS);
  for (const previous of LOGO_MOTIONS) {
    const choices = Array.from({ length: 4 }, (_, i) => chooseLogoMotion(previous, () => (i + .5) / 4));
    expect(new Set(choices).size).toBe(4);
    expect(choices).not.toContain(previous);
  }
});

test('replay cancels both completed and in-flight effects, and dispose releases the new run', async () => {
  mockAnimation();
  const page = mount();
  await vi.advanceTimersByTimeAsync(175);
  const first = [...effects], previous = page.querySelector('button').dataset.logoMotion;
  first[0].complete();
  await Promise.resolve();
  controller.replayLogo();
  expect(page.querySelector('button').dataset.logoMotion).not.toBe(previous);
  expect(first.every(effect => effect.cancel.mock.calls.length === 1)).toBe(true);
  controller.dispose();
  expect(effects.every(effect => effect.cancel.mock.calls.length === 1)).toBe(true);
  expect(page.querySelector('button')).not.toHaveClass('is-assembling');
  await vi.runAllTimersAsync();
  expect(vi.getTimerCount()).toBe(0);
});

test('every approved motion completes and removes its fill effects without altering SVG attributes', async () => {
  mockAnimation();
  const page = mount();
  controller.finish();
  vi.spyOn(Math, 'random').mockReturnValue(.999);
  controller.replayLogo(); controller.finish();
  const original = page.querySelector('.logo-machine').innerHTML;
  const seen = new Set();
  // Exercise each motion through the real controller and actual network SVG.
  for (const desired of LOGO_MOTIONS) {
    const previous = page.querySelector('button').dataset.logoMotion;
    const available = LOGO_MOTIONS.filter(key => key !== previous);
    Math.random.mockReturnValue((available.indexOf(desired) + .5) / available.length);
    const start = effects.length;
    controller.replayLogo();
    seen.add(page.querySelector('button').dataset.logoMotion);
    effects.slice(start).forEach(effect => effect.complete());
    await vi.advanceTimersByTimeAsync(80);
    expect(effects.slice(start).every(effect => effect.cancel.mock.calls.length === 1)).toBe(true);
    expect(page.querySelector('.logo-machine').innerHTML).toBe(original);
    expect(page.querySelector('button')).not.toHaveClass('is-assembling');
  }
  expect(seen.size).toBe(5);
});

test('reduced motion leaves the assembled logo visible without starting animation or timers', () => {
  mockAnimation();
  const page = mount(true);
  controller.replayLogo(); controller.replay();
  expect(page.dataset.intro).toBe('full');
  expect(effects).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});
