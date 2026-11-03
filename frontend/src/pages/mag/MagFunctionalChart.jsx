import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EChart from '../../components/Charts/HeatmapEChart';
import '../../components/Charts/CartesianEChart';
import '../../components/Charts/TaxonomyEChart';
import ZoomableChartViewport from '../../components/Charts/ZoomableChartViewport';
import ChartStyleToolbar from '../../components/Charts/ChartStyleToolbar';
import useChartStylePreferences from '../../components/Charts/useChartStylePreferences';
import { useChartFrameActions, useChartFrameToolbarTarget } from '../../components/Charts/ChartFrameActionsContext';
import { exportEChart } from '../../components/Charts/chartExport';
import { HEATMAP_PALETTE_OPTIONS } from './magHeatmapOption';
import { researchPaletteOptions } from '../../components/Charts/researchPalettes';
import { GROUP_COLORS } from '../../components/Charts/groupPalette';
import { functionalMatrixGeometry } from './magFunctionalGeometry';

const DEFAULTS = { palette: 'pubugn', labels: true, hover: true, borders: false, annotations: true,
  transposed: false, values: false, grid: true, legend: true, fontSize: '11', pointSize: '7', dendrograms: true };

function CameraSurface({ option, world, visible, plot, dimensions, camera, onEvents, chartRef, label }) {
  const fromX = Math.max(0, visible.x), toX = Math.min(world.width, visible.x + visible.width);
  const fromY = Math.max(0, visible.y), toY = Math.min(world.height, visible.y + visible.height);
  const x0 = fromX / world.width * 100, x1 = toX / world.width * 100;
  const y0 = fromY / world.height * 100, y1 = toY / world.height * 100;
  const scale = camera?.k || 1;
  const rendered = { ...option, grid: { outerBoundsMode: 'none', left: (camera?.x ?? plot.left) + fromX * scale,
    top: (camera?.y ?? plot.top) + fromY * scale,
    width: Math.max(1, (toX - fromX) * scale), height: Math.max(1, (toY - fromY) * scale) },
    visualMap: { ...option.visualMap, right: 4, top: plot.top },
    dataZoom: [{ type: 'inside', disabled: true, xAxisIndex: 0, start: x0, end: x1, filterMode: 'filter' },
      { type: 'inside', disabled: true, yAxisIndex: 0, start: option.yAxis.inverse ? y0 : 100 - y1, end: option.yAxis.inverse ? y1 : 100 - y0, filterMode: 'filter' }] };
  return <EChart ref={chartRef} option={rendered} replaceMerge={['series', 'visualMap', 'dataZoom']} showDataTable={false}
    opts={{ renderer: 'svg', width: dimensions.width, height: dimensions.height }} style={{ width: dimensions.width, height: dimensions.height }} onEvents={onEvents}
    ariaLabel={label} frameActions />;
}

export default function MagFunctionalChart({ kind, data, buildOption, onSelect, onAxis, onBrush, height = 520, camera = false, label = 'MAG 功能图形' }) {
  const preferences = useChartStylePreferences(`mag-functional-${kind}`);
  const categorical = kind === 'overview';
  const grouped = ['coverage', 'signals', 'community-ko', 'comparison-distribution', 'coverage-sensitivity'].includes(kind);
  const style = useMemo(() => ({ ...DEFAULTS, discretePalette: categorical ? 'brewer-paired' : grouped ? 'current-groups' : 'mag-accent', ...preferences.values }), [preferences.values, categorical, grouped]);
  const target = useChartFrameToolbarTarget();
  const host = useRef(null), [containerWidth, setContainerWidth] = useState(800);
  useEffect(() => {
    const measure = () => { if (host.current?.clientWidth) setContainerWidth(host.current.clientWidth); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (host.current) observer?.observe(host.current);
    return () => observer?.disconnect();
  }, []);
  const option = useMemo(() => {
    const built = buildOption(data, { ...style, containerWidth });
    const decorateAxis = axis => ({ ...axis, axisLabel: { ...axis.axisLabel, show: axis.axisLabel?.show !== false && style.labels, fontSize: Number(style.fontSize) },
      ...(axis.splitLine ? { splitLine: { ...axis.splitLine, show: style.grid && axis.splitLine.show !== false } } : {}) });
    return { ...built, textStyle: { ...built.textStyle, fontSize: Number(style.fontSize) },
      ...(built.legend ? { legend: { ...built.legend, show: style.legend } } : {}),
      xAxis: Array.isArray(built.xAxis) ? built.xAxis.map(decorateAxis) : built.xAxis ? decorateAxis(built.xAxis) : undefined,
      yAxis: Array.isArray(built.yAxis) ? built.yAxis.map(decorateAxis) : built.yAxis ? decorateAxis(built.yAxis) : undefined };
  }, [buildOption, data, style, containerWidth]);
  const [brushing, setBrushing] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const chart = useRef(null);
  const fields = [
    ...(camera ? [{ key: 'transposed', label: '交换横纵轴', type: 'toggle' },
      { key: 'palette', label: '配色', type: 'palette', options: HEATMAP_PALETTE_OPTIONS },
      { key: 'annotations', label: '质量旁注', type: 'switch' }, { key: 'borders', label: '单元格边界', type: 'switch', more: true },
      ...(data?.dendrograms ? [{ key: 'dendrograms', label: '聚类树', type: 'switch', more: true }] : [])] : []),
    ...(!camera && (categorical || grouped || kind.includes('ranking')) ? [{ key: 'discretePalette', label: '配色', type: 'palette', discrete: true,
      options: [...(categorical ? [] : [{ value: grouped ? 'current-groups' : 'mag-accent', label: grouped ? '当前 AD / NC 配色' : 'MAG 主题色', colors: grouped ? [GROUP_COLORS.AD, GROUP_COLORS.NC] : ['#a44060', '#a44060'] }]),
        ...researchPaletteOptions(categorical ? 'taxonomy' : 'quality', { palette: style.discretePalette })] }] : []),
    { key: 'labels', label: '标签', type: 'switch' }, { key: 'hover', label: '悬浮', type: 'switch' },
    ...(camera || kind.includes('ranking') ? [{ key: 'values', label: '数值', type: 'switch', more: true }] : []),
    ...(!camera && option.xAxis ? [{ key: 'grid', label: '网格', type: 'switch', more: true }] : []),
    ...(option.legend ? [{ key: 'legend', label: '图例', type: 'switch', more: true }] : []),
    { key: 'fontSize', label: '字号', options: [{ value: '10', label: '小' }, { value: '11', label: '中' }, { value: '13', label: '大' }], more: true },
    ...(['overview', 'coverage', 'signals', 'community-ko'].includes(kind) ? [{ key: 'pointSize', label: '点大小', options: [{ value: '5', label: '小' }, { value: '7', label: '中' }, { value: '10', label: '大' }], more: true }] : []),
  ];
  const tools = <ChartStyleToolbar fields={fields} values={style} onChange={preferences.update} onReset={preferences.reset} />;
  const actions = useMemo(() => [{ id: 'export', icon: 'export', label: '导出图像', supportsCustomSize: true,
    suggestedSize: { width: 1400, height: Math.max(800, kind === 'comparison-distribution' ? Math.ceil((data?.items.length || 1) / 2) * 270 : 800) },
    disabled: exportStatus === '正在导出…', onClick: async (settings = {}) => {
      const width = settings.width || 1400, h = settings.height || 900;
      const selected = chart.current?.getEchartsInstance?.()?.getOption?.()?.legend?.[0]?.selected;
      const full = kind === 'comparison-distribution' ? buildOption(data, { ...style, containerWidth: width, containerHeight: h }) : option;
      const ratio = Math.min(settings.pixelRatio || 2, 16384 / width, 16384 / h, Math.sqrt(32000000 / (width * h)));
      setExportStatus('正在导出…');
      const ok = await exportEChart(chart, { fileName: `MAG-${kind}-${(data?.projectionFingerprint || data?.release || '').slice(0, 12)}`,
        format: settings.format || 'svg', minWidth: width, maxWidth: width, minHeight: h, maxHeight: h, pixelRatio: ratio, rasterizeSvg: true,
        prepareOption: () => ({ ...full, ...(full.legend ? { legend: { ...full.legend, selected } } : {}),
          tooltip: { show: false }, brush: undefined, dataZoom: undefined, backgroundColor: '#fff', animation: false }) });
      setExportStatus(ok ? '图像已导出' : '导出失败，请重试');
    } }], [kind, data, option, buildOption, style, exportStatus]);
  useChartFrameActions(actions);
  const events = {
    click: p => {
      if (p.componentType === 'series') onSelect?.(p.data);
      if (p.componentType === 'xAxis' || p.componentType === 'yAxis') onAxis?.({ axis: p.componentType, value: p.value, transposed: style.transposed });
    },
    brushselected: event => {
      const entries = event.batch?.[0]?.selected || [];
      onBrush?.([...new Set(entries.flatMap(s => s.dataIndex.map(i => option.series[s.seriesIndex]?.data[i]?.magId)).filter(Boolean))]);
    },
  };
  const geometry = useMemo(() => functionalMatrixGeometry(option.yAxis?.data?.length || 1, option.xAxis?.data?.length || 1), [option.xAxis, option.yAxis]);
  const world = geometry.world;
  const preview = useMemo(() => {
    if (!camera) return '';
    const rows = style.transposed ? data.features.length : data.mags.length;
    const columns = style.transposed ? data.mags.length : data.features.length;
    const rowStep = Math.max(1, Math.ceil(rows / 100)), columnStep = Math.max(1, Math.ceil(columns / 100));
    const colors = HEATMAP_PALETTE_OPTIONS.find(p => p.value === style.palette)?.colors || ['#edf0f4', '#0a5747'];
    const rects = [];
    for (let y = 0; y < rows; y += rowStep) for (let x = 0; x < columns; x += columnStep) {
      const value = style.transposed ? data.values[x][y] : data.values[y][x];
      const color = value == null ? '#a2aab5' : value > 0 ? colors[colors.length - 1] : '#edf0f4';
      rects.push(`<rect x="${x}" y="${y}" width="${Math.min(columnStep, columns - x)}" height="${Math.min(rowStep, rows - y)}" fill="${color}"/>`);
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(1, columns)} ${Math.max(1, rows)}" preserveAspectRatio="none">${rects.join('')}</svg>`)}`;
  }, [camera, data, style.transposed, style.palette]);
  const actualHeight = kind === 'comparison-distribution' ? Math.ceil((data?.items.length || 1) / (containerWidth > 900 ? 2 : 1)) * 270
    : kind.includes('ranking') ? Math.min(760, Math.max(260, (data?.items.length || 1) * 25 + 100)) : height;
  return <div className="mag-functional-chart" ref={host}>
    {target ? createPortal(tools, target) : tools}
    {exportStatus && <p className="mag-muted" role="status">{exportStatus}</p>}
    {onBrush && <div className="mag-research-chart__actions"><button className="analysis-button" type="button" aria-pressed={brushing}
      onClick={() => { const next = !brushing; setBrushing(next); chart.current?.getEchartsInstance()?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: next ? 'rect' : false } }); }}>框选 MAG</button>
      <button className="analysis-button" type="button" onClick={() => { chart.current?.getEchartsInstance()?.dispatchAction({ type: 'brush', areas: [] }); setBrushing(false); onBrush([]); }}>清除框选</button>
      <span>框选定位目录，不改变分析集合。</span></div>}
    {camera ? <><ZoomableChartViewport world={world} resetKey={`${data.projectionFingerprint}:${style.transposed}`} preview={preview}
      initialScale={1} initialNavigationOpen={false} previewStretch
      insets={{ left: option.grid.left, top: option.grid.top }} extraRight={80}
      viewportHeight={`min(${geometry.viewportHeight}px, 78vh)`} ariaLabel={label}>
      {viewport => <CameraSurface {...viewport} world={world} option={option} onEvents={events} label={label} chartRef={chart} />}
    </ZoomableChartViewport><p className="mag-functional-viewport-note">全部 {data.mags.length} 个 MAG × {data.features.length} 项功能已载入。默认按可读单元格显示；Alt + 拖动或方向键平移，“全图”用于定位，“1:1”恢复读值。缩略图抽样用于定位，数值以主图为准；左侧窄轨道为完整度 / 污染率。</p></> : <EChart ref={chart} option={option} replaceMerge={['series', 'visualMap', 'dataZoom', 'xAxis', 'yAxis', 'grid']}
      opts={{ renderer: 'svg', width: containerWidth, height: actualHeight }} style={{ height: actualHeight }} frameActions showDataTable={false} ariaLabel={label} onEvents={events} />}
  </div>;
}
