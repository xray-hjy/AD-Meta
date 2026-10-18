import { useEffect, useRef } from 'react';

export default function ChartMinimap({ world, visible, preview, onNavigate, stretch = false, ariaLabel = '图形全局预览', active = true }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  useEffect(() => {
    if (active) return;
    const pointer = dragRef.current?.pointerId;
    if (pointer != null && svgRef.current?.hasPointerCapture?.(pointer)) svgRef.current.releasePointerCapture(pointer);
    dragRef.current = null;
  }, [active]);
  const width = 174, height = 116;
  const scale = Math.min(width / world.width, height / world.height);
  const image = stretch ? { width, height } : { width: world.width * scale, height: world.height * scale };
  const scaleX = image.width / world.width, scaleY = image.height / world.height;
  const left = (width - image.width) / 2, top = (height - image.height) / 2;
  const locate = event => {
    const bounds = svgRef.current.getBoundingClientRect();
    return { x: ((event.clientX - bounds.left) * width / bounds.width - left) / scaleX,
      y: ((event.clientY - bounds.top) * height / bounds.height - top) / scaleY };
  };
  const move = event => {
    if (!active || !dragRef.current) return;
    const point = locate(event);
    onNavigate(point.x - dragRef.current.x, point.y - dragRef.current.y);
  };
  return <div className="chart-minimap" aria-label={ariaLabel}>
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="完整图形；主题色框表示当前视野"
      onPointerDown={event => {
        if (!active || event.button !== 0) return;
        const point = locate(event);
        if (point.x < 0 || point.y < 0 || point.x > world.width || point.y > world.height) return;
        // Keep the precise viewport outline, with a larger grab area for very thin frames.
        const inside = point.x >= visible.x - 4 / scaleX && point.x <= visible.x + visible.width + 4 / scaleX
          && point.y >= visible.y - 4 / scaleY && point.y <= visible.y + visible.height + 4 / scaleY;
        dragRef.current = { pointerId: event.pointerId, ...(inside ? { x: point.x - visible.x, y: point.y - visible.y } : { x: visible.width / 2, y: visible.height / 2 }) };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        move(event);
      }} onPointerMove={move} onPointerUp={event => { dragRef.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); }}
      onPointerCancel={() => { dragRef.current = null; }} onLostPointerCapture={() => { dragRef.current = null; }}>
      <rect width={width} height={height} fill="var(--color-bg-panel)" />
      {preview && <image href={preview} x={left} y={top} width={image.width} height={image.height} preserveAspectRatio="none" />}
      <path d={`M${left},${top}h${image.width}v${image.height}h${-image.width}Z M${left + visible.x * scaleX},${top + visible.y * scaleY}v${visible.height * scaleY}h${visible.width * scaleX}v${-visible.height * scaleY}Z`}
        fill="var(--color-bg-panel)" opacity=".48" fillRule="evenodd" pointerEvents="none" />
      <rect data-testid="minimap-view" x={left + visible.x * scaleX} y={top + visible.y * scaleY} width={visible.width * scaleX} height={visible.height * scaleY}
        fill="var(--workspace-accent-soft)" stroke="var(--workspace-accent)" strokeWidth="1.5" pointerEvents="none" />
    </svg><span className="chart-minimap__hint">点击定位 · 拖动框平移</span>
  </div>;
}
