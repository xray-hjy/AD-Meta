import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

function formatValue(value) {
  const v = Number(value) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function SunburstChart({ data, title }) {
  const option = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return null;

    return {
      backgroundColor: 'transparent',
      title: {
        text: '分类旭日图',
        subtext: title || 'Taxonomy composition',
        left: 20,
        top: 14,
        textStyle: { fontSize: 18, color: '#0f172a', fontWeight: 700 },
        subtextStyle: { fontSize: 12, color: '#64748b' },
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter(params) {
          const chain = params.treePathInfo
            .map(node => node.name)
            .filter(Boolean)
            .join(' > ');
          return `
            <b>${params.name}</b><br/>
            ${chain}<br/>
            丰度: ${formatValue(params.value)}
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
  }, [data, title]);

  if (!option) {
    return <div className="placeholder"><p>暂无分类旭日图数据</p></div>;
  }

  return (
    <section style={{ height: '100%', minHeight: 560, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <ReactECharts option={option} style={{ width: '100%', height: '100%' }} />
    </section>
  );
}

export default SunburstChart;
