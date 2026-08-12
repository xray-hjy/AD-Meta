import { useMemo } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';

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

function OrdinationChart({ data }) {
  const dataTableModel = useMemo(() => {
    const points = Array.isArray(data?.points) ? data.points : [];
    const variance = Array.isArray(data?.variance) ? data.variance : [];
    const axisPrefix = data?.method === 'PCA' ? 'PC' : 'Axis';
    const axisLabel = index => `${axisPrefix}${index + 1} (${((variance[index] || 0) * 100).toFixed(1)}%)`;
    const formatCoordinate = value => Number.isFinite(Number(value)) ? Number(value).toFixed(6) : '—';

    return {
      ariaLabel: `${data?.method || '排序分析'}当前样本坐标，可滚动`,
      columns: [
        { key: 'sample', label: '样本' },
        { key: 'group', label: '分组' },
        { key: 'x', label: axisLabel(0), format: formatCoordinate },
        { key: 'y', label: axisLabel(1), format: formatCoordinate },
      ],
      rows: points,
      rowKey: (row, index) => `${row.sample || '样本'}-${index}`,
      footer: `共 ${points.length} 个当前展示样本；95% 数据分布椭圆为根据样本坐标计算的辅助图层，不作为样本记录重复列出。`,
    };
  }, [data]);

  const option = useMemo(() => {
    const points = Array.isArray(data?.points) ? data.points : [];
    const ellipses = Array.isArray(data?.ellipses) ? data.ellipses : [];
    if (points.length === 0) return null;

    const groups = [...new Set(points.map(point => point.group))].sort();
    const bounds = axisBounds(points, ellipses);
    const variance = Array.isArray(data?.variance) ? data.variance : [];
    const axisPrefix = data?.method === 'PCA' ? 'PC' : 'Axis';

    const ellipseSeries = ellipses.map(ellipse => ({
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
      grid: { left: 72, right: 42, top: 62, bottom: 78 },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
      ],
      xAxis: {
        type: 'value',
        name: `${axisPrefix} 1 (${((variance[0] || 0) * 100).toFixed(1)}%)`,
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
        name: `${axisPrefix} 2 (${((variance[1] || 0) * 100).toFixed(1)}%)`,
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
  }, [data]);

  if (!option) {
    return <div className="placeholder"><p>暂无降维分析数据</p></div>;
  }

  return (
    <div className="chart-plain chart-plain--ordination">
      <ChartViewport variant="fit" minHeight={620} maxHeight={760}>
        <ReactECharts
          option={option}
          dataTableModel={dataTableModel}
          notMerge
          lazyUpdate
          style={{ width: '100%', height: '100%' }}
        />
      </ChartViewport>
    </div>
  );
}

export default OrdinationChart;
