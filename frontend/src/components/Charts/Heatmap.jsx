import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import useTooltip from '../../hooks/useTooltip';

const ABUNDANCE_COLORS = ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'];
const DIFF_COLORS = ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'];

/* ====== 工具函数 ====== */

function formatTaxonomy(fullName) {
  // 将 k__Bacteria|p__Firmicutes|... 格式化为可读多行
  return String(fullName).split('|').map(s => s.replace(/^([a-z])__/, (_, p) => p + ': ')).join('\n');
}

function formatP(p) {
  if (!Number.isFinite(p)) return 'NA';
  if (p < 0.001) return p.toExponential(2);
  return p.toFixed(3);
}

function fmt(n, d) {
  if (!Number.isFinite(n)) return 'NA';
  return n.toFixed(d);
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
}

function svgToDataUrl(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

/* ====== 布局参数 ====== */

const COMPACT = { cellW: 14, left: 60, top: 44, right: 44, bottom: 28, colFont: 6, rowFont: 7, labelStep: 1 };
const NORMAL  = { cellW: 26, left: 105, top: 56, right: 56, bottom: 36, colFont: 8, rowFont: 9, labelStep: 1 };

function cellHeight(rows) {
  if (rows <= 1) return 24;
  if (rows > 80) return 4;
  if (rows > 50) return 6;
  if (rows > 25) return 8;
  return 10;
}

/* ====== D3 渲染子组件 ====== */

function HeatmapCanvas({ title, matrix, rowLabels, colLabels, stats, mode, maxV, maxAbs, compact, fixedRows }) {
  const svgRef = useRef();
  const { Tooltip, show, move, hide } = useTooltip();
  const [exporting, setExporting] = useState(false);
  const L = compact ? COMPACT : NORMAL;
  const rows = matrix.length;
  const cols = colLabels.length;
  // 统一单元格尺寸：AD/NC 取较大行数计算 cellHeight，保证两图列宽对齐
  const layoutRows = fixedRows ? Math.max(rows, fixedRows) : rows;
  const ch = compact ? cellHeight(layoutRows) : cellHeight(rows);
  // 网格只画实际数据行数，viewBox 高度统一用 layoutRows，保证两图 SVG 尺寸一致
  const gridW = cols * L.cellW;
  const gridH = rows * ch;
  const totalW = L.left + gridW + L.right;
  const totalH = L.top + layoutRows * ch + L.bottom;
  const labelEvery = Math.max(1, Math.ceil(rows / (compact ? 18 : 28)));

  const handleExport = async () => {
    if (!svgRef.current || exporting) return;

    setExporting(true);
    try {
      const svgNode = svgRef.current;
      const clonedSvg = svgNode.cloneNode(true);
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

      const serializer = new XMLSerializer();
      const svgText = serializer.serializeToString(clonedSvg);
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = svgToDataUrl(svgText);
      });

      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = totalW * scale;
      canvas.height = totalH * scale;

      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalW, totalH);
      ctx.drawImage(img, 0, 0, totalW, totalH);

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${sanitizeFilename(title)}.png`;
      link.click();
    } catch (error) {
      console.error('Export heatmap failed:', error);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${totalW} ${totalH}`);

    const g = svg.append('g').attr('transform', `translate(${L.left},${L.top})`);

    // 色阶
    const colorScale = mode === 'diff'
      ? d3.scaleSequential(d3.interpolateRdBu).domain([maxAbs, -maxAbs])
      : d3.scaleSequential(d3.interpolateYlOrRd).domain([0.15, maxV || 1]);

    // 单元格
    g.selectAll('rect')
      .data(matrix.flatMap((row, i) => row.map((v, j) => ({ i, j, v }))))
      .join('rect')
      .attr('x', d => d.j * L.cellW)
      .attr('y', d => d.i * ch)
      .attr('width', L.cellW)
      .attr('height', ch)
      .attr('fill', d => d.v > 0 || mode === 'diff' ? colorScale(d.v) : '#ffffe0')
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.4)
      .on('mouseenter', (event, d) => {
        const stat = stats[d.j];
        const tax = formatTaxonomy(stat.fullName);
        const lines = [tax, `p = ${formatP(stat.p)}`, `log2FC = ${fmt(stat.log2FC, 3)}`];
        if (mode === 'diff') lines.push(`AD−NC = ${fmt(d.v, 4)}`);
        else lines.push(`样本: ${rowLabels[d.i]}`, `log10(丰度+1) = ${fmt(d.v, 4)}`);
        show(lines.join('<br/>'));
        move(event);
      })
      .on('mousemove', event => { move(event); })
      .on('mouseleave', () => { hide(); });

    // 行标签：按步长间隔显示，末行仅在间隔≥2时额外显示（避免与前一个标签重叠）
    rowLabels.forEach((label, i) => {
      if (rows > 1 && i % labelEvery !== 0) {
        const isLast = i === rows - 1;
        if (!isLast || (i % labelEvery) < 2) return;
      }
      g.append('text')
        .attr('x', -6).attr('y', i * ch + ch / 2 + 3)
        .attr('text-anchor', 'end')
        .attr('fill', '#64748b')
        .attr('font-size', L.rowFont)
        .text(label);
    });

    // 列标签：只在非重叠位置显示，其余用刻度线标记
    colLabels.forEach((label, j) => {
      const cx = j * L.cellW + L.cellW / 2;
      const stat = stats[j];
      // 每个列顶部画一条短刻度线
      g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', -2).attr('y2', 1)
        .attr('stroke', '#94a3b8').attr('stroke-width', 0.5);
      g.append('text')
        .attr('x', cx)
        .attr('y', -5)
        .attr('transform', `rotate(-65, ${cx}, -5)`)
        .attr('text-anchor', 'start')
        .attr('fill', '#334155')
        .attr('font-size', L.colFont)
        .style('cursor', 'default')
        .text(label)
        .on('mouseenter', (event) => {
          show(`${formatTaxonomy(stat.fullName)}<br/>p = ${formatP(stat.p)}<br/>log2FC = ${fmt(stat.log2FC, 3)}`);
          move(event);
        })
        .on('mousemove', event => { move(event); })
        .on('mouseleave', () => { hide(); });
    });

    // 列标签底部横线
    g.append('line')
      .attr('x1', 0).attr('x2', gridW).attr('y1', 0).attr('y2', 0)
      .attr('stroke', '#cbd5e1').attr('stroke-width', 0.8);

    // 左侧竖线
    g.append('line')
      .attr('x1', -1).attr('x2', -1).attr('y1', 0).attr('y2', gridH)
      .attr('stroke', '#cbd5e1').attr('stroke-width', 0.8);

    // 图例
    const legX = gridW + 10;
    const legH = Math.min(140, gridH);
    const legW = 10;
    const legG = svg.append('g').attr('transform', `translate(${L.left + legX},${L.top})`);

    const stops = mode === 'diff' ? DIFF_COLORS : ABUNDANCE_COLORS;
    const nStops = stops.length;
    for (let i = 0; i < nStops; i++) {
      legG.append('rect')
        .attr('x', 0).attr('y', (legH / nStops) * (nStops - 1 - i))
        .attr('width', legW).attr('height', legH / nStops)
        .attr('fill', stops[i]);
    }

    const tickCount = 4;
    for (let i = 0; i <= tickCount; i++) {
      const t = i / tickCount;
      const val = mode === 'diff' ? maxAbs * (1 - 2 * t) : maxV * (1 - t);
      const y = t * legH;
      legG.append('line').attr('x1', legW).attr('x2', legW + 4).attr('y1', y).attr('y2', y).attr('stroke', '#94a3b8').attr('stroke-width', 0.6);
      legG.append('text').attr('x', legW + 6).attr('y', y + 3).attr('fill', '#94a3b8').attr('font-size', 7)
        .text(val >= 1000 ? (val / 1000).toFixed(1) + 'k' : fmt(val, 1));
    }

    if (mode === 'diff') {
      legG.append('text').attr('x', legW / 2).attr('y', -4).attr('text-anchor', 'middle').attr('fill', '#b2182b').attr('font-size', 7).text('AD↑');
      legG.append('text').attr('x', legW / 2).attr('y', legH + 12).attr('text-anchor', 'middle').attr('fill', '#2166ac').attr('font-size', 7).text('NC↓');
    }

  }, [matrix, rowLabels, colLabels, stats, mode, maxV, maxAbs, compact, fixedRows, totalW, totalH, L, ch, gridW, gridH, labelEvery, rows, show, move, hide]);

  return (
    <section style={{
      padding: compact ? 12 : 16,
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      background: '#fff',
      minWidth: 0,
      boxSizing: 'border-box',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 2,
      }}>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 600, color: '#0f172a' }}>{title}</div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: compact ? '4px 8px' : '5px 10px',
            borderRadius: 8,
            border: '1px solid #d5dde7',
            background: exporting ? '#f8fafc' : '#fff',
            color: '#475569',
            fontSize: compact ? 10 : 11,
            fontFamily: 'inherit',
            cursor: exporting ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {exporting ? '导出中...' : '导出图片'}
        </button>
      </div>
      <div style={{ fontSize: compact ? 10 : 11, color: '#94a3b8', marginBottom: 6 }}>
        {mode === 'diff' ? '红色=AD高 蓝色=NC高' : '颜色越深 log丰度越高'}
      </div>
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg ref={svgRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
        <Tooltip />
      </div>
    </section>
  );
}

/* ====== 主组件 ====== */

function Heatmap({ data }) {
  const result = data;

  if (!result) return <div className="placeholder"><p>暂无数据</p></div>;
  if (result.error) return <div className="placeholder"><p>{result.error}</p></div>;

  const stats = Array.isArray(result?.stats) ? result.stats : null;
  const adMatrix = Array.isArray(result?.adMatrix) ? result.adMatrix : null;
  const ncMatrix = Array.isArray(result?.ncMatrix) ? result.ncMatrix : null;
  const diffMatrix = Array.isArray(result?.diffMatrix) ? result.diffMatrix : null;
  const adLabels = Array.isArray(result?.adLabels) ? result.adLabels : null;
  const ncLabels = Array.isArray(result?.ncLabels) ? result.ncLabels : null;
  const colLabels = Array.isArray(result?.colLabels) ? result.colLabels : null;
  const diffLabels = Array.isArray(result?.diffLabels) ? result.diffLabels : ['AD - NC'];

  if (!stats || !adMatrix || !ncMatrix || !diffMatrix || !adLabels || !ncLabels || !colLabels) {
    return (
      <div className="placeholder placeholder--error">
        <span className="placeholder-icon">&#9888;</span>
        <p>热图数据结构不完整</p>
        <small>请确认当前图表接口返回的是 heatmap 缓存 JSON。</small>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', color: '#0f172a' }}>
      {/* 筛选信息 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 14,
        padding: '8px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0',
        fontSize: 12, color: '#475569',
      }}>
        <span><b style={{ color: '#0f172a' }}>筛选：</b>Wilcoxon p&lt;0.05, |log₂FC|&gt;1</span>
        <span><b style={{ color: '#0f172a' }}>差异物种：</b>{stats.length}</span>
        <span style={{ color: '#c0392b' }}><b>AD：</b>{adLabels.length} 样本</span>
        <span style={{ color: '#27ae60' }}><b>NC：</b>{ncLabels.length} 样本</span>
      </div>

      {/* AD + NC 并排 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 16,
        marginBottom: 20,
        alignItems: 'start',
      }}>
        <HeatmapCanvas
          title="AD 组丰度热图"
          matrix={adMatrix}
          rowLabels={adLabels}
          colLabels={colLabels}
          stats={stats}
          mode="abundance"
          maxV={result.maxV}
          maxAbs={result.maxAbs}
          compact
          fixedRows={result.pairedRows}
        />
        <HeatmapCanvas
          title="NC 组丰度热图"
          matrix={ncMatrix}
          rowLabels={ncLabels}
          colLabels={colLabels}
          stats={stats}
          mode="abundance"
          maxV={result.maxV}
          maxAbs={result.maxAbs}
          compact
          fixedRows={result.pairedRows}
        />
      </div>

      {/* 差异热图 */}
      <HeatmapCanvas
        title="差异热图 (AD − NC 平均 log 丰度)"
        matrix={diffMatrix}
        rowLabels={diffLabels}
        colLabels={colLabels}
        stats={stats}
        mode="diff"
        maxV={result.maxV}
        maxAbs={result.maxAbs}
      />
    </div>
  );
}

export default Heatmap;
