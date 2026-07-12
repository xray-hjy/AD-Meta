export const TAXONOMY_VIEWPORT_POLICY = Object.freeze({
  sunburst: { minHeight: 620, maxHeight: 1320 },
  treemap: { minHeight: 620, maxHeight: 1320, maxAspectRatio: 1.7 },
  sankey: {
    minHeight: 640,
    maxHeight: 1320,
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
    width: Math.min(safeWidth, Math.round(safeHeight * policy.maxAspectRatio)),
    height: safeHeight,
  };
}

export function resolveSankeyCanvasConstraints({ naturalWidth, maxDepth }) {
  const policy = TAXONOMY_VIEWPORT_POLICY.sankey;
  const depthCount = Math.max(1, Number(maxDepth) || 1);
  const readableWidth = policy.leftInset
    + policy.rightInset
    + depthCount * policy.minimumColumnSpan;
  const safeNaturalWidth = Math.max(readableWidth, Number(naturalWidth) || readableWidth);

  return {
    minWidth: Math.min(readableWidth, safeNaturalWidth),
    maxWidth: safeNaturalWidth,
  };
}

export function resolveSankeyCanvasHeight({ naturalHeight, viewportHeight }) {
  const policy = TAXONOMY_VIEWPORT_POLICY.sankey;
  const visibleHeight = Math.max(policy.minHeight, Number(viewportHeight) || 0);
  return Math.max(visibleHeight, Number(naturalHeight) || 0);
}
