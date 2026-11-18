import {
  getTaxonomyViewportPolicy,
  resolveSankeyCanvasConstraints,
  resolveSankeyCanvasHeight,
  resolveSankeyDevicePixelRatio,
  resolveTreemapCanvasSize,
} from './taxonomyViewportPolicy';

test('uses a taller hierarchy viewport for large circular charts', () => {
  expect(getTaxonomyViewportPolicy('sunburst').maxHeight).toBe(1320);
  expect(getTaxonomyViewportPolicy('treemap').maxHeight).toBe(1500);
  expect(getTaxonomyViewportPolicy('sankey').maxHeight).toBe(1320);
  expect(getTaxonomyViewportPolicy('radialtree').maxHeight).toBe(1280);
});

test('uses the full measured treemap width and preserves its own layout', () => {
  expect(resolveTreemapCanvasSize({ width: 2200, height: 900 })).toEqual({
    width: 2200,
    height: 900,
  });
  expect(resolveTreemapCanvasSize({ width: 1100, height: 700 }).width).toBe(1100);
});

test('describes sankey width limits without guessing the browser content box', () => {
  expect(resolveSankeyCanvasConstraints({ naturalWidth: 2200, maxDepth: 3 })).toEqual({
    minWidth: 1228,
    maxWidth: 8192,
    width: 2200,
  });
});

test('sankey canvas fills the card before it grows for dense data', () => {
  expect(resolveSankeyCanvasHeight({ naturalHeight: 900, viewportHeight: 1180 })).toBe(1180);
  expect(resolveSankeyCanvasHeight({ naturalHeight: 4800, viewportHeight: 1180 })).toBe(4800);
  expect(resolveSankeyCanvasHeight({ naturalHeight: 900, viewportHeight: 5000 })).toBe(4800);
});

test('expanded dense canvas stays within dimension and pixel budgets', () => {
  const width = resolveSankeyCanvasConstraints({ naturalWidth: 9000, maxDepth: 30, spacing: 1.6 });
  expect(width.maxWidth).toBe(8192);
  expect(width.minWidth).toBe(2800);
  expect(width.minWidth).toBeLessThanOrEqual(width.maxWidth);
  const height = resolveSankeyCanvasHeight({ naturalHeight: 9000, viewportHeight: 900, canvasWidth: width.maxWidth, spacing: 1.6 });
  expect(height).toBeLessThanOrEqual(4800);
  expect(height * width.maxWidth).toBeLessThanOrEqual(12_000_000);
});

test('sankey follows an expanded browser container instead of its natural width', () => {
  expect(resolveSankeyCanvasConstraints({ naturalWidth: 2200, containerWidth: 5422, maxDepth: 3 }).width).toBe(5422);
  expect(resolveSankeyCanvasConstraints({ naturalWidth: 2200, containerWidth: 1149, maxDepth: 3 }).width).toBe(1228);
});

test('caps sankey device pixel ratio without reducing standard displays', () => {
  expect(resolveSankeyDevicePixelRatio(2)).toBe(1.5);
  expect(resolveSankeyDevicePixelRatio(1)).toBe(1);
  expect(resolveSankeyDevicePixelRatio(0)).toBe(1);
  expect(resolveSankeyDevicePixelRatio(.33)).toBe(.33);
});
