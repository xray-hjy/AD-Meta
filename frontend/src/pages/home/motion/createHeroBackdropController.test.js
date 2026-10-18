import { vi } from 'vitest';
import { createHeroBackdropController } from './createHeroBackdropController';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(fine = true) {
  const hero = document.createElement('section'), backdrop = document.createElement('div');
  const plane = document.createElement('div');
  plane.className = 'hero-chart-backdrop__plane'; backdrop.append(plane); hero.append(backdrop);
  const geometry = vi.spyOn(hero, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, bottom: 100 });
  let now = 0, id = 0, intersection, resized;
  const frames = new Map(), disconnect = vi.fn(), resizeDisconnect = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frames.set(++id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(key => frames.delete(key)));
  vi.stubGlobal('matchMedia', () => ({ matches: fine, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { intersection = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resized = callback; }
    observe() {}
    disconnect = resizeDisconnect;
  });
  const tick = count => {
    for (let i = 0; i < count; i++) {
      now += 16.67;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(now));
    }
  };
  const controller = createHeroBackdropController(hero, backdrop);
  return { hero, backdrop, plane, geometry, frames, tick, controller, disconnect, resizeDisconnect,
    intersect: value => intersection([{ isIntersecting: value }]), resize: () => resized() };
}

test('pointer events are batched, smoothly converge, and stop scheduling at rest', () => {
  const f = fixture();
  f.hero.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));
  f.hero.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 0 }));
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  f.tick(1);
  const angle = Number(/rotateY\(([\d.]+)deg\)/.exec(f.plane.style.transform)[1]);
  expect(angle).toBeGreaterThan(16);
  expect(angle).toBeLessThan(17.6);
  f.tick(80);
  expect(f.plane.style.transform).toContain('rotateY(17.6000deg)');
  expect(f.frames.size).toBe(0);
  expect(f.geometry).toHaveBeenCalledTimes(1);
  expect(f.backdrop.style.getPropertyValue('--hero-pointer-x')).toBe('');
  f.controller.dispose();
});

test('geometry is remeasured only after resize/scroll and pointer leave eases back', () => {
  const f = fixture();
  f.hero.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 50 }));
  f.tick(80);
  f.resize(); f.tick(1);
  expect(f.geometry).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event('scroll')); f.tick(1);
  expect(f.geometry).toHaveBeenCalledTimes(3);
  f.hero.dispatchEvent(new MouseEvent('pointerleave'));
  f.tick(80);
  expect(f.plane.style.transform).toContain('rotateY(16.0000deg)');
  expect(f.frames.size).toBe(0);
  f.controller.dispose();
});

test('offscreen and disposed controllers cancel pending work and reset the plane', () => {
  const f = fixture();
  f.hero.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 }));
  f.tick(1);
  f.intersect(false);
  expect(f.backdrop.dataset.running).toBe('false');
  expect(f.frames.size).toBe(0);
  expect(f.plane.style.transform).toBe('');
  f.controller.dispose();
  f.hero.dispatchEvent(new MouseEvent('pointermove', { clientX: 50 }));
  expect(f.frames.size).toBe(0);
  expect(f.disconnect).toHaveBeenCalledOnce();
  expect(f.resizeDisconnect).toHaveBeenCalledOnce();
});

test('coarse pointers never schedule parallax and visibility pauses column motion', () => {
  const f = fixture(false);
  f.hero.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(f.backdrop.dataset.running).toBe('false');
  f.controller.dispose();
});
