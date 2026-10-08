import { useLayoutEffect, useRef } from 'react';
import { CELL_W, CELL_H } from './magHeatmapGeometry';

const DURATION = 450;
// Animate a bounded number of cached image tiles, never individual data cells.
export function transposeTiles(before, after) {
  const x0 = Math.max(0, Math.floor(before.visible.x / CELL_W));
  const y0 = Math.max(0, Math.floor(before.visible.y / CELL_H));
  const x1 = Math.min(before.image.width, Math.ceil((before.visible.x + before.visible.width) / CELL_W));
  const y1 = Math.min(before.image.height, Math.ceil((before.visible.y + before.visible.height) / CELL_H));
  const stepX = Math.max(1, Math.ceil((x1 - x0) / 24)), stepY = Math.max(1, Math.ceil((y1 - y0) / 16));
  const rect = (view, x, y, w, h) => ({ x: view.camera.x + x * CELL_W * view.camera.k,
    y: view.camera.y + y * CELL_H * view.camera.k, w: w * CELL_W * view.camera.k, h: h * CELL_H * view.camera.k });
  const tiles = [];
  for (let y = y0; y < y1; y += stepY) for (let x = x0; x < x1; x += stepX) {
    const w = Math.min(stepX, x1 - x), h = Math.min(stepY, y1 - y);
    tiles.push({ source: [x, y, w, h], target: [y, x, h, w],
      from: rect(before, x, y, w, h), to: rect(after, y, x, h, w),
      delay: 90 * ((x - x0) / Math.max(1, x1 - x0) + (y - y0) / Math.max(1, y1 - y0)) / 2 });
  }
  return tiles;
}

export default function HeatmapTransposeMotion({ view, surfaceRef, matrixRef, movingRef }) {
  const canvasRef = useRef(null), previousRef = useRef(null);
  useLayoutEffect(() => {
    const before = previousRef.current;
    previousRef.current = view;
    if (!before || before.transposed === view.transposed || before.data !== view.data
      || !window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches) return undefined;
    const canvas = canvasRef.current, surface = surfaceRef.current, matrix = matrixRef.current;
    const context = canvas?.getContext('2d');
    if (!context || !before.image || !view.image) return undefined;
    const { width, height } = view.dimensions;
    // Limit the transient backing buffer on very wide / browser-zoomed screens.
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 4096 / width, Math.sqrt(2000000 / (width * height)));
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    context.scale(ratio, ratio); context.imageSmoothingEnabled = false;
    const tiles = transposeTiles(before, view);
    canvas.dataset.tileCount = tiles.length;
    canvas.hidden = false; movingRef.current = true;
    // Cache imagery carries the moving matrix. Avoid repainting the large SVG
    // paths on each opacity frame; restore vector detail once reassembly ends.
    matrix.style.visibility = 'hidden';
    surface.setAttribute('aria-busy', 'true');
    const host = canvas.parentElement;
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
    let frame = null, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (frame != null) cancelAnimationFrame(frame);
      canvas.hidden = true; movingRef.current = false;
      canvas.width = 0; canvas.height = 0;
      matrix.style.visibility = '';
      surface.style.opacity = ''; surface.removeAttribute('aria-busy');
      document.removeEventListener('pointerdown', navigate, true);
      document.removeEventListener('click', toolbarClick, true);
      document.removeEventListener('keydown', navigate, true);
      host.removeEventListener('wheel', finish, true);
      motion.removeEventListener?.('change', finish);
    };
    const isToolbar = target => target.closest?.('.chart-zoom-toolbar')
      && (host.closest('.result-section') || host.closest('.zoomable-chart'))?.contains(target);
    const navigate = event => {
      if (isToolbar(event.target) || host.contains(event.target) && (event.type === 'keydown' || event.altKey
        || host.classList.contains('is-panning') || event.target.closest?.('.chart-navigation-dock'))) finish();
    };
    const toolbarClick = event => { if (isToolbar(event.target)) finish(); };
    const started = performance.now();
    const draw = time => {
      const elapsed = Math.max(0, time - started), progress = Math.min(1, elapsed / DURATION);
      context.clearRect(0, 0, width, height);
      // Both coordinate layouts may have different label / annotation insets.
      context.save(); context.beginPath();
      context.rect(Math.min(before.plot.left, view.plot.left), Math.min(before.plot.top, view.plot.top),
        Math.max(before.plot.left + before.plot.width, view.plot.left + view.plot.width) - Math.min(before.plot.left, view.plot.left),
        Math.max(before.plot.top + before.plot.height, view.plot.top + view.plot.height) - Math.min(before.plot.top, view.plot.top));
      context.clip();
      const reveal = Math.max(0, (progress - .65) / .35);
      context.globalAlpha = reveal;
      context.drawImage(view.image, view.visible.x / CELL_W, view.visible.y / CELL_H,
        view.visible.width / CELL_W, view.visible.height / CELL_H,
        view.camera.x + view.visible.x * view.camera.k, view.camera.y + view.visible.y * view.camera.k,
        view.visible.width * view.camera.k, view.visible.height * view.camera.k);
      for (const tile of tiles) {
        const p = Math.max(0, Math.min(1, (elapsed - tile.delay) / (DURATION - 90)));
        const eased = p * p * (3 - 2 * p);
        const spread = 1 - .06 * Math.sin(p * Math.PI);
        const w = (tile.from.w + (tile.to.w - tile.from.w) * eased) * spread;
        const h = (tile.from.h + (tile.to.h - tile.from.h) * eased) * spread;
        const x = tile.from.x + (tile.to.x - tile.from.x) * eased + (tile.from.w + (tile.to.w - tile.from.w) * eased - w) / 2;
        const y = tile.from.y + (tile.to.y - tile.from.y) * eased + (tile.from.h + (tile.to.h - tile.from.h) * eased - h) / 2;
        const alpha = 1 - Math.max(0, (progress - .7) / .3);
        context.globalAlpha = alpha * (1 - eased);
        context.drawImage(before.image, ...tile.source, x, y, w, h);
        context.globalAlpha = alpha * eased;
        context.drawImage(view.image, ...tile.target, x, y, w, h);
      }
      context.restore();
      surface.style.opacity = String(reveal);
      if (progress < 1) frame = requestAnimationFrame(draw); else finish();
    };
    draw(started);
    // Navigation interrupts immediately, including the toolbar outside this host.
    document.addEventListener('pointerdown', navigate, true);
    document.addEventListener('click', toolbarClick, true);
    host.addEventListener('wheel', finish, true);
    document.addEventListener('keydown', navigate, true);
    motion.addEventListener?.('change', finish);
    return finish;
  }, [view, surfaceRef, matrixRef, movingRef]);
  return <canvas ref={canvasRef} hidden aria-hidden="true" className="mag-heatmap-transpose-motion" />;
}
