import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { echarts } from './EChartBase';
import './CartesianEChart';
import { CATEGORY_ZOOM, VALUE_ZOOM, MAG_CATEGORY_SIZE, categoryZoomInterval, categoryZoomRange, nativeGroupedBarMotion, nativeGroupedBarOption } from './groupedBarNativeOption';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const densityKey = (dense, settings, lineMode, animated) => `${dense}-${settings.values}-${lineMode}-${animated}`;

// The renderer, filtering, axis ticks, series emphasis and sliders are ECharts.
// The shared camera remains the source for the joystick, minimap and keyboard.
export default function NativeGroupedBarSurface(props) {
  const { model, transposed, lineMode, dimensions, plot, visible, settings, nativeRef, hiddenSeries, onToggleSeries, onRange } = props;
  const clipId = useId().replace(/:/g, '');
  const host = useRef(null), chart = useRef(null), live = useRef(props), valueRange = useRef({ start: 0, end: 100 });
  const zoomFrame = useRef(null), pendingZoom = useRef(null);
  const density = useRef(null);
  const pendingType = useRef(null);
  const size = useRef(null);
  const painted = useRef(false), wasShown = useRef(false), paintedDirection = useRef(transposed);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');
  const [layout, setLayout] = useState([]), [hover, setHover] = useState(null);
  useEffect(() => { live.current = props; });
  const refreshLayout = useCallback(() => {
    const instance = chart.current, current = live.current;
    if (!instance || !painted.current) return;
    const { model, transposed, visible, plot, settings, lineMode, hiddenSeries } = current;
    if ((!settings.groupMarkers && !settings.groupHover) || lineMode) { setLayout(previous => previous.length ? [] : previous); return; }
    const start = Math.max(0, Math.floor((transposed ? visible.x : visible.y) / MAG_CATEGORY_SIZE));
    const end = Math.min(model.items.length, Math.ceil((transposed ? visible.x + visible.width : visible.y + visible.height) / MAG_CATEGORY_SIZE));
    const shown = model.series.filter(series => !hiddenSeries.includes(series.key));
    const pitch = (transposed ? plot.width : plot.height) / Math.max(1, end - start);
    if (pitch < 15 || !shown.length) { setLayout(previous => previous.length ? [] : previous); return; }
    const axis = transposed ? 'xAxisIndex' : 'yAxisIndex';
    const positions = Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      const center = instance.convertToPixel({ [axis]: 0 }, index);
      const origin = transposed ? plot.left : plot.top, length = transposed ? plot.width : plot.height;
      if (!Number.isFinite(center) || center < origin || center > origin + length) return null;
      const cap = settings.width === 'thin' ? 16 : settings.width === 'thick' ? 30 : 24;
      const fraction = settings.width === 'thin' ? .24 : settings.width === 'thick' ? .43 : .36;
      const thickness = Math.min(cap, pitch * fraction);
      return { index, center, boundary: center + pitch / 2, pitch, groups: shown.map((series, i) => ({ ...series,
        position: center + (i - (shown.length - 1) / 2) * thickness })) };
    }).filter(Boolean);
    setLayout(previous => JSON.stringify(previous) === JSON.stringify(positions) ? previous : positions);
  }, []);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // Start entry when the user can see it, including reopening the section.
    // Folded sections keep their children mounted, so mount alone is not enough.
    const observer = new IntersectionObserver(entries => setShown(entries[0].isIntersecting));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const instance = echarts.init(host.current, null, { renderer: 'canvas', width: live.current.dimensions.width, height: live.current.dimensions.height });
    chart.current = instance;
    size.current = live.current.dimensions;
    const zoomChanged = event => {
      const changes = event.batch || [event];
      const current = instance.getOption().dataZoom;
      const category = current?.find(zoom => zoom.id === CATEGORY_ZOOM);
      const value = current?.find(zoom => zoom.id === VALUE_ZOOM);
      const valueChanged = changes.some(change => change.dataZoomId === VALUE_ZOOM || change.dataZoomIndex === 2);
      if (valueChanged && value) valueRange.current = { start: value.start, end: value.end };
      else {
        const interval = categoryZoomInterval(category, live.current.model.items.length);
        if (interval) {
          pendingZoom.current = interval;
          if (zoomFrame.current == null) zoomFrame.current = requestAnimationFrame(() => {
            zoomFrame.current = null;
            live.current.onRange(...pendingZoom.current);
            pendingZoom.current = null;
          });
        }
      }
      setHover(null); refreshLayout();
    };
    const mouseOver = event => {
      const current = live.current;
      if (!current.settings.groupHover || current.panMode || event.componentType !== 'series' || !Number.isInteger(event.dataIndex)) return;
      const series = current.model.series[event.seriesIndex], item = current.model.items[event.dataIndex];
      if (series && Number.isFinite(item?.values[series.key])) setHover({ index: event.dataIndex, key: series.key });
    };
    instance.on('datazoom', zoomChanged);
    instance.on('legendselectchanged', event => live.current.onLegendChange(event.selected));
    instance.on('mouseover', mouseOver);
    instance.on('mouseout', () => setHover(null));
    instance.on('globalout', () => setHover(null));
    instance.on('click', event => {
      if (event.componentType !== 'series') return;
      const item = live.current.model.items[event.dataIndex];
      if (item) live.current.onSelect?.(item.id || item.feature);
    });
    nativeRef.current = {
      setType(type) {
        if (!live.current.transposed || (live.current.lineMode ? 'line' : 'bar') === type) return;
        // Apply the public magicType action once, when the React type catches up.
        // A second immediate setOption would interrupt its native transition.
        pendingType.current = type;
      },
      restore() {
        instance.dispatchAction({ type: 'restore' });
        valueRange.current = { start: 0, end: 100 };
        setHover(null); live.current.onFit();
      },
    };
    return () => {
      if (zoomFrame.current != null) cancelAnimationFrame(zoomFrame.current);
      nativeRef.current = null; chart.current = null; instance.dispose();
    };
  }, [nativeRef, refreshLayout]);
  useEffect(() => {
    if (!shown) {
      // Remove the previous frame while hidden so reopening cannot briefly
      // flash full-height bars before the visibility callback starts entry.
      if (painted.current && wasShown.current) chart.current.clear();
      wasShown.current = false; setHover(null); return;
    }
    // The viewport first renders with fallback dimensions. Its measurement
    // must settle before entry, otherwise resize snaps growing bars to full size.
    if (host.current.clientWidth && (host.current.clientWidth !== dimensions.width || host.current.clientHeight !== dimensions.height)) return;
    const current = live.current;
    const accent = getComputedStyle(host.current).getPropertyValue('--workspace-accent').trim() || '#b65770';
    const option = nativeGroupedBarOption({ ...current, settings: { ...current.settings, groupHover: current.settings.groupHover && !current.panMode },
      range: categoryZoomRange(current.visible, current.transposed, current.model.items.length), valueRange: valueRange.current, accent,
      reducedMotion: reducedMotion() });
    if (size.current.width !== dimensions.width || size.current.height !== dimensions.height) {
      chart.current.resize({ width: dimensions.width, height: dimensions.height, silent: true });
      size.current = dimensions;
    }
    const reenter = painted.current && (!wasShown.current || (!lineMode && paintedDirection.current !== transposed));
    // Replay BarView's native zero-height/width entry; camera, slider range,
    // legend and scientific data are restored from the same full option below.
    if (reenter && wasShown.current) chart.current.clear();
    if (!reenter && painted.current && pendingType.current === (lineMode ? 'line' : 'bar')) {
      chart.current.dispatchAction({ type: 'changeMagicType', currentType: pendingType.current, newOption: option });
      pendingType.current = null;
    } else {
      pendingType.current = null;
      // Merge stable series so ECharts can diff and animate. Replaced axis IDs
      // also discard value/category settings when swapping their directions.
      chart.current.setOption(option, { replaceMerge: ['xAxis', 'yAxis', 'series', 'dataZoom', 'graphic'], silent: true });
    }
    painted.current = true; wasShown.current = true; paintedDirection.current = transposed;
    const range = option.dataZoom[0];
    const dense = (transposed ? plot.width : plot.height) / Math.max(1, (range.end - range.start) / 100 * model.items.length) < 18;
    density.current = densityKey(dense, current.settings, lineMode, option.animation);
    setHover(null); refreshLayout();
  }, [model, props.option, settings, transposed, lineMode, plot, dimensions, props.colorBlindFriendly, props.panMode, shown, refreshLayout]);
  useEffect(() => {
    const instance = chart.current;
    if (!instance || !shown || !painted.current || !wasShown.current) return;
    const range = categoryZoomRange(visible, transposed, model.items.length);
    const motion = nativeGroupedBarMotion({ settings, count: model.items.length, range, reducedMotion: reducedMotion() });
    const span = (range.end - range.start) / 100 * model.items.length;
    const dense = (transposed ? plot.width : plot.height) / Math.max(1, span) < 18;
    // Only density/policy changes need a style patch; avoid interrupting entry
    // and magicType animations with a redundant second render of the series.
    const key = densityKey(dense, settings, lineMode, motion.animation);
    if (density.current !== key) {
      density.current = key;
      instance.setOption({ ...motion, series: model.series.map(series => ({ id: series.key, ...motion,
        universalTransition: { enabled: false },
        label: { show: settings.values && !dense }, ...(lineMode ? { showSymbol: !dense } : {}) })) }, { silent: true });
    }
    const current = instance.getOption().dataZoom?.find(zoom => zoom.id === CATEGORY_ZOOM);
    if (!current || Math.abs(current.start - range.start) > .00001 || Math.abs(current.end - range.end) > .00001) {
      instance.dispatchAction({ type: 'dataZoom', dataZoomId: CATEGORY_ZOOM, ...range,
        animation: { duration: motion.animation ? 80 : 0, easing: 'cubicOut', delay: 0 } }, { silent: true });
    }
    setHover(null); refreshLayout();
  }, [visible, transposed, model, settings, lineMode, plot, shown, refreshLayout]);
  const from = Math.max(0, (transposed ? visible.x : visible.y) / MAG_CATEGORY_SIZE);
  const to = Math.min(model.items.length, from + (transposed ? visible.width : visible.height) / MAG_CATEGORY_SIZE);
  const hovered = hover && settings.groupHover && !props.panMode ? layout.find(item => item.index === hover.index) : null;
  return <div className="mag-native-surface" data-renderer="echarts-canvas" data-chart-type={lineMode ? 'line' : 'bar'} data-transposed={transposed}
    data-total-items={model.items.length} data-range-start={from} data-range-end={to}>
    <div className={`mag-native-chart${settings.animation !== false ? ` mag-native-chart--${lineMode ? 'line' : 'bar'}` : ''}`} ref={host} role="img" aria-label={`${model.title || `${model.featureLabel}丰度`}${lineMode ? '折线图' : '条形图'}，${model.items.length} 个${model.featureLabel}`} />
    <svg className="mag-native-markers" width={dimensions.width} height={dimensions.height} aria-hidden="true">
      <defs><clipPath id={clipId}><rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} /></clipPath></defs>
      {settings.groupMarkers && <g className="zoomable-bar-group-separators" clipPath={`url(#${clipId})`} stroke="#94a3b8" strokeOpacity=".45" strokeDasharray="3 4">
        {layout.map(item => <line key={item.index} x1={transposed ? item.boundary : plot.left} x2={transposed ? item.boundary : plot.left + plot.width}
          y1={transposed ? plot.top : item.boundary} y2={transposed ? plot.top + plot.height : item.boundary} />)}
      </g>}
      {settings.groupMarkers && <g className="zoomable-bar-group-labels" fontSize="10">{layout.flatMap(item => item.pitch >= 25 ? item.groups.map(group =>
        <text key={`${item.index}-${group.key}`} x={transposed ? group.position : plot.left - 8} y={transposed ? plot.top + plot.height + 12 : group.position}
          fill={group.color} textAnchor={transposed ? 'middle' : 'end'} dominantBaseline="middle">{group.key}</text>) : [])}</g>}
      {hovered && hovered.groups.length > 1 && <line className="zoomable-bar-group-pointer" stroke="#64748b" strokeDasharray="4 4" opacity=".7"
        x1={transposed ? hovered.center : plot.left} x2={transposed ? hovered.center : plot.left + plot.width}
        y1={transposed ? plot.top : hovered.center} y2={transposed ? plot.top + plot.height : hovered.center} />}
    </svg>
    <div className="mag-native-accessibility">
      {model.series.map(series => <button key={series.key} type="button" aria-pressed={!hiddenSeries.includes(series.key)} onClick={() => onToggleSeries(series.key)}>{series.label}</button>)}
      <label>浏览起点<input data-native-zoom-control type="range" min="0" max={Math.max(0, model.items.length - 1)} step="1" value={Math.floor(from)}
        onChange={event => onRange(Number(event.target.value) * MAG_CATEGORY_SIZE, Math.max(Number(event.target.value) + 1, to) * MAG_CATEGORY_SIZE)} /></label>
      <label>浏览终点<input data-native-zoom-control type="range" min="1" max={model.items.length} step="1" value={Math.ceil(to)}
        onChange={event => onRange(Math.min(from, Number(event.target.value) - 1) * MAG_CATEGORY_SIZE, Number(event.target.value) * MAG_CATEGORY_SIZE)} /></label>
      <button data-native-zoom-control type="button" onKeyDown={event => {
        const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (!direction) return;
        event.preventDefault(); const next = Math.max(0, Math.min(model.items.length - (to - from), from + direction * Math.max(1, (to - from) / 10)));
        onRange(next * MAG_CATEGORY_SIZE, (next + to - from) * MAG_CATEGORY_SIZE);
      }}>拖动浏览区间</button>
    </div>
    <span className="mag-native-range-label" style={{ right: dimensions.width - plot.left - plot.width }} aria-live="off">{Math.floor(from) + 1}–{Math.ceil(to)} / {model.items.length}</span>
    {!model.series.some(series => !hiddenSeries.includes(series.key)) && <span className="mag-native-empty">点击图例选择要显示的分组</span>}
  </div>;
}
