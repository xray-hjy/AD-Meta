// Export uses the complete collection at its natural size, without the camera.
export function groupedBarMarkers(model, series, settings, transposed, grid, width, height) {
  if (!settings.groupMarkers || !series.length || !model.items.length) return [];
  const left = grid.left, top = grid.top, right = width - grid.right, bottom = height - grid.bottom;
  const slot = (transposed ? right - left : bottom - top) / model.items.length;
  const thickness = Math.min((model.barWidth || 11) * ({ thin: .65, thick: 1.3 }[settings.width] || 1), (slot - 8) / series.length);
  return model.items.flatMap((_, index) => {
    const boundary = (transposed ? left : top) + (index + 1) * slot;
    return [{ type: 'line', silent: true, shape: transposed ? { x1: boundary, x2: boundary, y1: top, y2: bottom }
      : { x1: left, x2: right, y1: boundary, y2: boundary }, style: { stroke: '#94a3b8', opacity: .45, lineDash: [3, 4] } },
    ...series.map((group, s) => {
      const position = (transposed ? left : top) + index * slot + (slot - thickness * series.length) / 2 + (s + .5) * thickness;
      return { type: 'text', silent: true, x: transposed ? position : left - 8, y: transposed ? bottom + 13 : position,
        style: { text: group.key, fill: group.color, font: '10px sans-serif', align: transposed ? 'center' : 'right', verticalAlign: 'middle' } };
    })];
  });
}
