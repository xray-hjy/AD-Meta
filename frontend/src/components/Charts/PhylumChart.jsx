import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

const MARGIN = { top: 10, right: 40, bottom: 30, left: 100 };
const AD_COLOR = '#e74c3c';
const NC_COLOR = '#2ecc71';
const BAR_HEIGHT = 22;
const GAP = 6;

function formatPercent(value) {
  const number = Number(value) || 0;
  return `${(number * 100).toFixed(1)}%`;
}

function formatPointGap(value) {
  const number = Math.abs(Number(value) || 0);
  return `${(number * 100).toFixed(1)} pp`;
}

function topBy(data, key) {
  return data.reduce((best, item) => {
    if (!best) return item;
    return Number(item[key] || 0) > Number(best[key] || 0) ? item : best;
  }, null);
}

function buildSummaryCards(data, isKo) {
  const adTop = topBy(data, 'adRatio');
  const ncTop = topBy(data, 'ncRatio');
  const gapTop = data.reduce((best, item) => {
    const gap = Math.abs(Number(item.adRatio || 0) - Number(item.ncRatio || 0));
    if (!best || gap > best.gap) {
      return { ...item, gap };
    }
    return best;
  }, null);
  const gapDirection = Number(gapTop?.adRatio || 0) >= Number(gapTop?.ncRatio || 0) ? 'AD 高' : 'NC 高';
  const itemLabel = isKo ? 'KO' : '门';

  return [
    {
      label: '展示项数',
      value: `${data.length} 项`,
      hint: isKo ? 'Top KO 功能' : 'Top 门类组成',
      tone: '#2563eb',
    },
    {
      label: 'AD 最高',
      value: adTop?.phylum || 'NA',
      hint: `${formatPercent(adTop?.adRatio)} · ${itemLabel}`,
      tone: AD_COLOR,
    },
    {
      label: 'NC 最高',
      value: ncTop?.phylum || 'NA',
      hint: `${formatPercent(ncTop?.ncRatio)} · ${itemLabel}`,
      tone: NC_COLOR,
    },
    {
      label: '最大组间差异',
      value: gapTop?.phylum || 'NA',
      hint: `${gapDirection} ${formatPointGap(gapTop?.gap)}`,
      tone: '#f97316',
    },
  ];
}

function PhylumChart({ data, featureKind = 'taxonomy', featureLabel = '物种' }) {
  const svgRef = useRef();
  const isKo = featureKind === 'ko';
  const title = isKo ? 'KO 功能组成概览' : '门级组成概览';
  const cards = data && data.length ? buildSummaryCards(data, isKo) : [];

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 760;
    const rows = data.length;
    const height = MARGIN.top + rows * (BAR_HEIGHT * 2 + GAP) + MARGIN.bottom + 20;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const x = d3.scaleLinear()
      .domain([0, 1])
      .range([MARGIN.left, width - MARGIN.right]);

    const g = svg.append('g');

    // Grid
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisBottom(x).ticks(5).tickSize(-(height - MARGIN.top - MARGIN.bottom)).tickFormat(''))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '3,3'));

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height - MARGIN.bottom + 8})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('.0%')))
      .call(g => g.select('.domain').attr('stroke', '#cbd5e1'))
      .call(g => g.selectAll('.tick text').attr('fill', '#94a3b8').attr('font-size', 11));

    // Y labels
    g.append('g')
      .attr('transform', `translate(${MARGIN.left - 8},0)`)
      .selectAll('text')
      .data(data)
      .join('text')
      .attr('y', (_, i) => MARGIN.top + i * (BAR_HEIGHT * 2 + GAP) + BAR_HEIGHT + 4)
      .attr('text-anchor', 'end')
      .attr('fill', '#475569')
      .attr('font-size', 12)
      .attr('font-family', 'inherit')
      .text(d => d.phylum);

    // Bars — AD
    g.selectAll('.pbar-ad')
      .data(data)
      .join('rect')
      .attr('class', 'pbar-ad')
      .attr('x', x(0))
      .attr('y', (_, i) => MARGIN.top + i * (BAR_HEIGHT * 2 + GAP))
      .attr('width', d => x(d.adRatio) - x(0))
      .attr('height', BAR_HEIGHT)
      .attr('fill', AD_COLOR)
      .attr('rx', 2);

    // Bars — NC
    g.selectAll('.pbar-nc')
      .data(data)
      .join('rect')
      .attr('class', 'pbar-nc')
      .attr('x', x(0))
      .attr('y', (_, i) => MARGIN.top + i * (BAR_HEIGHT * 2 + GAP) + BAR_HEIGHT)
      .attr('width', d => x(d.ncRatio) - x(0))
      .attr('height', BAR_HEIGHT)
      .attr('fill', NC_COLOR)
      .attr('rx', 2);

    // Value labels at right end of bars
    g.selectAll('.val-ad')
      .data(data)
      .join('text')
      .attr('x', d => x(d.adRatio) + 4)
      .attr('y', (_, i) => MARGIN.top + i * (BAR_HEIGHT * 2 + GAP) + BAR_HEIGHT - 6)
      .attr('text-anchor', 'start')
      .attr('fill', '#1e40af')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .text(d => (d.adRatio * 100).toFixed(1) + '%');

    g.selectAll('.val-nc')
      .data(data)
      .join('text')
      .attr('x', d => x(d.ncRatio) + 4)
      .attr('y', (_, i) => MARGIN.top + i * (BAR_HEIGHT * 2 + GAP) + BAR_HEIGHT * 2 - 6)
      .attr('text-anchor', 'start')
      .attr('fill', '#1e40af')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .text(d => (d.ncRatio * 100).toFixed(1) + '%');

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 100}, ${MARGIN.top})`);

    [
      { label: 'AD 组', color: AD_COLOR },
      { label: 'NC 组', color: NC_COLOR },
    ].forEach((item, i) => {
      const lg = legend.append('g').attr('transform', `translate(0, ${i * 22})`);
      lg.append('rect')
        .attr('width', 12).attr('height', 12)
        .attr('rx', 2).attr('fill', item.color);
      lg.append('text')
        .attr('x', 18).attr('y', 10)
        .attr('fill', '#475569').attr('font-size', 12)
        .text(item.label);
    });

  }, [data]);

  if (!data || data.length === 0) {
    return <div className="placeholder"><p>{isKo ? '暂无 KO 功能组成数据' : '暂无门级组成数据'}</p></div>;
  }

  return (
    <section style={{
      padding: '14px 16px',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      background: '#fff',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            基于 AD/NC 平均丰度占比 · {isKo ? `展示 ${featureLabel} 功能项` : '按门水平汇总'}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
        marginBottom: 14,
      }}>
        {cards.map(card => (
          <div
            key={card.label}
            style={{
              position: 'relative',
              overflow: 'hidden',
              padding: '10px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              background: '#f8fafc',
              minHeight: 72,
            }}
          >
            <div style={{
              position: 'absolute',
              inset: '0 auto 0 0',
              width: 4,
              background: card.tone,
            }} />
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>{card.label}</div>
            <div style={{
              fontSize: 16,
              lineHeight: 1.2,
              fontWeight: 800,
              color: '#0f172a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }} title={card.value}>
              {card.value}
            </div>
            <div style={{ fontSize: 11, color: card.tone, marginTop: 5, fontWeight: 700 }}>{card.hint}</div>
          </div>
        ))}
      </div>

      <svg ref={svgRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
    </section>
  );
}

export default PhylumChart;
