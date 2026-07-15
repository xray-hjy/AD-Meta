import { useMemo } from 'react';
import ReactECharts from './CartesianEChart';

const GROUP_COLORS = {
  AD: '#e74c3c',
  NC: '#2ecc71',
};

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

function OrdinationChart({ data, footer }) {
  const option = useMemo(() => {
    const points = Array.isArray(data?.points) ? data.points : [];
    const ellipses = Array.isArray(data?.ellipses) ? data.ellipses : [];
    if (points.length === 0) return null;

    const groups = [...new Set(points.map(point => point.group))].sort();
    const bounds = axisBounds(points, ellipses);
    const variance = Array.isArray(data?.variance) ? data.variance : [];

    const ellipseSeries = ellipses.map(ellipse => ({
      name: `${ellipse.group} 95% CI`,
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
    }));

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
            Axis 1: ${Number(item[0]).toFixed(4)}<br/>
            Axis 2: ${Number(item[1]).toFixed(4)}
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
      grid: { left: 72, right: 42, top: 62, bottom: 78 },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
      ],
      xAxis: {
        type: 'value',
        name: `Axis 1 (${((variance[0] || 0) * 100).toFixed(1)}%)`,
        min: bounds.xMin,
        max: bounds.xMax,
        nameLocation: 'center',
        nameGap: 34,
        nameTextStyle: { fontSize: 12, color: '#64748b' },
        axisLabel: { fontSize: 10, color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      yAxis: {
        type: 'value',
        name: `Axis 2 (${((variance[1] || 0) * 100).toFixed(1)}%)`,
        min: bounds.yMin,
        max: bounds.yMax,
        nameLocation: 'center',
        nameGap: 46,
        nameTextStyle: { fontSize: 12, color: '#64748b' },
        axisLabel: { fontSize: 10, color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [...ellipseSeries, ...scatterSeries],
    };
  }, [data]);

  if (!option) {
    return <div className="placeholder"><p>暂无降维分析数据</p></div>;
  }

  return (
    <div className="chart-plain chart-plain--ordination">
      <div className="ordination-chart-surface">
        <div className="ordination-chart-canvas">
          <ReactECharts option={option} style={{ width: '100%', height: '100%' }} />
        </div>
        {footer ? <div className="chart-plain__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export default OrdinationChart;
