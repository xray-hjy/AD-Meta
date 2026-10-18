import { HOME_MOTION } from './motionConfig';

const number = value => Number(value.toFixed(6));
const translate = (x, y, scale = 1) => `translate3d(${number(x)}px, ${number(y)}px, 0) scale(${number(scale)})`;
const pose = (element, styles) => ({ element, styles });

// Visual recipes belong to their sections. The coordinator has no page selectors.
export function heroSectionMotion(element) {
  const surface = element.querySelector('.hero-surface'), backdrop = element.querySelector('.hero-chart-backdrop');
  const motion = HOME_MOTION.sections;
  let width = -1, alpha = .82;
  return ({ departure }) => {
    if (width !== innerWidth) { width = innerWidth; alpha = backdrop ? parseFloat(getComputedStyle(backdrop).getPropertyValue('--hero-background-opacity')) || .82 : .82; }
    return [
      pose(surface, { opacity: number(1 - departure), transform: translate(0, -motion.heroDistance * departure, 1 - .035 * departure) }),
      pose(backdrop, { opacity: innerWidth > 760 ? number(alpha * (1 - .55 * departure)) : '' }),
    ];
  };
}

export function showcaseSectionMotion(element, page, pinned) {
  const stage = element.querySelector('.visual-stage'), reader = element.querySelector('.chapter-reader'), chapters = element.querySelector('.chapter-list');
  const motion = HOME_MOTION.sections;
  return ({ entry, exit, smooth }) => {
    entry = pinned ? entry : 1; exit = pinned ? exit : 0;
    const center = parseFloat(page.style.getPropertyValue('--stage-center-x')) || 0;
    const copy = pinned ? smooth(Math.max(0, Math.min(1, (entry - motion.copyStart) / (1 - motion.copyStart)))) : 1;
    return [
      pose(stage, { opacity: number((.28 + .72 * entry) * (1 - .85 * exit)), transform: translate(center * (1 - entry), 64 * (1 - entry) - motion.exitDistance * exit, 1 - .10 * (1 - entry) - .08 * exit) }),
      pose(reader, { opacity: number(1 - .85 * exit), transform: translate(0, -motion.exitDistance * exit) }),
      pose(chapters, { opacity: number(copy) }),
    ];
  };
}

// Optional default for future sections: register this recipe for a gentle reveal.
export function revealSectionMotion(element) {
  const surface = element.querySelector('[data-section-surface]') || element.firstElementChild;
  return ({ arrival }) => [pose(surface, { opacity: number(arrival), transform: translate(0, HOME_MOTION.sections.foundationDistance * (1 - arrival)) })];
}
