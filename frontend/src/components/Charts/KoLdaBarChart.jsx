import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

const GROUP_COLORS = {
  AD: '#d66a58',
  NC: '#5aa88d',
};

function formatNumber(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Math.abs(number) > 0 && Math.abs(number) < 0.001) {
    return number.toExponential(2);
  }
  return number.toFixed(digits);
}

function compactNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return number.toFixed(2);
}

function KoLdaBarChart({ data }) {
  const items = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data?.items]);
  const filter = data?.filter || {};
  const summary = useMemo(() => {
    const fallback = items.reduce(
      (acc, item) => {
        const group = item.enrichedGroup === 'NC' ? 'NC' : 'AD';
        acc.significantCount += 1;
        acc.displayedCount += 1;
        if (group === 'AD') {
          acc.adEnrichedCount += 1;
          acc.adDisplayedCount += 1;
        } else {
          acc.ncEnrichedCount += 1;
          acc.ncDisplayedCount += 1;
        }
        return acc;
      },
      {
        significantCount: 0,
        adEnrichedCount: 0,
        ncEnrichedCount: 0,
        displayedCount: 0,
        adDisplayedCount: 0,
        ncDisplayedCount: 0,
      }
    );

    return { ...fallback, ...(data?.summary || {}) };
  }, [data?.summary, items]);

  const option = useMemo(() => {
    if (!items.length) return null;

    const chartItems = items.map(item => ({
      ...item,
      koId: item.koId || item.koName || '',
      koName: item.koName || item.koId || '',
      enrichedGroup: item.enrichedGroup === 'NC' ? 'NC' : 'AD',
      ldaScore: Number(item.ldaScore || 0),
      pValue: Number(item.pValue || 1),
      log2FC: Number(item.log2FC || 0),
      meanAD: Number(item.meanAD || 0),
      meanNC: Number(item.meanNC || 0),
    }));
    const maxAbsScore = Math.max(...chartItems.map(item => Math.abs(item.ldaScore)), 1);
    const axisLimit = Number((maxAbsScore * 1.12).toFixed(2));

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        extraCssText: 'border-radius:8px; padding:10px 14px;',
        formatter(params) {
          const point = params.data || {};
          const ldaScore = Number(point.ldaScore ?? Math.abs(point.value || 0));
          return `
            <b>${point.koName || point.koId || ''}</b><br/>
            富集组: ${point.groupLabel || ''}<br/>
            LDA 值: ${formatNumber(ldaScore)}<br/>
            p 值: ${formatNumber(point.pValue)}<br/>
            log2FC: ${formatNumber(point.log2FC)}<br/>
            AD 均值: ${compactNumber(point.meanAD)}<br/>
            NC 均值: ${compactNumber(point.meanNC)}
          `;
        },
      },
      grid: {
        top: 24,
        left: 92,
        right: 48,
        bottom: 40,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'NC 富集 ← LDA score → AD 富集',
        nameLocation: 'middle',
        nameGap: 28,
        min: -axisLimit,
        max: axisLimit,
        axisLabel: {
          color: '#64748b',
          formatter(value) {
            return formatNumber(Math.abs(value), 1);
          },
        },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: chartItems.map(item => item.koId),
        inverse: true,
        axisLabel: {
          color: '#334155',
          fontSize: 11,
          fontWeight: 600,
        },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      series: [
        {
          name: 'LDA score',
          type: 'bar',
          barMaxWidth: 18,
          data: chartItems.map(item => ({
            value: item.enrichedGroup === 'NC' ? -item.ldaScore : item.ldaScore,
            ldaScore: item.ldaScore,
            koId: item.koId,
            koName: item.koName,
            enrichedGroup: item.enrichedGroup,
            groupLabel: `${item.enrichedGroup} 富集`,
            pValue: item.pValue,
            log2FC: item.log2FC,
            meanAD: item.meanAD,
            meanNC: item.meanNC,
            itemStyle: {
              color: GROUP_COLORS[item.enrichedGroup],
              borderRadius: item.enrichedGroup === 'NC' ? [5, 0, 0, 5] : [0, 5, 5, 0],
            },
            label: {
              position: item.enrichedGroup === 'NC' ? 'left' : 'right',
            },
          })),
          label: {
            show: true,
            position: 'right',
            color: '#334155',
            fontSize: 10,
            formatter(params) {
              const point = params.data || {};
              return formatNumber(point.ldaScore ?? Math.abs(params.value), 2);
            },
          },
        },
      ],
    };
  }, [items]);

  if (!option) {
    return <div className="placeholder"><p>暂无 KO LDA 差异分析数据</p></div>;
  }

  return (
    <section style={{
      height: '100%',
      minHeight: 560,
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: 16,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        padding: '10px 14px',
        borderRadius: 10,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        color: '#475569',
        fontSize: 12,
      }}>
        <span><b style={{ color: '#0f172a' }}>P &lt; </b>{filter.pValueMax ?? 0.05}</span>
        <span><b style={{ color: '#0f172a' }}>显著 KO: </b>{summary.significantCount}</span>
        <span><b style={{ color: GROUP_COLORS.AD }}>AD 富集: </b>{summary.adEnrichedCount}</span>
        <span><b style={{ color: GROUP_COLORS.NC }}>NC 富集: </b>{summary.ncEnrichedCount}</span>
        <span><b style={{ color: '#0f172a' }}>展示 AD Top {summary.adDisplayedCount} + NC Top {summary.ncDisplayedCount}</b></span>
        <span><b style={{ color: '#0f172a' }}>LEfSe 风格 LDA</b></span>
      </div>
      <div style={{ color: '#64748b', fontSize: 12 }}>
        横向柱表示显著差异 KO 的 LDA 效应强度，NC 富集向左，AD 富集向右。
      </div>
      <div style={{ flex: 1, minHeight: 460 }}>
        <ReactECharts option={option} style={{ width: '100%', height: Math.max(460, items.length * 26 + 120) }} />
      </div>
    </section>
  );
}

export default KoLdaBarChart;
