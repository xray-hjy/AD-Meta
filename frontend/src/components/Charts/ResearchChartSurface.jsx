import { useEffect, useMemo, useRef, useState } from 'react';
import EChart from './CartesianEChart';
import { echarts } from './EChartBase';
import ZoomableChartViewport from './ZoomableChartViewport';
import { useChartFrameActions, useChartFrameToolbarTarget } from './ChartFrameActionsContext';
import { exportEChart } from './chartExport';

const list = value => Array.isArray(value) ? value : [value];
const ids = datum => datum?.entityIds || (datum?.entityId ? [datum.entityId] : datum?.pathwayIds || (datum?.pathwayId ? [datum.pathwayId] : []));

function previewImage(option) {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 650, height: 400 });
  try {
    chart.setOption({ ...option, title: [], grid: { left: 32, right: option.visualMap ? 65 : 20, top: 24, bottom: 28 },
      xAxis: list(option.xAxis).map(axis => ({ ...axis, name: '', axisLabel: { show: false } })),
      yAxis: list(option.yAxis).map(axis => ({ ...axis, name: '', axisLabel: { show: false } })),
      tooltip: { show: false }, animation: false });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.renderToSVGString())}`;
  } finally { chart.dispose(); }
}

function CameraChart({ option, world, visible, plot, chartRef, onEvents, brushing, legendSelected, label }) {
  const rendered = useMemo(() => {
    const zoom = (axis, orientation) => {
      const from = orientation === 'x' ? visible.x / world.width : visible.y / world.height;
      const size = orientation === 'x' ? visible.width / world.width : visible.height / world.height;
      const flipped = orientation === 'y' ? !axis.inverse : Boolean(axis.inverse);
      return { type: 'inside', disabled: true, filterMode: 'none', ...(orientation === 'x' ? { xAxisIndex: 0 } : { yAxisIndex: 0 }),
        start: Math.max(0, (flipped ? 1 - from - size : from) * 100), end: Math.min(100, (flipped ? 1 - from : from + size) * 100) };
    };
    return { ...option, toolbox: { show: false }, grid: { left: plot.left, top: plot.top, width: plot.width, height: plot.height },
      title: list(option.title || []).map(title => ({ ...title, left: plot.left, top: 0 })),
      visualMap: option.visualMap ? { ...option.visualMap, left: plot.left + plot.width + 40, right: undefined, top: plot.top + plot.height / 2 - 65 } : undefined,
      legend: option.legend ? { ...option.legend, selected: legendSelected } : undefined,
      dataZoom: [zoom(list(option.xAxis)[0], 'x'), zoom(list(option.yAxis)[0], 'y')],
      brush: onEvents.brushselected ? { toolbox: [], brushMode: 'single', brushType: brushing ? 'rect' : false, xAxisIndex: 0, yAxisIndex: 0,
        throttleType: 'debounce', throttleDelay: 100, inBrush: { opacity: 1 }, outOfBrush: { opacity: .25 } } : undefined };
  }, [option, world, visible, plot, onEvents, brushing, legendSelected]);
  return <EChart ref={chartRef} option={rendered} replaceMerge={['series']} showDataTable={false} opts={{ renderer: 'svg' }}
    ariaLabel={label} style={{ width: '100%', height: '100%' }} onEvents={onEvents} />;
}

function FacetChart({ exportSpec, height, chartRef, legendSelected, label, events }) {
  const host = useRef(null), [width, setWidth] = useState(1200);
  useEffect(() => {
    const measure = () => setWidth(Math.max(720, host.current?.clientWidth || 1200));
    measure(); const observer = new ResizeObserver(measure); observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const option = useMemo(() => exportSpec.displayOption({ width, height }), [exportSpec, width, height]);
  return <div ref={host} className="diting-facet-surface"><EChart ref={chartRef} option={{ ...option, toolbox: { show: false },
    legend: option.legend ? { ...option.legend, selected: legendSelected } : undefined }} notMerge
    showDataTable={false} opts={{ renderer: 'svg' }} ariaLabel={label} style={{ height, minWidth: 720 }} onEvents={events} /></div>;
}

// Uses the exact MAG camera, minimap, joystick and export settings components.
// ECharts receives the visible data window, so text and symbols stay unscaled.
export default function ResearchChartSurface({ option, world, resetKey, label, onSelect, onBrush, exportSpec, facet = false, height = 600,
  exportLabel = '导出通路图形', brushLabel = '框选通路' }) {
  const ref = useRef(null), target = useChartFrameToolbarTarget();
  const onSelectRef = useRef(onSelect), onBrushRef = useRef(onBrush);
  useEffect(() => { onSelectRef.current = onSelect; onBrushRef.current = onBrush; }, [onSelect, onBrush]);
  const [brushing, setBrushing] = useState(false), [legendSelected, setLegendSelected] = useState({}), [status, setStatus] = useState('');
  useEffect(() => {
    ref.current?.getEchartsInstance?.()?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: brushing ? 'rect' : false } });
  }, [brushing]);
  const preview = useMemo(() => facet ? '' : previewImage(option), [option, facet]);
  const insets = useMemo(() => ({ left: Number(list(option.grid)[0].left) || 85, top: list(option.title || []).length ? 80 : Number(list(option.grid)[0].top) || 52 }), [option]);
  const clear = () => {
    ref.current?.getEchartsInstance?.()?.dispatchAction({ type: 'brush', areas: [] });
    ref.current?.getEchartsInstance?.()?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: false } });
    setBrushing(false); onBrush?.([]);
  };
  const brushEnabled = Boolean(onBrush);
  const events = useMemo(() => ({
    click: event => { if (event.componentType === 'series') onSelectRef.current?.(event.data); },
    legendselectchanged: event => setLegendSelected(event.selected),
    ...(brushEnabled && !facet ? { brushselected: event => {
      const selected = event.batch?.[0]?.selected || [];
      onBrushRef.current?.([...new Set(selected.flatMap(series => series.dataIndex.flatMap(index => ids(option.series[series.seriesIndex]?.data[index]))))]);
    } } : {}),
  }), [option, brushEnabled, facet]);
  const actions = useMemo(() => [{ id: 'export', icon: 'export', label: exportLabel, supportsCustomSize: true,
    suggestedSize: exportSpec.suggestedSize || { width: 1600, height: Math.max(700, height) }, disabled: status === '正在导出…',
    onClick: async (settings = {}) => {
      const width = settings.width || 1600, h = settings.height || Math.max(700, height);
      const ratio = Math.min(settings.pixelRatio || 2, 16384 / width, 16384 / h, Math.sqrt(32000000 / (width * h)));
      setStatus('正在导出…');
      const ok = await exportEChart(ref, { fileName: exportSpec.fileName, format: settings.format || 'svg', rasterizeSvg: true,
        minWidth: width, maxWidth: width, minHeight: h, maxHeight: h, pixelRatio: ratio,
        prepareOption: () => {
          const full = exportSpec.buildOption({ width, height: h });
          return { ...full, legend: full.legend ? { ...full.legend, selected: legendSelected } : undefined,
            tooltip: { show: false }, brush: undefined, dataZoom: undefined, backgroundColor: '#fff' };
        } });
      setStatus(ok ? '图像已导出' : '导出失败，请重试');
    } }], [exportSpec, height, legendSelected, status, exportLabel]);
  useChartFrameActions(actions);
  return <div className="research-chart-surface">
    {onBrush && !facet && <div className="diting-chart-actions">
      <button type="button" className="analysis-button" aria-pressed={brushing} onClick={() => {
        const next = !brushing; setBrushing(next);
        ref.current?.getEchartsInstance?.()?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: next ? 'rect' : false } });
      }}>{brushLabel}</button>
      <button type="button" className="analysis-button" onClick={clear}>清除框选</button>
      <span>框选定位下方完整结果；检验与全表校正保持同一口径。</span>
    </div>}
    {status && <p className="diting-caption" role="status">{status}</p>}
    {facet ? <FacetChart chartRef={ref} exportSpec={exportSpec} height={height} legendSelected={legendSelected} label={label} events={events} />
      : <ZoomableChartViewport world={world} resetKey={resetKey} preview={preview} insets={insets} toolbarTarget={target}
        viewportHeight="clamp(500px, 68vh, 760px)" extraRight={option.visualMap ? 75 : 0} extraBottom={55} interactionLocked={brushing} ariaLabel={label}>
        {viewport => <CameraChart {...viewport} option={option} world={world} chartRef={ref} onEvents={events}
          brushing={brushing} legendSelected={legendSelected} label={label} />}
      </ZoomableChartViewport>}
  </div>;
}
