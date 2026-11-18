import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';
import OrdinationResources from './OrdinationResources';
import ChartSupplement from './ChartSupplement';
import { exportEChart } from './chartExport';
import './ordination-tools.css';
import { escapeTooltipText } from '../../utils/tooltipHtml';

const GROUP_COLORS = {
  AD: '#e74c3c',
  NC: '#2ecc71',
};
const BASE_GRID = { left: 76, right: 36, top: 60, bottom: 70, outerBoundsMode: 'none' };

function axisBounds(points, ellipses) {
  const xs = [];
  const ys = [];

  points.forEach(point => {
    if (Number.isFinite(point.x)) xs.push(point.x);
    if (Number.isFinite(point.y)) ys.push(point.y);
  });

  ellipses.forEach(ellipse => {
    (ellipse.points || []).forEach(([x, y]) => {
      if (Number.isFinite(x)) xs.push(x);
      if (Number.isFinite(y)) ys.push(y);
    });
  });

  if (xs.length === 0 || ys.length === 0) {
    return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  }

  const rawXMin = Math.min(...xs);
  const rawXMax = Math.max(...xs);
  const rawYMin = Math.min(...ys);
  const rawYMax = Math.max(...ys);
  const xPad = (rawXMax - rawXMin || 1) * 0.08;
  const yPad = (rawYMax - rawYMin || 1) * 0.08;

  return {
    xMin: rawXMin - xPad,
    xMax: rawXMax + xPad,
    yMin: rawYMin - yPad,
    yMax: rawYMax + yPad,
  };
}

function equalAspectGrid(bounds, size) {
  const margin = BASE_GRID;
  if (!size.width || !size.height) return margin;
  const xSpan = bounds.xMax - bounds.xMin || 1;
  const ySpan = bounds.yMax - bounds.yMin || 1;
  const availableWidth = Math.max(120, size.width - margin.left - margin.right);
  const availableHeight = Math.max(120, size.height - margin.top - margin.bottom);
  const aspect = xSpan / ySpan;
  let plotWidth = availableWidth;
  let plotHeight = plotWidth / aspect;
  if (plotHeight > availableHeight) {
    plotHeight = availableHeight;
    plotWidth = plotHeight * aspect;
  }
  return {
    outerBoundsMode: 'none',
    left: margin.left + Math.max(0, (availableWidth - plotWidth) / 2),
    right: margin.right + Math.max(0, availableWidth - plotWidth - (availableWidth - plotWidth) / 2),
    top: margin.top + Math.max(0, (availableHeight - plotHeight) / 2),
    bottom: margin.bottom + Math.max(0, availableHeight - plotHeight - (availableHeight - plotHeight) / 2),
  };
}

function useEqualAspectGrid(bounds, surfaceMounted) {
  const surfaceRef = useRef(null);
  const chartRef = useRef(null);
  const frameRef = useRef(null);
  const boundsRef = useRef(bounds);

  const updateGrid = useCallback(() => {
    frameRef.current = null;
    const element = surfaceRef.current;
    const chart = chartRef.current;
    if (!element || !chart || chart.isDisposed?.()) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
    // One resize path owns both the renderer and equal-unit grid. Independent
    // debounced ECharts resizing can otherwise apply an old grid to a new box.
    chart.resize?.(size);
    chart.setOption(
      { grid: equalAspectGrid(boundsRef.current, size) },
      { notMerge: false, lazyUpdate: true },
    );
  }, []);

  const scheduleGridUpdate = useCallback(() => {
    if (frameRef.current == null) {
      frameRef.current = window.requestAnimationFrame(updateGrid);
    }
  }, [updateGrid]);

  useEffect(() => {
    if (!surfaceMounted) return undefined;
    const element = surfaceRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(scheduleGridUpdate);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      chartRef.current = null;
    };
  }, [scheduleGridUpdate, surfaceMounted]);

  useEffect(() => {
    boundsRef.current = bounds;
    scheduleGridUpdate();
  }, [bounds, scheduleGridUpdate]);

  const onChartReady = useCallback(chart => {
    chartRef.current = chart;
    scheduleGridUpdate();
  }, [scheduleGridUpdate]);

  return [surfaceRef, onChartReady, scheduleGridUpdate, chartRef];
}

function OrdinationChart({ data, projection }) {
  const featureCount = data?.featureCount;
  const [axisView, setAxisView] = useState('1,2');
  const selectedView = data?.axisViews?.find(view => view.axes.join(',') === axisView);
  const axisX = selectedView?.axes[0] || 1;
  const axisY = selectedView?.axes[1] || 2;
  const [showEllipses, setShowEllipses] = useState(true);
  const [pointSize, setPointSize] = useState(10);
  const [opacity, setOpacity] = useState(0.86);
  const [shape, setShape] = useState('circle');
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [palette, setPalette] = useState('default');
  const [ellipseLine, setEllipseLine] = useState('dashed');
  const [title, setTitle] = useState('');
  const [fontSize, setFontSize] = useState(12);
  const [legendPosition, setLegendPosition] = useState('top');
  const [zoom, setZoom] = useState([0, 100]);
  const [exportFormat, setExportFormat] = useState('svg');
  const [exportWidth, setExportWidth] = useState(1200);
  const [exportHeight, setExportHeight] = useState(800);
  const [message, setMessage] = useState('');
  const containerRef = useRef(null);
  const {
    points: dataPoints,
    ellipses: dataEllipses,
    method,
    variance,
    projectionStatus,
  } = { ...data, ...selectedView };
  const points = useMemo(
    () => Array.isArray(dataPoints) ? dataPoints : [],
    [dataPoints],
  );
  const ellipses = useMemo(
    () => Array.isArray(dataEllipses) ? dataEllipses : [],
    [dataEllipses],
  );
  const bounds = useMemo(() => axisBounds(points, ellipses), [ellipses, points]);
  const [surfaceRef, onChartReady, scheduleGridUpdate, chartRef] = useEqualAspectGrid(bounds, points.length > 0);

  const option = useMemo(() => {
    if (points.length === 0) return null;

    const groups = [...new Set(points.map(point => point.group))].sort();
    const colors = palette === 'accessible' ? { AD: '#D55E00', NC: '#0072B2' } : GROUP_COLORS;
    const varianceValues = Array.isArray(variance) ? variance : [];
    const axisPrefix = method === 'PCA' ? 'PC' : 'Axis';

    const ellipseSeries = showEllipses ? ellipses.map(ellipse => ({
      name: `${ellipse.group} ${ellipse.label || '95% 数据分布椭圆'}`,
      type: 'line',
      data: ellipse.points,
      symbol: 'none',
      silent: true,
      z: 1,
      lineStyle: {
        color: colors[ellipse.group] || '#64748b',
        width: 1.5,
        type: ellipseLine,
        opacity: 0.65,
      },
      tooltip: { show: false },
    })) : [];

    const scatterSeries = groups.map(group => ({
      name: group,
      type: 'scatter',
      symbolSize: pointSize,
      symbol: shape,
      label: { show: showLabels, formatter: params => String(params.data[2]), position: 'top' },
      labelLayout: { hideOverlap: true },
      z: 2,
      data: points
        .filter(point => point.group === group)
        .map(point => [point.x, point.y, point.sample, point.group]),
      itemStyle: {
        color: colors[group] || '#64748b',
        opacity,
      },
      emphasis: {
        itemStyle: {
          borderColor: '#0f172a',
          borderWidth: 1,
        },
      },
    }));

    return {
      animation: false,
      title: { text: title || `${method || '排序分析'} · ${points.length} 个样本 · ${featureCount ?? '—'} 个物种`, left: 'center', top: 0, textStyle: { fontSize: fontSize + 2 } },
      tooltip: {
        trigger: 'item',
        formatter(params) {
          const item = params.data || [];
          if (!Array.isArray(item) || item.length < 4) return '';
          return `
            <b>${escapeTooltipText(item[2])}</b><br/>
            分组: ${escapeTooltipText(item[3])}<br/>
            ${axisPrefix} ${axisX}: ${Number(item[0]).toFixed(4)}<br/>
            ${axisPrefix} ${axisY}: ${Number(item[1]).toFixed(4)}
          `;
        },
        backgroundColor: 'rgba(30,41,59,0.9)',
        borderColor: 'transparent',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        extraCssText: 'border-radius:8px; padding:10px 14px;',
      },
      legend: {
        data: groups,
        formatter: group => `${group} (n=${points.filter(point => point.group === group).length})`,
        show: showLegend,
        right: 18,
        ...(legendPosition === 'bottom' ? { bottom: 0 } : { top: 22 }),
        orient: 'horizontal',
        textStyle: { fontSize: 13, color: '#475569' },
      },
      grid: BASE_GRID,
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, yAxisIndex: 0, filterMode: 'none', start: zoom[0], end: zoom[1], zoomOnMouseWheel: true, moveOnMouseMove: true },
      ],
      toolbox: {
        right: 14,
        top: 42,
        feature: { restore: { title: '重置缩放' }, saveAsImage: { title: '导出图片', pixelRatio: 2 } },
      },
      xAxis: {
        type: 'value',
        name: `${axisPrefix} ${axisX} (${((varianceValues[0] || 0) * 100).toFixed(1)}%)`,
        min: bounds.xMin,
        max: bounds.xMax,
        nameLocation: 'center',
        nameGap: 34,
        nameTextStyle: { fontSize, color: '#64748b' },
        axisLine: { onZero: false },
        axisLabel: { fontSize: 10, color: '#475569', showMinLabel: false, showMaxLabel: false, formatter: value => Number(value.toPrecision(3)).toString() },
        splitLine: { show: showGrid, lineStyle: { color: '#f1f5f9' } },
      },
      yAxis: {
        type: 'value',
        name: `${axisPrefix} ${axisY} (${((varianceValues[1] || 0) * 100).toFixed(1)}%)`,
        min: bounds.yMin,
        max: bounds.yMax,
        nameLocation: 'center',
        nameGap: 46,
        nameTextStyle: { fontSize, color: '#64748b' },
        axisLine: { onZero: false },
        axisLabel: { fontSize: 10, color: '#475569', showMinLabel: false, showMaxLabel: false, formatter: value => Number(value.toPrecision(3)).toString() },
        splitLine: { show: showGrid, lineStyle: { color: '#f1f5f9' } },
      },
      series: [...ellipseSeries, ...scatterSeries],
    };
  }, [bounds, ellipses, method, points, showEllipses, variance, pointSize, opacity, shape, showGrid, showLegend, showLabels, palette, ellipseLine, title, fontSize, legendPosition, zoom, axisX, axisY, featureCount]);

  useEffect(() => { scheduleGridUpdate(); }, [option, scheduleGridUpdate]);
  useEffect(() => { setZoom([0, 100]); setAxisView('1,2'); }, [data]);
  const resetView = () => {
    setZoom([0, 100]);
    chartRef.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    scheduleGridUpdate();
  };
  const zoomBy = factor => {
    const current = chartRef.current?.getOption()?.dataZoom?.[0];
    const start = current?.start ?? zoom[0];
    const end = current?.end ?? zoom[1];
    const span = Math.min(100, Math.max(2, (end - start) * factor));
    const left = Math.max(0, Math.min(100 - span, (start + end - span) / 2));
    setZoom([left, left + span]);
  };
  const restoreStyle = () => {
    setPointSize(10); setOpacity(0.86); setShape('circle'); setShowGrid(true);
    setShowLegend(true); setShowLabels(false); setPalette('default'); setEllipseLine('dashed');
    setShowEllipses(true); setTitle(''); setFontSize(12); setLegendPosition('top');
  };
  const exportConfig = {
    fileName: `${String(method || 'ordination').toLowerCase()}-full-ordination`, format: exportFormat,
    minWidth: exportWidth, maxWidth: exportWidth, minHeight: exportHeight, maxHeight: exportHeight,
    fullDataZoom: true,
    prepareOption: (current, { size }) => ({ ...current, grid: equalAspectGrid(bounds, size) }),
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ method, methodVersion: data.methodVersion, points, variance, axes: [axisX, axisY],
      provenance: projection ? { projectionKey: projection.projectionKey, runKey: projection.runKey,
        artifactKey: projection.artifactKey, datasetRevision: projection.datasetRevision, scope: projection.scope,
        groupCounts: projection.projection?.groupCounts, parameters: projection.projection?.parameters } : null,
      featureSelection: data.featureSelection, sampleFiltering: data.sampleFiltering,
      preprocessing: data.preprocessing, inferenceContext: data.inferenceContext,
      filterAudit: data.resources?.filterAudit || [],
      view: { pointSize, opacity, shape, showEllipses, ellipseLine, showGrid, showLegend, palette, title, fontSize, legendPosition },
      exportScope: 'full_analysis',
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${method || 'ordination'}-analysis.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (!option) {
    const message = projectionStatus === 'not_interpretable_no_between_sample_variation'
      ? '当前样本组成没有可解释的样本间变异，无法计算 PCA。'
      : '暂无降维分析数据';
    return <div className="placeholder"><p>{message}</p><button type="button" onClick={exportData}>导出坐标、筛选明细与参数</button></div>;
  }

  return (
    <div className="chart-plain chart-plain--ordination" ref={containerRef}>
      <div className="ordination-chart__controls">
        <button type="button" onClick={() => setShowEllipses(value => !value)} aria-pressed={showEllipses}>
          {showEllipses ? '隐藏 95% 分布椭圆' : '显示 95% 分布椭圆'}
        </button>
        <button type="button" onClick={resetView}>全图 / 重置视野</button>
        <button type="button" onClick={() => zoomBy(0.8)}>放大</button>
        <button type="button" onClick={() => zoomBy(1.25)}>缩小</button>
        <button type="button" onClick={async () => {
          try { if (document.fullscreenElement) await document.exitFullscreen(); else await containerRef.current?.requestFullscreen(); }
          catch { setMessage('当前浏览器不支持全屏，可使用图框放大功能。'); }
        }}>全屏</button>
        <label>点大小<input aria-label="点大小" type="range" min="3" max="20" value={pointSize} onChange={event => setPointSize(Number(event.target.value))} /></label>
        <label>配色<select aria-label="配色" value={palette} onChange={event => setPalette(event.target.value)}><option value="default">默认</option><option value="accessible">色觉友好</option></select></label>
        <label><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} />网格</label>
        <label><input type="checkbox" checked={showLegend} onChange={event => setShowLegend(event.target.checked)} />图例</label>
      </div>
      <details className="ordination-tools"><summary>更多图形与导出设置</summary><div className="ordination-chart__controls">
        {data?.axisViews?.length > 1 ? <label>坐标轴组合<select aria-label="坐标轴组合" value={axisView} onChange={event => { setAxisView(event.target.value); setZoom([0, 100]); }}>{data.axisViews.map(view => <option key={view.axes.join(',')} value={view.axes.join(',')}>{method === 'PCA' ? 'PC' : 'Axis'} {view.axes.join(' / ')}</option>)}</select></label> : null}
        <label>点透明度<input aria-label="点透明度" type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
        <label>点形状<select aria-label="点形状" value={shape} onChange={event => setShape(event.target.value)}>{['circle', 'rect', 'triangle', 'diamond'].map(item => <option key={item}>{item}</option>)}</select></label>
        <label>椭圆线型<select aria-label="椭圆线型" value={ellipseLine} onChange={event => setEllipseLine(event.target.value)}>{['dashed', 'solid', 'dotted'].map(item => <option key={item}>{item}</option>)}</select></label>
        <label><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} />显示样本标签（自动避让）</label>
        <label>图标题<input aria-label="图标题" value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>坐标标题字号<input aria-label="坐标标题字号" type="number" min="9" max="20" value={fontSize} onChange={event => setFontSize(Math.max(9, Math.min(20, Number(event.target.value) || 12)))} /></label>
        <label>图例位置<select aria-label="图例位置" value={legendPosition} onChange={event => setLegendPosition(event.target.value)}><option value="top">上方</option><option value="bottom">下方</option></select></label>
        <button type="button" onClick={restoreStyle}>恢复默认样式</button>
        <label>图像格式<select aria-label="图像格式" value={exportFormat} onChange={event => setExportFormat(event.target.value)}><option value="svg">SVG</option><option value="png">PNG</option></select></label>
        <label>导出宽度<input aria-label="导出宽度" type="number" min="640" max="4000" value={exportWidth} onChange={event => setExportWidth(Math.min(4000, Math.max(640, Number(event.target.value) || 1200)))} /></label>
        <label>导出高度<input aria-label="导出高度" type="number" min="420" max="3000" value={exportHeight} onChange={event => setExportHeight(Math.min(3000, Math.max(420, Number(event.target.value) || 800)))} /></label>
        <button type="button" onClick={async () => {
          try { const ok = await exportEChart(chartRef.current, exportConfig); setMessage(ok ? '完整分析图已导出' : '导出失败，请重试'); }
          catch { setMessage('导出失败，请重试'); }
        }}>导出完整分析图</button>
        <button type="button" onClick={exportData}>导出坐标、筛选明细与参数</button>
      </div></details>
      <p className="ordination-tools__note">{method || '排序分析'} · {points.length} 个样本 · {data?.featureCount ?? data?.speciesCount ?? '—'} 个物种。横纵轴单位长度一致；滚轮同步缩放，拖动平移。缩放后视野可能隐藏点或椭圆，可用“全图”恢复。图像导出为完整分析范围（保持当前样式和图例分组选择）。</p>
      <p className="ordination-tools__note">95% 椭圆由组内坐标协方差与二维 χ² 阈值 5.991 计算，为分布辅助图层，不是均值置信区间，不能单独证明显著差异。</p>
      {message ? <p role="status">{message}</p> : null}
      <ChartViewport variant="ordination" minHeight={460} preferredHeight={600} maxHeight={720}>
        <div className="ordination-chart__surface" ref={surfaceRef}>
          <ReactECharts
            option={option}
            exportConfig={exportConfig}
            frameActions
            onChartReady={onChartReady}
            autoResize={false}
            onEvents={{ restore: () => { resetView(); } }}
            showDataTable={false}
            notMerge
            lazyUpdate
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </ChartViewport>
      <ChartSupplement><OrdinationResources data={data} /></ChartSupplement>
    </div>
  );
}

export default OrdinationChart;
