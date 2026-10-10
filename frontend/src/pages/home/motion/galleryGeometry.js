import { clamp } from './motionConfig';

export function fitScreenshot(slide, sceneWidth, sceneHeight) {
  const ratio = slide.width / Math.max(1, slide.height);
  const width = Math.min(Math.max(1, sceneWidth * .82 - 20), Math.max(1, sceneHeight - 48) * ratio);
  return { width, height: width / ratio, paneWidth: width + 20 };
}

// Swiper's centered, variable-width cards do not move by one viewport width.
export function galleryPosition(swiper, translate = swiper?.getTranslate()) {
  const grid = swiper?.slidesGrid;
  if (!grid || grid.length < 2) return 0;
  const offset = -translate;
  if (offset <= grid[0]) return 0;
  for (let index = 0; index < grid.length - 1; index++) {
    if (offset <= grid[index + 1]) return index + (offset - grid[index]) / Math.max(1, grid[index + 1] - grid[index]);
  }
  return grid.length - 1;
}

export function positionOnTimeline(timeline, scrollTop, lastIndex) {
  const segment = Math.max(0, (scrollTop - timeline.start - timeline.hold) / timeline.step);
  const base = Math.floor(segment);
  const t = clamp((segment - base - .35) / .5);
  return Math.min(lastIndex, base + t * t * (3 - 2 * t));
}
