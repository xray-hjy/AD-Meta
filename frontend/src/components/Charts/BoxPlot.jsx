import { useMemo, useState } from 'react';
import ReactECharts from './CartesianEChart';
import ChartViewport from './ChartViewport';

const COLORS = { AD: '#e74c3c', NC: '#2ecc71' };
const BOX_FILLS = {
  AD: 'rgba(231, 76, 60, 0.24)',
  NC: 'rgba(46, 204, 113, 0.24)',
};

function boxStyle(group) {
  return {
    color: BOX_FILLS[group],
    borderColor: COLORS[group],
    borderWidth: 2,
  };
}

function BoxPlot({ data, featureLabel = '物种' }) {
  const [selectedSpecies, setSelectedSpecies] = useState([]);
  const [touched, setTouched] = useState(false);
  const [scaleMode, setScaleMode] = useState('log');
  const isLogScale = scaleMode === 'log';

  const availableSpecies = useMemo(() => {
    if (!data || !Array.isArray(data.items)) return [];
    return data.items.map(item => ({
      full: item.fullName,
      short: item.shortName,
      total: item.total,
      adBox: item.adBox,
      ncBox: item.ncBox,
      adOutliers: item.adOutliers || [],
      ncOutliers: item.ncOutliers || [],
      adOutlierPoints: normalizeOutlierPoints(item.adOutlierPoints, item.adOutliers),
      ncOutlierPoints: normalizeOutlierPoints(item.ncOutlierPoints, item.ncOutliers),
      adLogBox: item.adLogBox || item.adBox,
      ncLogBox: item.ncLogBox || item.ncBox,
      adLogOutliers: item.adLogOutliers || [],
      ncLogOutliers: item.ncLogOutliers || [],
      adLogOutlierPoints: normalizeOutlierPoints(item.adLogOutlierPoints, item.adLogOutliers),
      ncLogOutlierPoints: normalizeOutlierPoints(item.ncLogOutlierPoints, item.ncLogOutliers),
    }));
  }, [data]);

  const activeSpecies = useMemo(() => {
    if (selectedSpecies.length > 0) {
      return availableSpecies.filter(s => selectedSpecies.includes(s.full));
    }
    return touched ? [] : availableSpecies.slice(0, 5);
  }, [availableSpecies, selectedSpecies, touched]);

  const option = useMemo(() => {
    if (activeSpecies.length === 0) return null;

    const adData = [];
    const ncData = [];
    const adOutlierData = [];
    const ncOutlierData = [];
    const categories = [];

    for (const item of activeSpecies) {
      const adBox = isLogScale ? item.adLogBox : item.adBox;
      const ncBox = isLogScale ? item.ncLogBox : item.ncBox;
      const adOutlierPoints = isLogScale ? item.adLogOutlierPoints : item.adOutlierPoints;
      const ncOutlierPoints = isLogScale ? item.ncLogOutlierPoints : item.ncOutlierPoints;
      adData.push(adBox || [0, 0, 0, 0, 0]);
      ncData.push(ncBox || [0, 0, 0, 0, 0]);
      categories.push(item.short);
      adOutlierPoints.forEach(point => {
        adOutlierData.push({
          value: [item.short, point.value],
          species: item.short,
          group: 'AD',
          sample: point.sample,
        });
      });
      ncOutlierPoints.forEach(point => {
        ncOutlierData.push({
          value: [item.short, point.value],
          species: item.short,
          group: 'NC',
          sample: point.sample,
        });
      });
    }

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          if (p.seriesType === 'scatter') {
            return `<b>${p.data.group} 组 - ${p.data.species}</b><br/>
              尺度: ${isLogScale ? 'log10(丰度 + 1)' : '原始丰度'}<br/>
              样本编号: ${p.data.sample || '未知'}<br/>
              离群点: ${fmtNum(p.data.value[1], isLogScale)}`;
          }
          const d = p.data;
          const species = activeSpecies[p.dataIndex];
          const outlierCount = p.seriesName === 'AD'
            ? (isLogScale ? species.adLogOutliers.length : species.adOutliers.length)
            : (isLogScale ? species.ncLogOutliers.length : species.ncOutliers.length);
          return `<b>${p.seriesName} 组 - ${p.name}</b><br/>
            尺度: ${isLogScale ? 'log10(丰度 + 1)' : '原始丰度'}<br/>
            上限: ${fmtNum(d[4], isLogScale)}<br/>
            Q3: ${fmtNum(d[3], isLogScale)}<br/>
            <b>中位数: ${fmtNum(d[2], isLogScale)}</b><br/>
            Q1: ${fmtNum(d[1], isLogScale)}<br/>
            下限: ${fmtNum(d[0], isLogScale)}<br/>
            离群点数: ${outlierCount}`;
        },
        backgroundColor: 'rgba(30,41,59,0.9)',
        borderColor: 'transparent',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        extraCssText: 'border-radius:8px; padding:10px 14px;',
      },
      legend: {
        data: ['AD', 'NC', 'AD 离群点', 'NC 离群点'],
        top: 0,
        textStyle: { fontSize: 12, color: '#475569' },
      },
      grid: { left: 70, right: 30, top: 42, bottom: 60 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { rotate: 35, fontSize: 10, color: '#64748b', interval: 0 },
      },
      yAxis: {
        type: 'value',
        name: isLogScale ? 'log10(丰度 + 1)' : '丰度',
        nameTextStyle: { fontSize: 12, color: '#94a3b8' },
        axisLabel: {
          fontSize: 11,
          color: '#94a3b8',
          formatter: v => {
            if (isLogScale) return Number(v).toFixed(2);
            if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
            return v.toFixed(1);
          },
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [
        {
          name: 'AD',
          type: 'boxplot',
          data: adData,
          itemStyle: boxStyle('AD'),
          emphasis: { itemStyle: boxStyle('AD') },
          boxWidth: [14, 22],
        },
        {
          name: 'NC',
          type: 'boxplot',
          data: ncData,
          itemStyle: boxStyle('NC'),
          emphasis: { itemStyle: boxStyle('NC') },
          boxWidth: [14, 22],
        },
        {
          name: 'AD 离群点',
          type: 'scatter',
          data: adOutlierData,
          symbolSize: 7,
          itemStyle: { color: COLORS.AD, borderColor: COLORS.AD, borderWidth: 1 },
        },
        {
          name: 'NC 离群点',
          type: 'scatter',
          data: ncOutlierData,
          symbolSize: 7,
          itemStyle: { color: COLORS.NC, borderColor: COLORS.NC, borderWidth: 1 },
        },
      ],
    };
  }, [activeSpecies, isLogScale]);

  const toggle = (full) => {
    setTouched(true);
    setSelectedSpecies(prev =>
      prev.includes(full) ? prev.filter(c => c !== full) : [...prev, full]
    );
  };

  return (
    <div className="chart-plain">
      <div className="chart-control-strip">
        <span>默认 log10(丰度 + 1)</span>
        <span>显示离群点</span>
        <span>已选 {activeSpecies.length} 个{featureLabel}</span>
        {[
          { key: 'log', label: 'log10(丰度 + 1)' },
          { key: 'raw', label: '原始丰度' },
        ].map(mode => (
          <button
            key={mode.key}
            type="button"
            className={`chart-chip ${scaleMode === mode.key ? 'chart-chip--active' : ''}`}
            onClick={() => setScaleMode(mode.key)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="chart-chip-list">
        {availableSpecies.map(s => {
          const on = activeSpecies.some(item => item.full === s.full);
          return (
            <button
              key={s.full}
              type="button"
              className={`chart-chip ${on ? 'chart-chip--active' : ''}`}
              onClick={() => toggle(s.full)}
            >
              {s.short}
            </button>
          );
        })}
      </div>

      {option ? (
        <ChartViewport
          variant="data"
          minHeight={480}
          preferredHeight={Math.max(480, activeSpecies.length * 48 + 120)}
        >
          <ReactECharts
            option={option}
            opts={{ renderer: 'svg' }}
            style={{ width: '100%', height: '100%' }}
          />
        </ChartViewport>
      ) : (
        <div className="placeholder"><p>暂无数据</p></div>
      )}
    </div>
  );
}

function normalizeOutlierPoints(points, values) {
  if (Array.isArray(points)) {
    return points.map(point => ({
      sample: point?.sample ? String(point.sample) : null,
      value: Number(point?.value ?? 0),
    }));
  }
  if (!Array.isArray(values)) return [];
  return values.map(value => ({
    sample: null,
    value: Number(value),
  }));
}

function fmtNum(v, isLogScale = false) {
  if (isLogScale) return Number(v).toFixed(4);
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
}

export default BoxPlot;
