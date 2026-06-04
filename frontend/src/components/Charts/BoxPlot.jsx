import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';

const COLORS = { AD: '#e74c3c', NC: '#2ecc71' };

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
      adLogBox: item.adLogBox || item.adBox,
      ncLogBox: item.ncLogBox || item.ncBox,
      adLogOutliers: item.adLogOutliers || [],
      ncLogOutliers: item.ncLogOutliers || [],
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
      const adOutliers = isLogScale ? item.adLogOutliers : item.adOutliers;
      const ncOutliers = isLogScale ? item.ncLogOutliers : item.ncOutliers;
      adData.push(adBox || [0, 0, 0, 0, 0]);
      ncData.push(ncBox || [0, 0, 0, 0, 0]);
      categories.push(item.short);
      adOutliers.forEach(value => {
        adOutlierData.push({
          value: [item.short, value],
          species: item.short,
          group: 'AD',
        });
      });
      ncOutliers.forEach(value => {
        ncOutlierData.push({
          value: [item.short, value],
          species: item.short,
          group: 'NC',
        });
      });
    }

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          if (p.seriesType === 'scatter') {
            return `<b>${p.data.group} 组 — ${p.data.species}</b><br/>
              尺度: ${isLogScale ? 'log10(丰度 + 1)' : '原始丰度'}<br/>
              离群点: ${fmtNum(p.data.value[1], isLogScale)}`;
          }
          const d = p.data;
          const species = activeSpecies[p.dataIndex];
          const outlierCount = p.seriesName === 'AD'
            ? (isLogScale ? species.adLogOutliers.length : species.adOutliers.length)
            : (isLogScale ? species.ncLogOutliers.length : species.ncOutliers.length);
          return `<b>${p.seriesName} 组 — ${p.name}</b><br/>
            尺度: ${isLogScale ? 'log10(丰度 + 1)' : '原始丰度'}<br/>
            上限 (Whisker): ${fmtNum(d[4], isLogScale)}<br/>
            上四分位数 (Q3): ${fmtNum(d[3], isLogScale)}<br/>
            <b>中位数 (Median): ${fmtNum(d[2], isLogScale)}</b><br/>
            下四分位数 (Q1): ${fmtNum(d[1], isLogScale)}<br/>
            下限 (Whisker): ${fmtNum(d[0], isLogScale)}<br/>
            离群点数: ${outlierCount}`;
        },
        backgroundColor: 'rgba(30,41,59,0.9)',
        borderColor: 'transparent',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        extraCssText: 'border-radius:8px; padding:10px 14px;',
      },
      legend: { data: ['AD', 'NC', 'AD 离群点', 'NC 离群点'], top: 0, textStyle: { fontSize: 12, color: '#475569' } },
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
        axisLabel: { fontSize: 11, color: '#94a3b8', formatter: v => {
          if (isLogScale) return Number(v).toFixed(2);
          if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
          if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
          return v.toFixed(1);
        }},
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [
        {
          name: 'AD', type: 'boxplot', data: adData,
          itemStyle: { color: COLORS.AD, borderColor: '#c0392b' },
          boxWidth: [14, 22],
        },
        {
          name: 'NC', type: 'boxplot', data: ncData,
          itemStyle: { color: COLORS.NC, borderColor: '#27ae60' },
          boxWidth: [14, 22],
        },
        {
          name: 'AD 离群点',
          type: 'scatter',
          data: adOutlierData,
          symbolSize: 7,
          itemStyle: { color: COLORS.AD, borderColor: '#7f1d1d', borderWidth: 1 },
        },
        {
          name: 'NC 离群点',
          type: 'scatter',
          data: ncOutlierData,
          symbolSize: 7,
          itemStyle: { color: COLORS.NC, borderColor: '#14532d', borderWidth: 1 },
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
    <section style={{
      padding: '12px 16px',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      background: '#fff',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 900,
      margin: '0 auto',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>丰度箱线图</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>
        默认 log10(丰度 + 1) · 显示离群点 · 可切换原始丰度 · 已选 {activeSpecies.length} 个
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[
          { key: 'log', label: 'log10(丰度 + 1)' },
          { key: 'raw', label: '原始丰度' },
        ].map(mode => {
          const on = scaleMode === mode.key;
          return (
            <button
              key={mode.key}
              onClick={() => setScaleMode(mode.key)}
              style={{
                padding: '3px 10px',
                borderRadius: 14,
                border: '1px solid',
                borderColor: on ? '#0f766e' : '#e2e8f0',
                background: on ? '#ccfbf1' : '#fff',
                color: on ? '#0f766e' : '#64748b',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'inherit',
                fontWeight: on ? 700 : 500,
              }}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {availableSpecies.map(s => {
          const on = activeSpecies.some(item => item.full === s.full);
          return (
            <button
              key={s.full}
              onClick={() => toggle(s.full)}
              style={{
                padding: '2px 8px', borderRadius: 12, border: '1px solid',
                borderColor: on ? '#4f46e5' : '#e2e8f0',
                background: on ? '#eef2ff' : '#fff',
                color: on ? '#4f46e5' : '#64748b',
                cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
              }}
            >
              {s.short}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {option ? (
          <ReactECharts option={option} opts={{ renderer: 'svg' }} style={{ height: Math.max(280, Math.min(460, activeSpecies.length * 48 + 60)) }} />
        ) : (
          <div className="placeholder"><p>暂无数据</p></div>
        )}
      </div>
    </section>
  );
}

function fmtNum(v, isLogScale = false) {
  if (isLogScale) return Number(v).toFixed(4);
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
}

export default BoxPlot;
