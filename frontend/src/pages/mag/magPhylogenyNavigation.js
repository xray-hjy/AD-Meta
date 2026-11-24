import { PHYLOGENY_LEAF_INSET_END, PHYLOGENY_LEAF_INSET_START } from './magPhylogenySurfaceModel';

export const PHYLOGENY_LEAF_INSETS = PHYLOGENY_LEAF_INSET_START + PHYLOGENY_LEAF_INSET_END;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const TRACK_BLOCK_SIZE = 32;

export function leafCapacity(count, length, spacing) {
  return Math.min(count, Math.max(1, Math.floor((length - PHYLOGENY_LEAF_INSETS) / spacing)));
}

export function centeredLeafRange(count, size, anchor, fraction = .5) {
  const rows = clamp(Math.round(size), 1, count);
  const start = clamp(Math.round(anchor - rows * fraction), 0, count - rows);
  return [start, start + rows];
}

// Resize handles keep the opposite edge fixed at the readability limit.
export function resizeLeafRange(count, capacity, previous, next) {
  const from = clamp(Math.round(next[0]), 0, count - 1);
  const to = clamp(Math.round(next[1]), from + 1, count);
  if (to - from <= capacity) return [from, to];
  return to === previous[1] ? [to - capacity, to] : [from, from + capacity];
}

// Use whole blocks with one block of overscan so normal scrolling does not
// rebuild the track cells on every frame.
export function phylogenyTrackWindow(start, end, visibleStart, visibleEnd) {
  return [
    Math.max(start, Math.floor(visibleStart / TRACK_BLOCK_SIZE) * TRACK_BLOCK_SIZE - TRACK_BLOCK_SIZE),
    Math.min(end, Math.ceil(Math.max(visibleStart + 1, visibleEnd) / TRACK_BLOCK_SIZE) * TRACK_BLOCK_SIZE + TRACK_BLOCK_SIZE),
  ];
}

export function phylogenyDrawing(count, view, minSpacing, hostWidth, viewportHeight) {
  const policy = view.fit ? 'fit' : view.height === 'auto' ? 'auto' : 'fixed';
  const readableLength = PHYLOGENY_LEAF_INSETS + count * minSpacing * view.scale;
  const crossLength = view.transposed ? clamp(Math.floor(viewportHeight * .77), 490, 660) : Math.max(815, hostWidth);
  const fitLength = view.transposed ? hostWidth : Math.floor(viewportHeight * .69);
  const length = policy === 'auto' ? Math.max(readableLength, view.transposed ? 640 : 280)
    : policy === 'fixed' ? Number(view.height) : clamp(fitLength, PHYLOGENY_LEAF_INSETS + 1, Math.max(readableLength, 280));
  const capacity = policy === 'fixed' ? leafCapacity(count, length, minSpacing) : count;
  const [start, end] = policy === 'fixed'
    ? centeredLeafRange(count, Math.min(capacity, view.range[1] - view.range[0]), (view.range[0] + view.range[1]) / 2) : [0, count];
  const step = (length - PHYLOGENY_LEAF_INSETS) / Math.max(1, end - start);
  const width = view.transposed ? length : crossLength;
  const height = view.transposed ? crossLength : length;
  return { policy, capacity, start, end, width, height, step, world: {
    width: view.transposed ? PHYLOGENY_LEAF_INSETS + count * step : width,
    height: view.transposed ? height : PHYLOGENY_LEAF_INSETS + count * step,
  } };
}
