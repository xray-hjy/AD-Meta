export const TAXONOMY_VIEWPORT_POLICY = Object.freeze({
  sunburst: { minHeight: 820, maxHeight: 1320 },
  treemap: { minHeight: 760, maxHeight: 1500 },
  sankey: {
    minHeight: 640,
    maxHeight: 1320,
    maxCanvasHeight: 4800,
    maxCanvasWidth: 8192,
    maxMinimumWidth: 2800,
    maxCanvasPixels: 12_000_000,
    maxDevicePixelRatio: 1.5,
    leftInset: 112,
    rightInset: 216,
    verticalInset: 40,
    minimumColumnSpan: 300,
  },
  radialtree: { minHeight: 620, maxHeight: 1280 },
});

export function getTaxonomyViewportPolicy(mode) {
  return TAXONOMY_VIEWPORT_POLICY[mode] || TAXONOMY_VIEWPORT_POLICY.sunburst;
}

export function resolveTreemapCanvasSize({ width, height }) {
  const policy = TAXONOMY_VIEWPORT_POLICY.treemap;
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(policy.minHeight, Number(height) || policy.minHeight);

  return {
    width: safeWidth,
    height: safeHeight,
  };
}

export function resolveSankeyCanvasConstraints({ naturalWidth, containerWidth, maxDepth, spacing = 1 }) {
  const policy = TAXONOMY_VIEWPORT_POLICY.sankey;
  const depthCount = Math.max(1, Number(maxDepth) || 1);
  const readableWidth = Math.min(policy.maxMinimumWidth, (policy.leftInset
    + policy.rightInset
    + depthCount * policy.minimumColumnSpan) * spacing);
  // Natural layout size is only an initial fallback, not a width ceiling. Page
  // zoom changes the available CSS width, so re-layout into the measured box.
  const measuredWidth = Number(containerWidth) > 0 ? Number(containerWidth)
    : (Number(naturalWidth) || readableWidth) * spacing;

  return {
    minWidth: readableWidth,
    maxWidth: policy.maxCanvasWidth,
    width: Math.min(policy.maxCanvasWidth, Math.max(readableWidth, measuredWidth)),
  };
}

export function resolveSankeyCanvasHeight({ naturalHeight, viewportHeight, canvasWidth = 2200, spacing = 1 }) {
  const policy = TAXONOMY_VIEWPORT_POLICY.sankey;
  const visibleHeight = Math.max(policy.minHeight, Number(viewportHeight) || 0);
  const limit = Math.min(policy.maxCanvasHeight, Math.floor(policy.maxCanvasPixels / Math.max(1, canvasWidth)));
  return Math.min(limit, Math.max(visibleHeight, (Number(naturalHeight) || 0) * spacing));
}

export function resolveSankeyDevicePixelRatio(devicePixelRatio) {
  const policy = TAXONOMY_VIEWPORT_POLICY.sankey;
  const ratio = Number(devicePixelRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(policy.maxDevicePixelRatio, ratio);
}
