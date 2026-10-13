// Coordinates are in CSS pixels. Scaling never changes the data selection.
export function fitCamera(world, plot, widthOnly = false, navigationAxis = 'both') {
  const k = navigationAxis === 'x' ? plot.width / world.width : navigationAxis === 'y' ? (widthOnly ? plot.width / world.width : plot.height / world.height)
    : widthOnly ? plot.width / world.width : Math.min(plot.width / world.width, plot.height / world.height);
  return constrainCamera({ k, x: plot.left + (plot.width - world.width * k) / 2, y: plot.top }, world, plot, navigationAxis);
}

export function constrainCamera(camera, world, plot, navigationAxis = 'both') {
  const axis = (offset, size, available, origin) => size <= available
    ? origin + (available - size) / 2 : Math.max(origin + available - size, Math.min(origin, offset));
  return { ...camera, x: navigationAxis === 'y' ? plot.left : axis(camera.x, world.width * camera.k, plot.width, plot.left),
    y: navigationAxis === 'x' ? plot.top : axis(camera.y, world.height * camera.k, plot.height, plot.top) };
}

export function zoomCamera(camera, k, world, plot, anchor = { x: plot.left + plot.width / 2, y: plot.top + plot.height / 2 }, navigationAxis = 'both') {
  return constrainCamera({ k, x: anchor.x - (anchor.x - camera.x) * k / camera.k,
    y: anchor.y - (anchor.y - camera.y) * k / camera.k }, world, plot, navigationAxis);
}

export function visibleWorld(camera, world, plot, navigationAxis = 'both') {
  const x = Math.max(0, (plot.left - camera.x) / camera.k);
  const y = Math.max(0, (plot.top - camera.y) / camera.k);
  return { x: navigationAxis === 'y' ? 0 : x, y: navigationAxis === 'x' ? 0 : y,
    width: navigationAxis === 'y' ? world.width : Math.max(0, Math.min(world.width, (plot.left + plot.width - camera.x) / camera.k) - x),
    height: navigationAxis === 'x' ? world.height : Math.max(0, Math.min(world.height, (plot.top + plot.height - camera.y) / camera.k) - y) };
}

// The interval is in data coordinates; its independent value axis never pans.
export function rangeCamera(start, end, world, plot, navigationAxis) {
  const horizontal = navigationAxis === 'x', size = horizontal ? world.width : world.height;
  const from = Math.max(0, Math.min(size - 1, start)), to = Math.max(from + 1, Math.min(size, end));
  const k = (horizontal ? plot.width : plot.height) / (to - from);
  return constrainCamera({ k, x: plot.left - (horizontal ? from * k : 0), y: plot.top - (horizontal ? 0 : from * k) }, world, plot, navigationAxis);
}
