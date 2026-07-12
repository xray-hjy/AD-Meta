import {
  getTaxonomyViewportPolicy,
  resolveSankeyCanvasConstraints,
  resolveSankeyCanvasHeight,
  resolveSankeyDevicePixelRatio,
  resolveTreemapCanvasSize,
} from './taxonomyViewportPolicy';

test('uses a taller hierarchy viewport for large circular charts', () => {
  expect(getTaxonomyViewportPolicy('sunburst').maxHeight).toBe(1320);
  expect(getTaxonomyViewportPolicy('treemap').maxHeight).toBe(1320);
  expect(getTaxonomyViewportPolicy('sankey').maxHeight).toBe(1320);
  expect(getTaxonomyViewportPolicy('radialtree').maxHeight).toBe(1280);
});

test('limits treemap width by the measured height instead of screen width', () => {
  expect(resolveTreemapCanvasSize({ width: 2200, height: 900 })).toEqual({
    width: 1530,
    height: 900,
  });
  expect(resolveTreemapCanvasSize({ width: 1100, height: 700 }).width).toBe(1100);
});

test('describes sankey width limits without guessing the browser content box', () => {
  expect(resolveSankeyCanvasConstraints({ naturalWidth: 2200, maxDepth: 3 })).toEqual({
    minWidth: 1228,
    maxWidth: 2200,
  });
});

test('sankey canvas fills the card before it grows for dense data', () => {
  expect(resolveSankeyCanvasHeight({ naturalHeight: 900, viewportHeight: 1180 })).toBe(1180);
  expect(resolveSankeyCanvasHeight({ naturalHeight: 4800, viewportHeight: 1180 })).toBe(3040);
  expect(resolveSankeyCanvasHeight({ naturalHeight: 900, viewportHeight: 5000 })).toBe(3040);
});

test('caps sankey device pixel ratio without reducing standard displays', () => {
  expect(resolveSankeyDevicePixelRatio(2)).toBe(1.5);
  expect(resolveSankeyDevicePixelRatio(1)).toBe(1);
  expect(resolveSankeyDevicePixelRatio(0)).toBe(1);
});
