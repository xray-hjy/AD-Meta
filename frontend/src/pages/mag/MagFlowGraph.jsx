import { useEffect, useRef, useState } from 'react';
import { MAG_MAIN_STAGES, MAG_BRANCH_STAGES, MAG_FLOW_STAGES, MAG_OVERVIEW_COPY as COPY } from './magOverviewContent';

// Pixel coordinates keep the arrowheads independent of stroke width and SVG markers.
function roundedPath(points) {
  let path = `M${points[0].join(',')}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], [px, py] = points[i - 1], [nx, ny] = points[i + 1];
    const before = Math.hypot(x - px, y - py), after = Math.hypot(nx - x, ny - y);
    if (!before || !after) continue;
    const radius = Math.min(5, before / 2, after / 2);
    path += ` L${x + (px - x) / before * radius},${y + (py - y) / before * radius} Q${x},${y} ${x + (nx - x) / after * radius},${y + (ny - y) / after * radius}`;
  }
  return path + ` L${points.at(-1).join(',')}`;
}

function arrowPath(points) {
  const [x, y] = points.at(-1), [px, py] = points.at(-2);
  const angle = Math.atan2(y - py, x - px), dx = Math.cos(angle), dy = Math.sin(angle);
  return `M${x - dx * 5 - dy * 3},${y - dy * 5 + dx * 3} L${x},${y} L${x - dx * 5 + dy * 3},${y - dy * 5 - dx * 3}`;
}

function layoutConnections(boxes, width) {
  const paths = [];
  const add = (from, to, kind, points, arrow = true) => paths.push({ from, to, kind, d: roundedPath(points), head: arrow ? arrowPath(points) : null });
  const horizontal = (from, to) => {
    const a = boxes[from], b = boxes[to];
    add(from, to, 'main', [[a.right + 3, a.cy], [b.left - 5, b.cy]]);
  };
  MAG_MAIN_STAGES.slice(1).forEach((id, i) => horizontal(MAG_MAIN_STAGES[i], id));
  horizontal('taxonomy', 'phylogeny');

  const drep = boxes.drep;
  const outputs = MAG_FLOW_STAGES.find(stage => stage.id === 'drep').next;
  const rail = boxes.abundance.top - 14;
  const left = Math.min(...outputs.map(id => boxes[id].cx));
  add('drep', 'drep', 'output', [[drep.cx, drep.bottom + 2], [drep.cx, rail], [left, rail]], false);
  outputs.forEach(id => {
    const b = boxes[id];
    add('drep', id, 'output', [[b.cx, rail], [b.cx, b.top - 5]]);
  });

  const clean = boxes.clean, assembly = boxes.assembly, abundance = boxes.abundance;
  const sourceRail = Math.max(...MAG_MAIN_STAGES.map(id => boxes[id].bottom)) + 8;
  add('clean', 'abundance', 'secondary', [[clean.cx, clean.bottom + 2], [clean.cx, sourceRail], [12, sourceRail], [12, abundance.cy], [abundance.left - 5, abundance.cy]]);
  const species = boxes.species, ko = boxes.ko;
  add('clean', 'species', 'secondary', [[clean.cx, clean.bottom + 2], [clean.cx, sourceRail], [12, sourceRail], [12, species.top - 24], [species.cx, species.top - 24], [species.cx, species.top - 14]], false);
  add('clean', 'ko', 'secondary', [[clean.cx, clean.bottom + 2], [clean.cx, sourceRail], [12, sourceRail], [12, ko.top - 24], [ko.cx, ko.top - 24], [ko.cx, ko.top - 14]], false);
  add('assembly', 'ko', 'secondary', [[assembly.cx, assembly.bottom + 2], [assembly.cx, sourceRail + 6], [width - 12, sourceRail + 6], [width - 12, ko.top - 14], [ko.cx, ko.top - 14]], false);
  // Finish each community input with one solid stem; dashed tails can leave
  // isolated arrowheads, and both KO inputs must meet before entering its card.
  for (const id of ['species', 'ko']) {
    const b = boxes[id];
    add(id, id, 'input', [[b.cx, b.top - 14], [b.cx, b.top - 1]]);
  }
  return paths;
}

export function relatedStageIds(stages, id) {
  if (!id) return new Set();
  const related = new Set([id]);
  const walk = (key, direction) => {
    const next = direction === 'next' ? stages.find(s => s.id === key)?.next || [] : stages.filter(s => s.next.includes(key)).map(s => s.id);
    next.forEach(n => { if (!related.has(n)) { related.add(n); walk(n, direction); } });
  };
  walk(id, 'next'); walk(id, 'previous');
  return related;
}

export default function MagFlowGraph({ stages, selected, onSelect, detailId }) {
  const canvas = useRef(null);
  const [geometry, setGeometry] = useState({ width: 1, height: 1, paths: [] });
  const [hovered, setHovered] = useState(null);
  const focused = hovered || selected;
  const related = relatedStageIds(stages, focused);
  useEffect(() => {
    const element = canvas.current;
    let frame, disposed = false;
    const measure = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = element.getBoundingClientRect();
        const boxes = Object.fromEntries([...element.querySelectorAll('button[data-flow-node]')].map(node => {
          const r = node.getBoundingClientRect();
          const left = r.left - root.left, top = r.top - root.top;
          return [node.dataset.flowNode, { left, top, right: left + r.width, bottom: top + r.height, width: r.width, cx: left + r.width / 2, cy: top + r.height / 2 }];
        }));
        setGeometry({ width: root.width, height: root.height, paths: layoutConnections(boxes, root.width) });
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    element.querySelectorAll('[data-flow-node]').forEach(node => observer?.observe(node));
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    measure();
    return () => { disposed = true; observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', measure); };
  }, []);
  const node = (id, compact = false, index) => {
    const stage = stages.find(s => s.id === id);
    return <button type="button" key={id} data-flow-node={id}
      className={`mag-flow-node ${compact ? 'mag-flow-node--small' : ''} ${selected === id ? 'is-selected' : ''} ${focused && !related.has(id) ? 'is-muted' : ''}`}
      aria-expanded={selected === id} aria-controls={detailId}
      onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(id)} onBlur={() => setHovered(null)}
      onClick={() => onSelect(id)}>
      <span className="mag-flow-node__heading">{index != null && <span className="mag-flow-node__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}<span className="mag-flow-node__label">{stage.label}</span></span>
      {!compact && <span className="mag-flow-node__summary"><strong className={stage.value ? 'mag-flow-node__value' : 'mag-flow-node__method'}>{stage.value || stage.short}</strong>{stage.value && <span className="mag-flow-node__caption">{stage.caption}</span>}</span>}
      {compact && !stage.tools.includes(stage.short) && <span className="mag-flow-node__caption">{stage.short}</span>}
      {stage.tools.length > 0 && <span className="mag-flow-node__tools">{stage.tools.map(tool => <span key={tool}>{tool}</span>)}</span>}
    </button>;
  };
  return <div className="mag-flow-viewport" role="group" aria-label={COPY.mainLabel} tabIndex={0}
    onKeyDown={event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key) || !event.target.matches('button[data-flow-node]')) return;
      const nodes = [...event.currentTarget.querySelectorAll('button[data-flow-node]')];
      const i = nodes.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : Math.max(0, Math.min(nodes.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)));
      event.preventDefault(); nodes[next]?.focus(); nodes[next]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }}>
    <div className="mag-flow-canvas" ref={canvas}>
      <svg className="mag-flow-wires" aria-hidden="true" viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
        {geometry.paths.map(path => <g key={`${path.from}-${path.to}`}
          className={`mag-flow-wire ${path.kind === 'secondary' ? 'is-secondary' : ''} ${focused && related.has(path.from) && related.has(path.to) ? 'is-active' : ''}`}>
          <path d={path.d} />{path.head && <path className="mag-flow-wire__arrow" d={path.head} />}
        </g>)}
      </svg>
      <div className="mag-flow-main"><div className="mag-flow-main__caption"><span>01</span>{COPY.upstream}</div>{MAG_MAIN_STAGES.map((id, index) => node(id, false, index))}</div>
      <div className="mag-flow-outputs"><div className="mag-flow-outputs__caption"><span>02</span>{COPY.downstream}</div><div className="mag-flow-branches">
        {MAG_BRANCH_STAGES.map(id => node(id, true))}
      </div></div>
      <div className="mag-flow-community"><span className="mag-flow-community__label">{COPY.community}</span>{node('species', true)}{node('ko', true)}<span className="mag-flow-community__hint">{COPY.communityHint}</span></div>
    </div>
  </div>;
}
