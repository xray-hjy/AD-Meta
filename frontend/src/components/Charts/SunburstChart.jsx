import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';

const TRANSITION_DURATION_MS = 1000;
const SUNBURST_COLORS = [
  '#3B82F6',
  '#06B6D4',
  '#22C55E',
  '#FACC15',
  '#FB923C',
  '#F43F5E',
  '#A78BFA',
  '#14B8A6',
  '#F472B6',
  '#84CC16',
];

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

function sunburstLabel(params) {
  const depth = Math.max((params.treePathInfo?.length || 1) - 1, 0);
  const ratio = Number(params.data?.ratio ?? 1);
  const name = params.name || '';

  if (name.startsWith('Other ')) return ratio >= 0.14 ? name : '';
  if (depth <= 1) return ratio >= 0.08 ? name : '';
  if (depth === 2) return ratio >= 0.12 ? name : '';
  if (depth === 3) return ratio >= 0.18 ? name : '';
  return '';
}

function SunburstChart({ data, title, featureKind = 'taxonomy' }) {
  const [viewMode, setViewMode] = useState('sunburst');
  const [transitionEnabled, setTransitionEnabled] = useState(false);

  useEffect(() => {
    if (!transitionEnabled) return undefined;

    const timer = window.setTimeout(() => {
      setTransitionEnabled(false);
    }, TRANSITION_DURATION_MS + 120);

    return () => window.clearTimeout(timer);
  }, [transitionEnabled]);

  const option = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return null;

    const isKo = featureKind === 'ko';
    const baseOption = {
      backgroundColor: 'transparent',
      color: SUNBURST_COLORS,
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
          const chain = (params.treePathInfo || [])
            .map(node => node.name)
            .filter(Boolean)
            .join(' > ');
          const ratio = formatPercent(payload.ratio);
          const mergedCount = Number(payload.mergedCount || 0);
          return `
            <b>${params.name}</b><br/>
            ${chain ? `${chain}<br/>` : ''}
            丰度: ${formatValue(params.value)}
            ${ratio ? `<br/>占父级: ${ratio}` : ''}
            ${mergedCount ? `<br/>合并小分类: ${mergedCount}` : ''}
          `;
        },
        backgroundColor: 'rgba(15,23,42,0.96)',
        borderColor: 'transparent',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        extraCssText: 'border-radius:10px; padding:10px 12px; pointer-events:none;',
      },
    };

    if (viewMode === 'treemap') {
      return {
        ...baseOption,
        series: [
          {
            type: 'treemap',
            id: 'taxonomy-composition',
            animationDurationUpdate: TRANSITION_DURATION_MS,
            roam: false,
            nodeClick: undefined,
            top: 86,
            left: 18,
            right: 18,
            bottom: 18,
            data,
            universalTransition: transitionEnabled,
            breadcrumb: {
              show: false,
            },
            label: {
              show: true,
              color: '#1e293b',
              fontSize: 11,
              overflow: 'truncate',
            },
            itemStyle: {
              borderWidth: 0.35,
              borderColor: 'rgba(255,255,255,.45)',
              gapWidth: 0.5,
            },
            upperLabel: {
              show: false,
            },
          },
        ],
      };
    }

    return {
      ...baseOption,
      series: [
        {
          type: 'sunburst',
          id: 'taxonomy-composition',
          data,
          animationDurationUpdate: TRANSITION_DURATION_MS,
          center: ['50%', '54%'],
          radius: [60, '90%'],
          sort: undefined,
          nodeClick: 'rootToNode',
          universalTransition: transitionEnabled,
          emphasis: { focus: 'ancestor' },
          itemStyle: {
            borderRadius: 7,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            color: '#1e293b',
            fontSize: 11,
            overflow: 'truncate',
            formatter: sunburstLabel,
          },
          labelLayout: {
            hideOverlap: true,
          },
        },
      ],
    };
  }, [data, title, featureKind, viewMode, transitionEnabled]);

  if (!option) {
    return <div className="placeholder"><p>暂无旭日图数据</p></div>;
  }

  return (
    <section style={{ position: 'relative', height: '100%', minHeight: 560, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <button
        type="button"
        onClick={() => {
          setTransitionEnabled(true);
          setViewMode(mode => (mode === 'sunburst' ? 'treemap' : 'sunburst'));
        }}
        style={{
          position: 'absolute',
          top: 16,
          right: 18,
          zIndex: 2,
          border: '1px solid #cbd5e1',
          borderRadius: 999,
          background: '#ffffff',
          color: '#0f172a',
          fontSize: 12,
          fontWeight: 700,
          padding: '7px 13px',
          cursor: 'pointer',
          boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
        }}
      >
        切换
      </button>
      <ReactECharts option={option} style={{ width: '100%', height: '100%' }} />
    </section>
  );
}

export default SunburstChart;
