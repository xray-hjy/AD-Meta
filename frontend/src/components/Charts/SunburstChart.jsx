import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

function formatValue(value) {
  const v = Number(value) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function formatPercent(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return null;
  return `${(ratio * 100).toFixed(ratio < 0.01 ? 2 : 1)}%`;
}

function taxonomyLabel(params) {
  const depth = Math.max((params.treePathInfo?.length || 1) - 1, 0);
  const ratio = Number(params.data?.ratio ?? 1);
  const name = params.name || '';

  if (name.startsWith('Other ')) return name;
  if (depth <= 1) return name;
  if (depth === 2 && ratio >= 0.08) return name;
  if (depth === 3 && ratio >= 0.12) return name;
  return '';
}

function SunburstChart({ data, title, featureKind = 'taxonomy' }) {
  const option = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return null;

    const isKo = featureKind === 'ko';

    return {
      backgroundColor: 'transparent',
      title: {
        text: isKo ? 'KO 旭日图' : '分类旭日图',
        subtext: title || (isKo ? 'KO feature composition' : 'Taxonomy composition'),
        left: 20,
        top: 14,
        textStyle: { fontSize: 18, color: '#0f172a', fontWeight: 700 },
        subtextStyle: { fontSize: 12, color: '#64748b' },
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter(params) {
          const payload = params.data || {};
          const chain = params.treePathInfo
            .map(node => node.name)
            .filter(Boolean)
            .join(' > ');
          const ratio = formatPercent(payload.ratio);
          const mergedCount = Number(payload.mergedCount || 0);
          return `
            <b>${params.name}</b><br/>
            ${chain}<br/>
            丰度: ${formatValue(params.value)}
            ${ratio ? `<br/>占父级: ${ratio}` : ''}
            ${mergedCount ? `<br/>合并小分类: ${mergedCount}` : ''}
          `;
        },
        backgroundColor: 'rgba(15,23,42,0.96)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        extraCssText: 'border-radius:10px; padding:10px 12px;',
      },
      series: [
        {
          type: 'sunburst',
          data,
          center: ['50%', '54%'],
          radius: [0, '88%'],
          sort: undefined,
          nodeClick: 'rootToNode',
          emphasis: { focus: 'ancestor' },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 1,
          },
          label: {
            color: '#1e293b',
            fontSize: 11,
            overflow: 'truncate',
            formatter: isKo ? undefined : taxonomyLabel,
          },
          labelLayout: {
            hideOverlap: true,
          },
          levels: [
            {},
            { r0: '12%', r: '34%', label: { rotate: 'tangential' } },
            { r0: '34%', r: '58%', label: { rotate: 'radial' } },
            { r0: '58%', r: '76%', label: { rotate: 'radial', fontSize: 10 } },
            { r0: '76%', r: '88%', label: { show: false } },
          ],
        },
      ],
    };
  }, [data, title, featureKind]);

  if (!option) {
    return <div className="placeholder"><p>暂无旭日图数据</p></div>;
  }

  return (
    <section style={{ height: '100%', minHeight: 560, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <ReactECharts option={option} style={{ width: '100%', height: '100%' }} />
    </section>
  );
}

export default SunburstChart;
