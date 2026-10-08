import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { select, zoom, zoomIdentity } from 'd3';
import { createPortal } from 'react-dom';
import ChartMinimap from './ChartMinimap';
import ChartPanJoystick from './ChartPanJoystick';
import ChartZoomControls from './ChartZoomControls';
import { constrainCamera, fitCamera, visibleWorld, zoomCamera, rangeCamera } from './chartCamera';
import './chart-zoom.css';

// Chart adapters draw in these coordinates; labels and tooltips are not CSS-scaled.
export default function ZoomableChartViewport({ world, resetKey, preview, insets, children, toolbarTarget, coordinateKey, remapCamera, viewportHeight, navigationAxis = 'both', navigationUnit = 1, renderFooter: Footer, footerProps, extraBottom = 0, extraRight = 0, navigationDockBottom, nativeWheel = false, ariaLabel = '可缩放图表' }) {
  const hostRef = useRef(null), behaviorRef = useRef(null), cameraRef = useRef(null), modeRef = useRef('fit');
  const [dimensions, setDimensions] = useState({ width: 1000, height: 560 });
  const [manualCamera, setManualCamera] = useState(null);
  const [panMode, setPanMode] = useState(false);
  const [coordinateLayout, setCoordinateLayout] = useState({ key: coordinateKey, plot: null });
  const scaleFrameRef = useRef(null), pendingScaleRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cancelCameraMotion = useCallback(() => {
    if (cameraFrameRef.current != null) cancelAnimationFrame(cameraFrameRef.current);
    cameraFrameRef.current = null;
  }, []);
  useEffect(() => cancelCameraMotion, [cancelCameraMotion]);
  const cancelScale = useCallback(() => {
    if (scaleFrameRef.current != null) cancelAnimationFrame(scaleFrameRef.current);
    scaleFrameRef.current = null; pendingScaleRef.current = null;
  }, []);
  useEffect(() => cancelScale, [cancelScale]);
  useEffect(() => {
    const host = hostRef.current;
    const measure = () => {
      if (host.clientWidth && host.clientHeight) setDimensions(current => current.width === host.clientWidth && current.height === host.clientHeight
        ? current : { width: host.clientWidth, height: host.clientHeight });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(host);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const plot = useMemo(() => ({ left: Math.min(insets.left, dimensions.width * .35), top: insets.top,
    width: Math.max(80, dimensions.width - Math.min(insets.left, dimensions.width * .35) - (dimensions.width > 900 ? 310 : 16) - extraRight),
    height: Math.max(100, dimensions.height - insets.top - (dimensions.width > 900 ? 95 : 285) - extraBottom) }), [dimensions, insets, extraBottom, extraRight]);
  const fitted = useMemo(() => fitCamera(world, plot, false, navigationAxis), [world, plot, navigationAxis]);
  const coordinatesChanged = coordinateLayout.key !== coordinateKey;
  const mappedCamera = coordinatesChanged && remapCamera && manualCamera
    ? remapCamera({ camera: manualCamera, previousPlot: coordinateLayout.plot || plot, plot, world }) : manualCamera;
  const camera = mappedCamera ? constrainCamera(mappedCamera, world, plot, navigationAxis) : fitted;
  useLayoutEffect(() => {
    if (coordinatesChanged) {
      cancelScale(); cancelCameraMotion();
      cameraRef.current = camera;
      setManualCamera(manualCamera ? camera : null);
    }
    if (coordinatesChanged || coordinateLayout.plot !== plot) setCoordinateLayout({ key: coordinateKey, plot });
  }, [coordinatesChanged, coordinateLayout.plot, coordinateKey, camera, manualCamera, plot, cancelScale, cancelCameraMotion]);
  const minScale = navigationAxis === 'both' ? Math.min(.05, fitted.k) : fitted.k;
  const maxScale = Math.max(8, fitted.k, navigationAxis === 'both' ? 0 : (navigationAxis === 'x' ? plot.width : plot.height) / navigationUnit);
  useEffect(() => {
    modeRef.current = 'fit'; setManualCamera(null);
  }, [resetKey]);
  // D3 owns the live gesture position. A passive effect from an older React
  // commit must not overwrite it while the next animation frame is panning.
  const apply = useCallback((next, mode = 'manual', animate = false) => {
    cancelScale();
    cancelCameraMotion();
    const commit = (position, nextMode) => {
      modeRef.current = nextMode;
      if (behaviorRef.current && hostRef.current) select(hostRef.current).call(behaviorRef.current.transform,
        zoomIdentity.translate(position.x, position.y).scale(position.k));
    };
    const start = cameraRef.current;
    // A single camera drives both the matrix and its labels during the short
    // transition. Independent text animation would cross the visible cells.
    if (!animate || !start || (Math.abs(Math.max(plot.left, start.x) - Math.max(plot.left, next.x)) < 1
      && Math.abs(Math.max(plot.top, start.y) - Math.max(plot.top, next.y)) < 1)
      || !window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches) {
      commit(next, mode); return;
    }
    const started = performance.now();
    const tick = time => {
      cameraFrameRef.current = null;
      const progress = Math.max(0, Math.min(1, (time - started) / 180));
      const eased = 1 - (1 - progress) ** 3;
      const position = constrainCamera({ x: start.x + (next.x - start.x) * eased,
        y: start.y + (next.y - start.y) * eased, k: start.k + (next.k - start.k) * eased }, world, plot, navigationAxis);
      commit(progress === 1 ? next : position, progress === 1 ? mode : 'manual');
      if (progress < 1) cameraFrameRef.current = requestAnimationFrame(tick);
    };
    cameraFrameRef.current = requestAnimationFrame(tick);
  }, [cancelScale, cancelCameraMotion, world, plot, navigationAxis]);
  useEffect(() => {
    const host = hostRef.current;
    const behavior = zoom().extent([[plot.left, plot.top], [plot.left + plot.width, plot.top + plot.height]])
      .translateExtent([[0, 0], [world.width, world.height]]).scaleExtent([minScale, maxScale])
      .constrain(transform => {
        const bounded = constrainCamera({ x: transform.x, y: transform.y, k: transform.k }, world, plot, navigationAxis);
        return zoomIdentity.translate(bounded.x, bounded.y).scale(bounded.k);
      })
      .filter(event => {
        if (event.target.closest?.('.chart-navigation-dock')) return false;
        // Native adapters own their dataZoom wheel action; D3 still owns drag,
        // keyboard and navigation controls. Never apply both to one gesture.
        if (nativeWheel && event.type === 'wheel') return false;
        if (event.target.closest?.('[data-native-zoom-control]')) return false;
        const bounds = host.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
        if (x < plot.left || x > plot.left + plot.width || y < plot.top || y > plot.top + plot.height) return false;
        return event.type === 'wheel' ? event.altKey && !event.ctrlKey : (panMode || event.altKey) && !event.button && event.type !== 'dblclick';
      }).on('zoom', event => {
        if (event.sourceEvent) { cancelCameraMotion(); modeRef.current = 'manual'; }
        const next = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        cameraRef.current = next;
        setManualCamera(modeRef.current === 'fit' ? null : next);
      });
    behaviorRef.current = behavior;
    select(host).call(behavior).on('dblclick.zoom', null);
    apply(modeRef.current === 'fit' ? fitted : constrainCamera(cameraRef.current || fitted, world, plot, navigationAxis), modeRef.current);
    return () => { cancelCameraMotion(); select(host).on('.zoom', null); behaviorRef.current = null; };
  }, [world, plot, fitted, minScale, maxScale, panMode, apply, resetKey, cancelCameraMotion, navigationAxis, nativeWheel]);
  const scaleTo = useCallback((k, animate = true) => apply(zoomCamera(cameraRef.current || fitted, Math.min(maxScale, Math.max(minScale, k)), world, plot, undefined, navigationAxis), 'manual', animate),
    [apply, fitted, minScale, maxScale, world, plot, navigationAxis]);
  useEffect(() => cancelScale, [scaleTo, cancelScale]);
  const slideTo = k => {
    pendingScaleRef.current = k;
    if (scaleFrameRef.current == null) scaleFrameRef.current = requestAnimationFrame(() => {
      const next = pendingScaleRef.current;
      scaleFrameRef.current = null; pendingScaleRef.current = null;
      if (next != null) scaleTo(next, false);
    });
  };
  const visible = visibleWorld(camera, world, plot, navigationAxis);
  const panBy = useCallback((dx, dy) => {
    const current = cameraRef.current;
    if (!current) return;
    const next = constrainCamera({ ...current, x: current.x - dx, y: current.y - dy }, world, plot, navigationAxis);
    if (Math.abs(next.x - current.x) > .001 || Math.abs(next.y - current.y) > .001) apply(next);
  }, [world, plot, apply, navigationAxis]);
  const canPan = { up: visible.y > .001, left: visible.x > .001,
    right: visible.x + visible.width < world.width - .001, down: visible.y + visible.height < world.height - .001 };
  const naturalHeight = world.height * plot.width / world.width + insets.top + (dimensions.width > 900 ? 95 : 285);
  const fitMode = !manualCamera ? 'fit' : Math.abs(camera.k - 1) < .00001 ? 'native'
    : Math.abs(camera.k - fitCamera(world, plot, true, navigationAxis).k) < .00001 ? 'width' : null;
  const onRange = (start, end) => apply(rangeCamera(start, end, world, plot, navigationAxis));
  const toolbar = <ChartZoomControls scale={camera.k} minScale={minScale} maxScale={maxScale} fitMode={fitMode}
    onFit={() => apply(fitted, 'fit', true)} onWidth={() => apply(fitCamera(world, plot, true, navigationAxis), 'manual', true)} onZoom={scaleTo} onSlide={slideTo} />;
  return <section className="zoomable-chart" aria-label={ariaLabel}>
    {toolbarTarget ? createPortal(toolbar, toolbarTarget) : <div className="chart-zoom-toolbar-row">{toolbar}</div>}
    <div ref={hostRef} className={`zoomable-chart__viewport${panMode ? ' is-panning' : ''}`} tabIndex={0} role="group"
      style={{ height: viewportHeight || `clamp(${dimensions.width > 900 ? 340 : 480}px, ${naturalHeight}px, min(720px, 65vh))` }}
      aria-label={`${ariaLabel}视口；方向键平移，加减键缩放，Home 查看全图`} data-scale={camera.k}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
        const delta = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[event.key];
        if (delta) { event.preventDefault(); apply(constrainCamera({ ...camera, x: camera.x + delta[0], y: camera.y + delta[1] }, world, plot, navigationAxis)); }
        else if (event.key === '+' || event.key === '=') { event.preventDefault(); scaleTo(camera.k * 1.35); }
        else if (event.key === '-') { event.preventDefault(); scaleTo(camera.k / 1.35); }
        else if (event.key === 'Home') { event.preventDefault(); apply(fitted, 'fit', true); }
      }}>
      {/* Adapters receive deferred event handlers; they never run them in render. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {children({ camera, plot, dimensions, visible, panMode, onRange, onFit: () => apply(fitted, 'fit') })}
      <div className="chart-navigation-dock" style={{ bottom: dimensions.width > 900 && navigationDockBottom != null ? navigationDockBottom : extraBottom ? extraBottom + 8 : undefined, '--chart-minimap-width': `${Math.max(116, Math.min(188, dimensions.width - 126))}px` }}>
        <ChartPanJoystick onPan={panBy} canPan={canPan} panMode={panMode} world={world} visible={visible} viewport={plot} onTogglePan={() => setPanMode(value => !value)} />
        <ChartMinimap world={world} visible={visible} preview={preview} stretch={navigationAxis !== 'both'} ariaLabel={`${ariaLabel}全局预览`} onNavigate={(x, y) => apply(constrainCamera({ ...camera,
          x: plot.left - x * camera.k, y: plot.top - y * camera.k }, world, plot, navigationAxis))} />
      </div>
    </div>
    {Footer && <Footer {...footerProps} visible={visible} onRange={onRange} />}
  </section>;
}
