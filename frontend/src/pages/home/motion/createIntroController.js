import { chooseLogoMotion, createLogoAnimationPlan } from './logoAnimations';

let previousMotion = null;

// The intro changes only this page's attributes and logo parts. Every timer,
// animation and listener is released on route exit / React StrictMode cleanup.
export function createIntroController(page, reducedMotion) {
  let token = 0, disposed = false;
  const timers = new Map(), animations = new Set(), events = new AbortController();
  const logo = page.querySelector('.logo-replay');
  function cancel() {
    token++;
    for (const [timer, resolve] of timers) { clearTimeout(timer); resolve(); }
    timers.clear();
    for (const animation of animations) animation.cancel();
    animations.clear(); logo.classList.remove('is-assembling');
  }
  function finish(skipped = true) {
    cancel(); page.dataset.intro = 'full'; page.dataset.introSkipped = String(skipped);
  }
  function pause(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms);
      timers.set(timer, resolve);
    });
  }
  function animate(element, frames, options) {
    if (typeof element.animate !== 'function') return Promise.resolve();
    const animation = element.animate(frames, options);
    animations.add(animation);
    // Retain completed fill effects until assembly ends or is cancelled.
    return animation.finished.catch(() => {});
  }
  async function assemble(current) {
    logo.classList.add('is-assembling');
    const motion = chooseLogoMotion(previousMotion);
    previousMotion = motion; logo.dataset.logoMotion = motion;
    await Promise.all(createLogoAnimationPlan(logo, motion).map(({ element, frames, options }) => animate(element, frames, options)));
    if (current !== token || disposed) return;
    await pause(80);
    if (current !== token || disposed) return;
    for (const animation of animations) animation.cancel();
    animations.clear(); logo.classList.remove('is-assembling');
  }
  async function run() {
    cancel();
    if (reducedMotion || location.hash || scrollY > 3) { finish(); return; }
    const current = token;
    page.dataset.intro = 'staged'; page.dataset.introSkipped = 'false';
    pause(6000).then(() => { if (!disposed && current === token) finish(); });
    await pause(175);
    if (current !== token || disposed) return;
    page.dataset.intro = 'headline';
    await assemble(current);
    if (current !== token || disposed) return;
    page.dataset.intro = 'collapsing';
    await pause(1176);
    if (current !== token || disposed) return;
    finish(false);
  }
  window.addEventListener('scroll', () => { if (page.dataset.intro !== 'full' && scrollY > 3) finish(); }, { passive: true, signal: events.signal });
  run();
  return {
    finish,
    replay() { if (reducedMotion) return; window.scrollTo({ top: 0, behavior: 'instant' }); run(); },
    replayLogo() { finish(); if (!reducedMotion) assemble(token); },
    dispose() { disposed = true; events.abort(); cancel(); },
  };
}
