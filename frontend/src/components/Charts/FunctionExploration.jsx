import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { fetchJson } from '../../api/client';
import { exportEChart } from './chartExport';
import CartesianEChart from './CartesianEChart';
import ClientDataTable from '../data-display/ClientDataTable';
import { escapeTooltipText } from '../../utils/tooltipHtml';
import './function-exploration.css';

const EMPTY = [];
const COHORT = { mode: 'cohort', groups: [], sampleCodes: [] };
const fmt = v => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toPrecision(5);
function readScope(value) { try { const result = JSON.parse(value); return result?.mode ? result : COHORT; } catch { return COHORT; } }
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const cell = v => typeof v === 'number' || typeof v === 'boolean' ? String(v) : `"${String(v ?? '').replace(/^[-=+@]/, "'$&").replaceAll('"', '""')}"`;

export default function FunctionExploration({ slug, revision: sourceRevision, projection, pathwayId, fixedCohort = false }) {
  const revision = projection?.datasetRevision || sourceRevision;
  const chartRef = useRef(null), plotHost = useRef(null);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(''), [sort, setSort] = useState('q'), [onlySignificant, setOnlySignificant] = useState(false), [limit, setLimit] = useState(20), [log, setLog] = useState(false);
  // Scope and thresholds travel in the URL across pathway/KO selections.
  const scope = fixedCohort ? COHORT : projection?.scope || readScope(params.get('functionScope'));
  const prevalence = projection?.projection?.parameters?.prevalenceMin ?? Number(params.get('functionPrevalence') || .1);
  const qMax = projection?.projection?.parameters?.qValueMax ?? Number(params.get('functionQ') || .05);
  const request = { scope, prevalenceMin: prevalence };
  const base = `/api/datasets/${encodeURIComponent(slug)}/revisions/${encodeURIComponent(revision)}/diting/exploration`;
  const query = useQuery({ queryKey: ['function-exploration', slug, revision, request], enabled: Boolean(slug && revision), staleTime: Infinity,
    queryFn: ({ signal }) => fetchJson(base, { method: 'POST', body: request, signal, timeoutMs: 60000 }), retry: false });
  const kind = params.get('functionKind') === 'pathway' || (!params.has('functionKind') && pathwayId) ? 'pathway' : 'ko';
  const rows = query.data?.[kind === 'ko' ? 'kos' : 'pathways'] || EMPTY;
  const chosen = rows.find(r => r.id === params.get('functionObject')) || (kind === 'pathway' && rows.find(r => r.id === pathwayId)) || null;
  const choose = (nextKind, id) => setParams(current => {
    const next = new URLSearchParams(current); next.set('functionKind', nextKind); next.set('functionObject', id);
    next.set('functionScope', JSON.stringify(scope)); next.set('functionPrevalence', String(prevalence)); next.set('functionQ', String(qMax)); return next;
  });
  const detail = useQuery({ queryKey: ['function-detail', slug, revision, request, kind, chosen?.id], enabled: Boolean(chosen), staleTime: Infinity,
    queryFn: ({ signal }) => fetchJson(base, { method: 'POST', body: { ...request, kind, feature: chosen.id }, signal, timeoutMs: 60000 }), retry: false });
  const filtered = useMemo(() => rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) && (!onlySignificant || (r.qValue != null && r.qValue < qMax)))
    .sort((a, b) => sort === 'mean' ? b.mean - a.mean : sort === 'effect' ? Math.abs(b.effect ?? 0) - Math.abs(a.effect ?? 0) : (a.qValue ?? 2) - (b.qValue ?? 2) || a.name.localeCompare(b.name)), [rows, search, onlySignificant, qMax, sort]);
  const data = detail.data, item = data?.item, samples = data?.record.samples || EMPTY;
  const option = useMemo(() => !data ? {} : ({ animation: false, grid: { left: 80, right: 25, top: 55, bottom: 55 },
    xAxis: { type: 'value', min: -.5, max: 1.5, interval: .5, axisLabel: { formatter: x => x === 0 ? 'AD' : x === 1 ? 'NC' : '' }, splitLine: { show: false } },
    yAxis: { type: 'value', name: log ? 'log10(上游原值 + 1)' : '上游标准化丰度（非百分比）', nameLocation: 'middle', nameGap: 55, nameTextStyle: { fontSize: 11 } },
    tooltip: { formatter: p => `${escapeTooltipText(p.data[2])}<br/>原值 ${fmt(p.data[3])}` },
    series: ['AD', 'NC'].map((group, g) => ({ type: 'scatter', name: group, symbolSize: 7, itemStyle: { color: g ? '#0072b2' : '#d55e00', opacity: .7 },
      data: samples.flatMap((s, i) => s.group === group ? [[g + (((i * 17) % 23) / 23 - .5) * .3, log ? Math.log10(data.values[i] + 1) : data.values[i], s.id, data.values[i]]] : []) })) }), [data, samples, log]);
  useEffect(() => {
    const host = plotHost.current; if (!host) return undefined;
    let frame;
    const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const chart = chartRef.current?.getEchartsInstance?.(); if (chart && !chart.isDisposed()) chart.resize({ width: host.clientWidth, height: 360 }); }); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [data?.item.id]);
  if (query.isPending) return <p role="status">正在读取同一修订的 KO / 通路完整统计…</p>;
  if (query.error) return <p className="function-exploration">功能联动不可用：{query.error.message} 原有图表及查询仍可使用。</p>;
  const record = query.data.record, tested = rows.filter(r => r.tested), passed = tested.filter(r => r.qValue < qMax);
  const statsDownload = () => {
    const keys = ['id', 'tested', 'reason', 'pValue', 'qValue', 'effect', 'AD_n', 'AD_detected', 'AD_mean', 'AD_median', 'AD_q1', 'AD_q3', 'NC_n', 'NC_detected', 'NC_mean', 'NC_median', 'NC_q1', 'NC_q3', 'analysisKey', 'revision', 'familyCount', 'detection', 'prevalenceMin', 'qThreshold', 'method', 'unit', 'koSourceSha256', 'pathwaySourceSha256'];
    const lines = rows.map(r => [r.id, r.tested, r.reason, r.pValue, r.qValue, r.effect,
      ...['AD', 'NC'].flatMap(g => ['count', 'detected', 'mean', 'median', 'q1', 'q3'].map(k => r.groups[g][k])), record.analysisKey, revision, tested.length, '>0', kind === 'ko' ? prevalence : 'none', qMax, record.method, record.unit, record.koSourceSha256, record.pathwaySourceSha256]);
    download(`functional-${kind}-complete.csv`, '\ufeff' + [keys, ...lines].map(r => r.map(cell).join(',')).join('\r\n'), 'text/csv');
  };
  return <section className="function-exploration" aria-label="KO 与通路研究对象联动">
    <h3>KO 与通路 · 从完整结果查看研究对象</h3>
    <p>本联动研究区统一范围：AD {record.samples.filter(s => s.group === 'AD').length} / NC {record.samples.filter(s => s.group === 'NC').length}；数据修订 {revision?.slice(0, 12)}。切换对象保持此范围。</p>
    <p>当前{kind === 'ko' ? ' KO' : '通路'}源对象 {rows.length} 项，进入检验 {tested.length} 项，q &lt; {qMax} 通过 {passed.length} 项，最小 q={fmt(Math.min(...tested.map(r => r.qValue)))}。{!passed.length && '零显著结果仍可搜索和查看真实样本；未自动放宽阈值。'}</p>
    {scope.mode !== 'cohort' && pathwayId && <p>注意：本联动区使用所选子集；下方原有通路概览／图形保留全队列范围，不能与本区子集统计混用。</p>}
    <p>KO 预筛为合并样本非零检出率 ≥ {prevalence * 100}%；通路全部进入另一套 BH 校正。排序与展示上限不改变校正集合。未调整协变量；指标反映功能潜能，不代表实际通路活性或因果关系。</p>
    <div className="function-exploration__controls">
      <button type="button" onClick={() => choose('pathway', '')}>查看通路对象</button><button type="button" onClick={() => choose('ko', '')}>查看 KO 对象</button>
      <label>搜索编号或名称<input aria-label="搜索功能对象" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>排序<select aria-label="功能对象排序" value={sort} onChange={e => setSort(e.target.value)}><option value="q">q 值从小到大</option><option value="mean">平均丰度</option><option value="effect">绝对效应量（探索）</option></select></label>
      <label>展示上限<select aria-label="功能结果展示上限" value={limit} onChange={e => setLimit(Number(e.target.value))}>{[10,20,50,100].map(n => <option key={n}>{n}</option>)}</select></label>
      <label><input type="checkbox" checked={onlySignificant} onChange={e => setOnlySignificant(e.target.checked)} />仅当前 q 阈值通过项</label>
    </div>
    <p>匹配 {filtered.length} 项，当前表显示前 {Math.min(filtered.length, limit)} 项；导出完整统计包含全部 {rows.length} 项及未纳入原因。</p>
    {detail.isFetching && <p role="status">正在读取所选对象的样本级证据…</p>}{detail.error && <p>{detail.error.message}</p>}
    {item && !detail.isFetching && <section aria-label="功能对象样本证据"><h4>{item.name}</h4><p>{item.qValue != null && item.qValue < qMax ? '通过当前 q 阈值' : '探索性查看：未通过当前 q 阈值或未纳入检验'}；p={fmt(item.pValue)}，q={fmt(item.qValue)}，秩效应={fmt(item.effect)}。</p>
      <p>名称注释：{kind === 'ko' ? '暂无可靠功能名称注释；按 KO 编号查询。' : '保留上游指标名称。'}</p>
      {['AD','NC'].map(g => <p key={g}>{g}：n={item.groups[g].count}，检出 {item.groups[g].detected}/{item.groups[g].count}（{fmt(item.groups[g].detected/item.groups[g].count*100)}%），均值 {fmt(item.groups[g].mean)}，中位数 {fmt(item.groups[g].median)}，四分位 [{fmt(item.groups[g].q1)}, {fmt(item.groups[g].q3)}]。</p>)}
      <label><input type="checkbox" checked={log} onChange={e => setLog(e.target.checked)} />仅显示变换 log10(x+1)（原值统计与下载不变）</label>
      <div ref={plotHost} style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}><CartesianEChart ref={chartRef} option={option} style={{ height: 360 }} showDataTable={false} exportConfig={{ fileName: `functional-${kind}-${revision?.slice(0,8)}`, format: 'svg' }} ariaLabel="功能对象 AD NC 全部样本原值分布" /></div>
      <button type="button" onClick={() => exportEChart(chartRef, { fileName: `functional-${kind}-${revision.slice(0,8)}`, format: 'svg', minWidth: 1200, minHeight: 600, buildOption: () => ({ ...option, graphic: [{ type: 'text', left: 20, bottom: 4, style: { text: `AD/NC · MWU + BH (${kind === 'ko' ? record.koFamilyCount : record.pathwayFamilyCount} items) · ${log ? 'log10(x+1)' : 'raw'} · ${revision.slice(0,12)} · normalized abundance, not percent`, fontSize: 10 } }] }) })}>导出所选分布 SVG</button>
      <button type="button" onClick={() => download('functional-samples.csv', '\ufeff' + [['Sample','Group','Object','RawValue','Revision','AnalysisKey'], ...samples.map((s,i) => [s.id,s.group,item.id,data.values[i],revision,data.record.analysisKey])].map(r => r.map(cell).join(',')).join('\r\n'), 'text/csv')}>下载所选对象样本原值 CSV</button>
      {data.mapping ? <div><p>本修订已核验公式：{data.mapping.formula}；{data.mapping.sampleCount} 个样本逐一比对，最大绝对差 {fmt(data.mapping.maxAbsoluteError)}。这是数值一致性核验；安装版本未知，KO 数值不作为百分比。</p><a href={data.mapping.source} target="_blank" rel="noreferrer">公开公式 v0.3 参考</a><div className="function-exploration__controls">{kind === 'pathway' ? data.mapping.kos.map(k => <button type="button" key={k} onClick={() => choose('ko', k)}>查看 {k}</button>) : <button type="button" onClick={() => choose('pathway', data.mapping.pathway)}>返回已核验关联通路</button>}</div></div> : <p>通路—KO 映射待核验；不按名称推测关系，现有数值仍可查询。</p>}
    </section>}
    <ClientDataTable rows={filtered.slice(0, limit)} ariaLabel="功能对象完整统计查询" renderRow={r => <tr key={r.id}><td><button type="button" onClick={() => choose(kind, r.id)}>{r.name}</button></td><td>{r.tested ? '已检验' : '未纳入：低检出率'}</td><td>{fmt(r.groups.AD.mean)}</td><td>{fmt(r.groups.NC.mean)}</td><td>{r.groups.AD.detected}/{r.groups.AD.count}</td><td>{r.groups.NC.detected}/{r.groups.NC.count}</td><td>{fmt(r.effect)}</td><td>{fmt(r.pValue)}</td><td>{fmt(r.qValue)}</td></tr>}><thead><tr>{['研究对象', '纳入状态', 'AD 均值', 'NC 均值', 'AD 检出', 'NC 检出', '秩效应 AD−NC', 'p', 'BH q'].map(x => <th key={x}>{x}</th>)}</tr></thead></ClientDataTable>
    <div className="function-exploration__controls"><button type="button" onClick={statsDownload}>下载本类全部统计 CSV</button><button type="button" onClick={() => download('functional-analysis-record.json', JSON.stringify({ ...record, verifiedMapping: data?.mapping || null, qThreshold: qMax, kind, selected: chosen?.id, display: { search, sort, limit, onlySignificant, transform: log ? 'log10(x+1)' : 'raw' } }, null, 2), 'application/json')}>下载功能分析说明 JSON</button></div>

  </section>;
}
