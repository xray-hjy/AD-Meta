// Geometry, rather than sample counts, works for every chart adapter and zoom.
// Full deflection traverses long content in roughly ten seconds. A light push
// and the initial acceleration remain suitable for inspecting nearby cells.
export function chartPanSpeed(world, visible, viewport) {
  const axis = (total, shown, pixels) => {
    if (![total, shown, pixels].every(Number.isFinite) || shown <= 0 || pixels <= 0) return { base: .9, speed: .9, tap: 36 };
    if (total <= shown + 1e-6) return { base: 0, speed: 0, tap: 0 };
    const base = Math.max(.9, pixels * 1.6 / 1000);
    const travel = (total - shown) / shown * pixels;
    return { base, speed: Math.max(base, travel / 10000), tap: pixels * .18 };
  };
  return { x: axis(world?.width, visible?.width, viewport?.width), y: axis(world?.height, visible?.height, viewport?.height) };
}
