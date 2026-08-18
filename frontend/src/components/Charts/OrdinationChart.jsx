import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';
import OrdinationResources from './OrdinationResources';

const GROUP_COLORS = {
  AD: '#e74c3c',
  NC: '#2ecc71',
};
const BASE_GRID = { left: 70, right: 30, top: 58, bottom: 66 };

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
    if (!element || !chart) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    chart.setOption(
      { grid: equalAspectGrid(boundsRef.current, rect) },
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

  return [surfaceRef, onChartReady];
}

function OrdinationChart({ data }) {
  const [showEllipses, setShowEllipses] = useState(true);
  const {
    points: dataPoints,
    ellipses: dataEllipses,
    method,
    variance,
  } = data || {};
  const points = useMemo(
    () => Array.isArray(dataPoints) ? dataPoints : [],
    [dataPoints],
  );
  const ellipses = useMemo(
    () => Array.isArray(dataEllipses) ? dataEllipses : [],
    [dataEllipses],
  );
  const bounds = useMemo(() => axisBounds(points, ellipses), [ellipses, points]);
  const [surfaceRef, onChartReady] = useEqualAspectGrid(bounds, points.length > 0);

  const option = useMemo(() => {
    if (points.length === 0) return null;

    const groups = [...new Set(points.map(point => point.group))].sort();
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
        color: GROUP_COLORS[ellipse.group] || '#64748b',
        width: 1.5,
        type: 'dashed',
        opacity: 0.65,
      },
      tooltip: { show: false },
    })) : [];

    const scatterSeries = groups.map(group => ({
      name: group,
      type: 'scatter',
      symbolSize: 10,
      z: 2,
      data: points
        .filter(point => point.group === group)
        .map(point => [point.x, point.y, point.sample, point.group]),
      itemStyle: {
        color: GROUP_COLORS[group] || '#64748b',
        opacity: 0.86,
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
      tooltip: {
        trigger: 'item',
        formatter(params) {
          const item = params.data || [];
          if (!Array.isArray(item) || item.length < 4) return '';
          return `
            <b>${item[2] || ''}</b><br/>
            分组: ${item[3] || ''}<br/>
            ${axisPrefix} 1: ${Number(item[0]).toFixed(4)}<br/>
            ${axisPrefix} 2: ${Number(item[1]).toFixed(4)}
          `;
        },
        backgroundColor: 'rgba(30,41,59,0.9)',
        borderColor: 'transparent',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        extraCssText: 'border-radius:8px; padding:10px 14px;',
      },
      legend: {
        data: groups,
        right: 18,
        top: 18,
        orient: 'horizontal',
        textStyle: { fontSize: 13, color: '#475569' },
      },
      grid: BASE_GRID,
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
      ],
      toolbox: {
        right: 14,
        top: 42,
        feature: { restore: { title: '重置缩放' }, saveAsImage: { title: '导出图片', pixelRatio: 2 } },
      },
      xAxis: {
        type: 'value',
        name: `${axisPrefix} 1 (${((varianceValues[0] || 0) * 100).toFixed(1)}%)`,
        min: bounds.xMin,
        max: bounds.xMax,
        nameLocation: 'center',
        nameGap: 34,
        nameTextStyle: { fontSize: 12, color: '#64748b' },
        axisLabel: { fontSize: 10, color: '#475569' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      yAxis: {
        type: 'value',
        name: `${axisPrefix} 2 (${((varianceValues[1] || 0) * 100).toFixed(1)}%)`,
        min: bounds.yMin,
        max: bounds.yMax,
        nameLocation: 'center',
        nameGap: 46,
        nameTextStyle: { fontSize: 12, color: '#64748b' },
        axisLabel: { fontSize: 10, color: '#475569' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [...ellipseSeries, ...scatterSeries],
    };
  }, [bounds, ellipses, method, points, showEllipses, variance]);

  if (!option) {
    return <div className="placeholder"><p>暂无降维分析数据</p></div>;
  }

  return (
    <div className="chart-plain chart-plain--ordination">
      <div className="ordination-chart__controls">
        <button type="button" onClick={() => setShowEllipses(value => !value)} aria-pressed={showEllipses}>
          {showEllipses ? '隐藏 95% 分布椭圆' : '显示 95% 分布椭圆'}
        </button>
        <span>椭圆为组内数据分布辅助图层，不是均值置信区间。</span>
      </div>
      <ChartViewport variant="ordination" minHeight={460} preferredHeight={600} maxHeight={720}>
        <div className="ordination-chart__surface" ref={surfaceRef}>
          <ReactECharts
            option={option}
            onChartReady={onChartReady}
            showDataTable={false}
            notMerge
            lazyUpdate
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </ChartViewport>
      <OrdinationResources data={data} />
    </div>
  );
}

export default OrdinationChart;
