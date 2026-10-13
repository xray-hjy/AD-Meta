import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { scaleLinear } from 'd3';
import './CartesianEChart'; // Register bar/axis components for isolated exports.
import ZoomableChartViewport from './ZoomableChartViewport';
import NativeGroupedBarSurface from './NativeGroupedBarSurface';
import ClientDataTable from '../data-display/ClientDataTable';
import ResultDisclosure from '../data-display/ResultDisclosure';
import ChartSupplement from './ChartSupplement';
import BarStyleToolbar from './BarStyleToolbar';
import useChartStylePreferences from './useChartStylePreferences';
import { useChartFrameActions, useChartFrameToolbarTarget } from './ChartFrameActionsContext';
import ChartFrameActionGroup from './ChartFrameActionGroup';
import { applyBarStyle, barStyleDefaults, cleanBarStyle } from './barStyle';
import { buildGroupedBarOption } from './GroupedBarChart';
import { rangeCamera } from './chartCamera';
import { groupedBarMarkers } from './groupedBarMarkers';
import { exportEChart } from './chartExport';
import { useColorVision } from '../../context/ColorVisionContext';
import './zoomable-bar.css';

const VALUE_SIZE = 1200, CATEGORY_SIZE = 34;

export function groupedBarWorld(count, transposed) {
  return transposed ? { width: Math.max(1, count) * CATEGORY_SIZE, height: VALUE_SIZE }
    : { width: VALUE_SIZE, height: Math.max(1, count) * CATEGORY_SIZE };
}

export function groupedBarExportOption(model, preferences, config, seriesMode = 'bar') {
  const option = buildGroupedBarOption(model);
  if (preferences.transposed) {
    const category = option.yAxis[0], value = option.xAxis[0];
    option.xAxis = [{ ...category, inverse: false, axisLabel: { ...category.axisLabel, rotate: 45, width: 100, overflow: 'truncate', interval: 0 } }];
    option.yAxis = [{ ...value, nameGap: 45 }];
    option.grid = { left: 85, right: 80, top: 52, bottom: 145 };
    option.series = option.series.map(series => ({ ...series, itemStyle: { ...series.itemStyle, borderRadius: [6, 6, 0, 0] },
      label: { ...series.label, position: 'top' } }));
  } else option.yAxis[0].axisLabel = { ...option.yAxis[0].axisLabel, width: 285, overflow: 'truncate', interval: 0 };
  const styled = applyBarStyle(option, preferences, config);
  if (!preferences.transposed || seriesMode !== 'line') return styled;
  return { ...styled, series: styled.series.map((series, index) => {
    const line = { ...series };
    delete line.barWidth; delete line.barMaxWidth; delete line.barGap; delete line.barCategoryGap;
    return { ...line, type: 'line', smooth: false, connectNulls: false, symbol: 'circle', symbolSize: 5,
      itemStyle: { color: series.itemStyle.color }, lineStyle: { color: series.itemStyle.color, width: 2, type: index % 2 ? 'dashed' : 'solid' },
      label: { ...series.label, position: 'top' } };
  }) };
}

export default function ZoomableGroupedBarChart({ model: inputModel, barStyleConfig, exportConfig, onSelect, toolbarTarget }) {
  const model = useMemo(() => ({ featureLabel: 'MAG', ...inputModel,
    items: inputModel.items.map(item => ({ ...item, id: item.id || item.feature || item.label,
      label: item.label || item.feature || item.id })) }), [inputModel]);
  const storedPreferences = useChartStylePreferences(barStyleConfig.key);
  const preferenceValues = useMemo(() => ({ transposed: Boolean(barStyleConfig.defaultTransposed), ...storedPreferences.values,
    ...(barStyleConfig.allowOrientation === false ? { transposed: false } : {}) }), [storedPreferences.values, barStyleConfig.defaultTransposed, barStyleConfig.allowOrientation]);
  const preferences = { ...storedPreferences, values: preferenceValues };
  const frameToolbar = useChartFrameToolbarTarget();
  const { colorBlindFriendly } = useColorVision();
  const [exportStatus, setExportStatus] = useState('');
  const [hiddenSeries, setHiddenSeries] = useState([]);
  const [seriesMode, setSeriesMode] = useState('bar');
  const [tableOpen, setTableOpen] = useState(false);
  const nativeRef = useRef(null);
  const tableRows = useMemo(() => model.items.map(item => ({ id: item.id, name: item.fullName || item.label,
    ...Object.fromEntries(model.series.map(series => [series.key, item.values[series.key] == null ? '—'
      : item.values[series.key] * (barStyleConfig.scale ?? 1)])) })), [model, barStyleConfig.scale]);
  const displaySeries = useMemo(() => model.series.filter(series => !hiddenSeries.includes(series.key)), [model.series, hiddenSeries]);
  const transposed = Boolean(preferences.values.transposed);
  const lineMode = barStyleConfig.allowLine !== false && transposed && seriesMode === 'line';
  const base = useMemo(() => buildGroupedBarOption(model), [model]);
  const settings = useMemo(() => ({ ...barStyleDefaults(base), groupHover: true, ...cleanBarStyle(preferences.values),
    ...(model.overlapSeries ? { groupMarkers: false } : {}) }), [base, preferences.values, model.overlapSeries]);
  const option = useMemo(() => {
    const result = groupedBarExportOption(model, preferences.values, barStyleConfig, lineMode ? 'line' : 'bar');
    return { ...result, legend: { ...result.legend, selected: Object.fromEntries(model.series.map(series => [series.label, !hiddenSeries.includes(series.key)])) } };
  }, [model, preferences.values, barStyleConfig, hiddenSeries, lineMode]);
  const world = useMemo(() => groupedBarWorld(model.items.length, transposed), [model.items.length, transposed]);
  const insets = useMemo(() => ({ left: transposed ? 95 : 305, top: 42 }), [transposed]);
  const remapCamera = ({ camera, previousPlot, plot, world }) => {
    const start = ((transposed ? previousPlot.top : previousPlot.left) - (transposed ? camera.y : camera.x)) / camera.k;
    const span = (transposed ? previousPlot.height : previousPlot.width) / camera.k;
    return rangeCamera(start, start + span, world, plot, transposed ? 'x' : 'y');
  };
  const preview = useMemo(() => {
    const width = 240, height = 180;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) return null;
    const values = model.items.flatMap(item => displaySeries.map(series => item.values[series.key])).filter(Number.isFinite);
    const scale = scaleLinear().domain([Math.min(0, ...values), Math.max(0, ...values) || 1]).nice(5).range([0, 1]);
    if (lineMode) {
      displaySeries.forEach(series => {
        context.strokeStyle = series.color; context.lineWidth = 1.5;
        context.setLineDash(model.series.indexOf(series) % 2 ? [4, 2] : []);
        context.beginPath();
        let connected = false;
        model.items.forEach((item, index) => {
          const value = item.values[series.key];
          if (!Number.isFinite(value)) { connected = false; return; }
          const x = (index + .5) / model.items.length * width, y = (1 - scale(value)) * height;
          if (connected) context.lineTo(x, y); else context.moveTo(x, y);
          connected = true;
        });
        context.stroke();
      });
      return canvas.toDataURL('image/png');
    }
    model.items.forEach((item, index) => displaySeries.forEach((series, s) => {
      const value = item.values[series.key]; if (!Number.isFinite(value)) return;
      context.fillStyle = series.color;
      const groups = model.overlapSeries ? 1 : displaySeries.length;
      const slot = (index + (model.overlapSeries ? 0 : s) / groups) / model.items.length, zero = scale(0), extent = scale(value);
      if (transposed) context.fillRect(slot * width, (1 - Math.max(zero, extent)) * height, Math.max(1, width / model.items.length / groups), Math.abs(extent - zero) * height);
      else context.fillRect(Math.min(zero, extent) * width, slot * height, Math.abs(extent - zero) * width, Math.max(1, height / model.items.length / groups));
    }));
    return canvas.toDataURL('image/png');
  }, [model, displaySeries, transposed, lineMode]);
  const suggestedSize = useMemo(() => ({
    width: Math.max(exportConfig.minWidth || 1100, transposed ? model.items.length * CATEGORY_SIZE + 165 : 1500),
    height: Math.max(exportConfig.minHeight || 640, transposed ? 1000 : model.items.length * CATEGORY_SIZE + 104),
  }), [exportConfig.minWidth, exportConfig.minHeight, transposed, model.items.length]);
  const actions = useMemo(() => [{ id: 'export', icon: 'export', label: exportConfig.title, supportsCustomSize: true, suggestedSize,
    disabled: exportStatus.startsWith('正在'), onClick: async (requested = {}) => {
    setExportStatus(lineMode ? '正在导出完整折线图…' : '正在导出完整条形图…');
    const width = Math.max(640, Math.min(60000, Math.round(Number(requested.width) || suggestedSize.width)));
    const height = Math.max(420, Math.min(60000, Math.round(Number(requested.height) || suggestedSize.height)));
    const exportOption = { ...option, aria: { enabled: true, decal: { show: colorBlindFriendly } } };
    if (settings.groupMarkers && !lineMode) {
      const category = transposed ? 'xAxis' : 'yAxis';
      exportOption[category] = option[category].map(axis => ({ ...axis, axisLabel: { ...axis.axisLabel, margin: transposed ? 32 : 38 } }));
      exportOption.graphic = groupedBarMarkers(model, displaySeries, settings, transposed, option.grid, width, height);
    }
    const ok = await exportEChart({ getOption: () => exportOption, getWidth: () => width, getHeight: () => height }, {
      ...exportConfig, format: requested.format || exportConfig.format,
      fileName: exportConfig.fileName + (lineMode ? '-line' : transposed ? '-vertical' : '-horizontal'), minWidth: width, maxWidth: width, minHeight: height, maxHeight: height,
      rasterizeSvg: true, pixelRatio: Math.min(Number(requested.pixelRatio) || 2, 16384 / width, 16384 / height, Math.sqrt(32000000 / (width * height))) });
    setExportStatus(ok ? '' : '导出失败，请重试。');
  } }], [exportConfig, suggestedSize, option, model, displaySeries, settings, transposed, lineMode, colorBlindFriendly, exportStatus]);
  const viewActions = useMemo(() => transposed && barStyleConfig.allowLine !== false ? [{ id: 'chart-type', icon: 'bar', alternateIcon: 'line',
    alternateActive: lineMode, text: lineMode ? '折线图' : '柱状图', label: lineMode ? '切换为柱状图' : '切换为折线图',
    onClick: () => { const next = lineMode ? 'bar' : 'line'; nativeRef.current?.setType(next); setSeriesMode(next); },
  }] : [], [transposed, lineMode, barStyleConfig.allowLine]);
  const utilityActions = useMemo(() => [
    { id: 'restore', icon: 'restore', label: '恢复图表视图', onClick: () => { nativeRef.current?.restore(); setSeriesMode('bar'); setHiddenSeries([]); } },
  ], []);
  const frameActions = useMemo(() => [...actions, ...viewActions, ...utilityActions], [actions, viewActions, utilityActions]);
  useChartFrameActions(frameActions);
  const toolbar = <BarStyleToolbar option={base} preferences={preferences.values} config={{ ...barStyleConfig, featureLabel: model.featureLabel,
    allowOrientation: barStyleConfig.allowOrientation !== false, allowGroupMarkers: !model.overlapSeries, allowGroupHover: true, allowValueZoom: true, lineMode }} onChange={preferences.update}
    onReset={() => { preferences.reset(); setHiddenSeries([]); setSeriesMode('bar'); }} />;
  return <>
    {frameToolbar ? createPortal(toolbar, frameToolbar) : toolbar}
    {!frameToolbar && <ChartFrameActionGroup actions={frameActions} />}
    {exportStatus && <p role="status">{exportStatus}</p>}
    <ZoomableChartViewport world={world} resetKey={model.items.map(item => item.id).join('|')} preview={preview} insets={insets}
      coordinateKey={transposed} remapCamera={remapCamera} toolbarTarget={toolbarTarget} navigationAxis={transposed ? 'x' : 'y'} navigationUnit={CATEGORY_SIZE}
      extraBottom={84} extraRight={56} navigationDockBottom={12} nativeWheel
      viewportHeight="clamp(480px, 65vh, 720px)" ariaLabel={model.title || '条形图'}>
      {viewport => <NativeGroupedBarSurface {...viewport} nativeRef={nativeRef} model={model} option={option} settings={settings} transposed={transposed} lineMode={lineMode} onSelect={onSelect} colorBlindFriendly={colorBlindFriendly}
        hiddenSeries={hiddenSeries} onLegendChange={selected => setHiddenSeries(model.series.filter(series => selected[series.label] === false).map(series => series.key))} onToggleSeries={key => setHiddenSeries(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key])} />}
    </ZoomableChartViewport>
    <ChartSupplement><ResultDisclosure title="当前图表数据（只读）" summary={`${model.items.length} 个${model.featureLabel} · 当前排序与数值${barStyleConfig.suffix || ''}`} open={tableOpen} onToggle={event => setTableOpen(event.currentTarget.open)}>
      {tableOpen && <ClientDataTable ariaLabel={`${model.featureLabel}图表原始数据，只读`} rows={tableRows}
        renderRow={row => <tr key={row.id}><td>{row.id}</td><td>{row.name}</td>{model.series.map(series => <td key={series.key}>{row[series.key]}</td>)}</tr>}>
        <thead><tr><th>{model.featureLabel} ID</th><th>{model.nameColumn || '名称 / 分类'}</th>{model.series.map(series => <th key={series.key}>{series.label}{barStyleConfig.suffix ? `（${barStyleConfig.suffix}）` : ''}</th>)}</tr></thead>
      </ClientDataTable>}
    </ResultDisclosure></ChartSupplement>
  </>;
}
