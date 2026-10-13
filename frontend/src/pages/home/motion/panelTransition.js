import { HOME_MOTION } from './motionConfig';

// Own only opacity/vertical transforms. Swiper still owns horizontal transforms.
export function createPanelTransition({ config, exitClass, contentSelector, previewSelector }) {
  let animations = [], token = 0;
  const moving = new Set();
  const sample = element => {
    const style = getComputedStyle(element);
    return { opacity: style.opacity || '1', transform: style.transform === 'none' ? 'translateY(0px)' : style.transform || 'translateY(0px)' };
  };
  function clear() {
    token++;
    for (const animation of animations) animation.cancel();
    animations = [];
    for (const element of moving) element.classList.remove(exitClass, 'is-changing');
    moving.clear();
  }
  function play(outgoing, incoming, direction, immediate = false) {
    const oldContent = outgoing && (contentSelector ? outgoing.querySelector(contentSelector) : outgoing);
    const newContent = contentSelector ? incoming.querySelector(contentSelector) : incoming;
    const oldFrame = oldContent && sample(oldContent);
    const newFrame = moving.has(incoming) ? sample(newContent) : null;
    const oldPreviews = previewSelector && outgoing ? [...outgoing.querySelectorAll(previewSelector)] : [];
    const newPreviews = previewSelector ? [...incoming.querySelectorAll(previewSelector)] : [];
    const frames = new Map([...oldPreviews, ...(moving.has(incoming) ? newPreviews : [])].map(el => [el, sample(el)]));
    clear();
    if (!outgoing || immediate || typeof incoming.animate !== 'function') return;
    const currentToken = token;
    outgoing.classList.add(exitClass, 'is-changing');
    incoming.classList.add('is-changing');
    moving.add(outgoing); moving.add(incoming);
    const run = (element, start, end, duration) => {
      const animation = element.animate([start, end], { duration, easing: HOME_MOTION.easing, fill: 'both' });
      animations.push(animation);
      return animation.finished.catch(() => {});
    };
    const jobs = [
      run(oldContent, oldFrame, { opacity: 0, transform: `translateY(${-direction * config.exitDistance}px)` }, config.exit),
      run(newContent, newFrame || { opacity: 0, transform: `translateY(${direction * config.distance}px)` }, { opacity: 1, transform: 'translateY(0px)' }, config.entrance),
    ];
    for (const preview of oldPreviews) jobs.push(run(preview, frames.get(preview), { opacity: 0, transform: `translateY(${-direction * 18}px)` }, config.exit));
    for (const preview of newPreviews) jobs.push(run(preview, frames.get(preview) || { opacity: 0, transform: `translateY(${direction * 24}px)` }, { opacity: .36, transform: 'translateY(0px)' }, HOME_MOTION.scene.entrance));
    Promise.all(jobs).then(() => { if (token === currentToken) clear(); });
  }
  return { play, clear };
}
