import { summarize } from './ditingPathwayMath';
export function pathwaySelection(all, selection, focusId, rawPage, pageSize = 6) {
  const byId = new Map(all.map(item => [item.id, item]));
  const ids = selection == null ? [...all].sort((a,b) => b.mean-a.mean).slice(0,15).map(item => item.id) : [...new Set(selection.split(','))].filter(id => byId.has(id));
  const selected = ids.map(id => byId.get(id));
  const pages = Math.max(1,Math.ceil(selected.length/pageSize));
  const page = Math.min(pages-1, Math.max(0,Number(rawPage)||0));
  const focused = selected.find(item => item.id === focusId) || selected[page*pageSize] || null;
  return { selected, focused, page, pages };
}
export function pathwayGroupSummary(item, samples, group) {
  const values = samples.flatMap((sample,index) => sample.group === group ? [item.values[index]] : []);
  const stats = summarize(values);
  return { n: values.length, detected: values.filter(v=>v>0).length, mean: stats.mean, median: stats.median, q1: stats.q1, q3: stats.q3 };
}
export function pathwayCsv(rows) {
  const cell = value => { if (typeof value === 'number') return String(value); const s = String(value ?? ''); return `"${(/^[-=+@\t\r]/.test(s) ? "'" : '')+s.replaceAll('"','""')}"`; };
  return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
