import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

const MARGIN = { top: 10, right: 40, bottom: 30, left: 100 };
const AD_COLOR = '#e74c3c';
const NC_COLOR = '#2ecc71';
const BAR_HEIGHT = 22;
const GAP = 6;

function PhylumChart({ data }) {
  const svgRef = useRef();

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
    return <div className="placeholder"><p>暂无门级组成数据</p></div>;
  }

  return (
    <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />
  );
}

export default PhylumChart;
