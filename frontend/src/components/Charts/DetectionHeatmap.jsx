import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from './HeatmapEChart';
import './CartesianEChart';
import { exportEChart } from './chartExport';
import ClientDataTable from '../data-display/ClientDataTable';
import { DETECTION_SORTS, detectionRows, filterDetection, parseDetectionIds, detectionPercent as pct, detectionTooltip } from './detectionResearch';
import './detection-research.css';

const COLORS = ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'];
const EMPTY = [];
const VIEWS = { heatmap: '纵向检出率热图', dumbbell: '双组哑铃比较', gap: '检出率差值', scatter: '全量双组散点' };
function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function DetectionHeatmap({ data, projection, onInspectKO }) {
  const rows = useMemo(() => detectionRows(data), [data]), top = data?.filter?.topN || data?.items?.length || 50;
  const [view, setView] = useState('heatmap'), [sort, setSort] = useState('gap'), [search, setSearch] = useState(''), [field, setField] = useState('overall');
  const [minimum, setMinimum] = useState(0), [maximum, setMaximum] = useState(100), [pool, setPool] = useState(null), [batch, setBatch] = useState(''), [message, setMessage] = useState(''), [page, setPage] = useState(0), [pageSize, setPageSize] = useState(25), [focused, setFocused] = useState('');
  const chartRef = useRef(null), host = useRef(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const filters = { search, field, minimum, maximum, sort };
  const filtered = useMemo(() => filterDetection(rows, { search, field, minimum, maximum, sort }), [rows, search, field, minimum, maximum, sort]);
  const defaultIds = useMemo(() => (data?.items || EMPTY).map(r => r.koId), [data]);
  const ids = pool ?? defaultIds, byId = new Map(rows.map(r => [r.koId, r]));
  const selected = useMemo(() => { const index = new Map(rows.map(r => [r.koId,r])); return ids.map(id => index.get(id)).filter(Boolean); }, [ids,rows]);
  const ordered = useMemo(() => filterDetection(selected, { sort, minimum: -100, maximum: 100 }), [selected, sort]);
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize)), currentPage = Math.min(page, pages - 1), shown = useMemo(() => ordered.slice(currentPage * pageSize, (currentPage + 1) * pageSize), [ordered, currentPage, pageSize]);
  const add = more => setPool(current => { const before = current ?? defaultIds; const next = [...new Set([...before, ...more])]; return current && next.length === before.length ? current : next; });
  const focus = byId.get(focused);
  const option = useMemo(() => {
    const tooltip = { trigger: 'item', formatter: p => p.data?.row ? detectionTooltip(p.data.row) : '' };
    const common = { animation: false, tooltip, grid: { left: view === 'scatter' ? 60 : 90, right: 40, top: 45, bottom: 70 }, ...(view === 'dumbbell' ? { legend: { data: ['AD', 'NC'], top: 5 } } : {}) };
    if (view === 'scatter') return { ...common, brush: { toolbox: ['rect', 'clear'], xAxisIndex: 0, yAxisIndex: 0 },
      xAxis: { type: 'value', min: 0, max: 100, name: 'NC 检出率 %', nameLocation: 'middle', nameGap: 30 }, yAxis: { type: 'value', min: 0, max: 100, name: 'AD 检出率 %' },
      series: [{ type: 'scatter', symbolSize: 5, itemStyle: { color: '#0072b2', opacity: .3 }, large: false,
        data: filtered.map(r => ({ value: [r.ncDetectionRate * 100, r.adDetectionRate * 100], row: r, itemStyle: search && r.koId.toLowerCase().includes(search.toLowerCase()) ? { color: '#d55e00', opacity: 1 } : undefined })),
        markLine: { silent: true, symbol: 'none', data: [[{ coord: [0,0] }, { coord: [100,100] }]] } }] };
    const yAxis = { type: 'category', inverse: true, data: shown.map(r => r.koId), axisLabel: { interval: 0, fontSize: 11 } };
    if (view === 'heatmap') return { ...common, xAxis: { type: 'category', data: ['AD', 'NC'] }, yAxis,
      visualMap: { min: 0, max: 1, dimension: 2, calculable: false, orient: 'horizontal', left: 'center', bottom: 5, text: ['100% 检出率', '0%'], inRange: { color: COLORS } },
      series: [{ type: 'heatmap', data: shown.flatMap((r,i) => [{ value: [0,i,r.adDetectionRate], row: r }, { value: [1,i,r.ncDetectionRate], row: r }]),
        label: { show: shown.length <= 25 && plotWidth >= 600, color: '#111827', formatter: p => { const r = p.data.row, ad = p.data.value[0] === 0; return `${ad ? r.adDetectedSamples : r.ncDetectedSamples}/${ad ? r.adSampleCount : r.ncSampleCount} (${pct(p.data.value[2])})`; } } }] };
    if (view === 'gap') return { ...common, xAxis: { type: 'value', min: -100, max: 100, name: 'AD − NC（百分点）', nameLocation: 'middle', nameGap: 35 }, yAxis,
      series: [{ type: 'bar', data: shown.map(r => ({ value: r.rateGap * 100, row: r, itemStyle: { color: r.rateGap >= 0 ? '#d55e00' : '#0072b2' } })), markLine: { silent: true, data: [{ xAxis: 0 }] } }] };
    return { ...common, xAxis: { type: 'value', min: 0, max: 100, name: '组内检出率 %', nameLocation: 'middle', nameGap: 35 }, yAxis,
      series: [...shown.map((r,i) => ({ type: 'line', silent: true, symbol: 'none', lineStyle: { color: '#94a3b8' }, data: [[r.adDetectionRate * 100, i], [r.ncDetectionRate * 100, i]] })),
        ...['AD','NC'].map((g,i) => ({ name: g, type: 'scatter', symbolSize: 9, itemStyle: { color: i ? '#0072b2' : '#d55e00' }, data: shown.map((r,j) => ({ value: [(i ? r.ncDetectionRate : r.adDetectionRate) * 100,j], row: r })) }))] };
  }, [view, filtered, shown, search, plotWidth]);
  const height = view === 'scatter' ? 520 : Math.max(360, shown.length * 30 + 125);
  useEffect(() => {
    const element = host.current; if (!element) return undefined;
    let frame; const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { setPlotWidth(element.clientWidth); const c = chartRef.current?.getEchartsInstance?.(); if (c && !c.isDisposed()) c.resize({ width: element.clientWidth, height }); }); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize(); return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [height]);
  const record = { datasetRevision: projection?.datasetRevision, projectionKey: projection?.projectionKey, scope: projection?.scope, groups: data?.groups, samples: data?.samples,
    methodVersion: 'ko-detection-descriptive-v2', detectionRule: data?.detectionRule || 'abundance > 0', filters, selectionMode: pool == null ? 'backend_ranked_top_n' : 'manual_pool', topN: top, poolIds: ids, currentIds: shown.map(r => r.koId), view, page: currentPage + 1, pageSize, colorDomain: [0,1], interpretation: 'descriptive; no significance test' };
  const exportRows = (scope, list) => {
    const columns = ['KO','AD_detected','AD_n','AD_rate','NC_detected','NC_n','NC_rate','AD_minus_NC_percentage_points','overall_rate','revision','rule','scope'];
    const csv = [columns, ...list.map(r => [r.koId,r.adDetectedSamples,r.adSampleCount,r.adDetectionRate,r.ncDetectedSamples,r.ncSampleCount,r.ncDetectionRate,r.rateGap*100,r.overallDetectionRate,projection?.datasetRevision,data?.detectionRule,scope])];
    save(`ko-detection-${scope}.csv`, '\ufeff'+csv.map(r => r.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n'), 'text/csv');
  };
  if (!rows.length) return <p>暂无 KO 检出率数据</p>;
  return <section className="detection-research" aria-label="KO 检出率研究工作区">
    <p>快捷 Top {top} KO · 源对象 {rows.length} · 对象池 {selected.length} · 当前 {view === 'scatter' ? `总览匹配 ${filtered.length}` : `显示 ${shown.length ? currentPage*pageSize+1 : 0}–${currentPage*pageSize+shown.length}（第 ${currentPage+1}/${pages} 页）`} · 排序：{DETECTION_SORTS[sort]}</p>
    <p>AD 样本数: {data.groups?.find(g => g.group === 'AD')?.sampleCount ?? 0}；NC 样本数: {data.groups?.find(g => g.group === 'NC')?.sampleCount ?? 0}。检出定义：{data.detectionRule || 'abundance > 0'}。检出率分母为本组全部参与样本；差值单位为百分点，仅作描述性比较，不代表丰度差异或统计显著。</p>
    <div className="detection-controls"><label>搜索 KO<input aria-label="搜索检出 KO" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>筛选指标<select aria-label="检出率筛选指标" value={field} onChange={e => { setField(e.target.value); setMinimum(e.target.value === 'gap' ? -100 : 0); }}>{[['overall','总体检出率 %'],['ad','AD 检出率 %'],['nc','NC 检出率 %'],['gap','AD−NC 百分点']].map(([v,t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      <label>下限<input aria-label="检出率下限" type="number" min={-100} max={100} value={minimum} onChange={e => setMinimum(Number(e.target.value))} /></label><label>上限<input aria-label="检出率上限" type="number" min={-100} max={100} value={maximum} onChange={e => setMaximum(Number(e.target.value))} /></label>
      <label>排序<select aria-label="检出对象排序" value={sort} onChange={e => setSort(e.target.value)}>{Object.entries(DETECTION_SORTS).map(([v,t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      <button type="button" onClick={() => { setPool(filtered.slice(0,top).map(r => r.koId)); setPage(0); }}>按筛选与排序选取 Top {top}</button><button type="button" onClick={() => { setPool(null); setPage(0); }}>恢复快捷 Top N</button>
    </div>
    <details><summary>手动对象池与批量编号 · 已选 {selected.length}</summary><label>批量输入 KO 编号<textarea aria-label="批量检出 KO 编号" value={batch} onChange={e => setBatch(e.target.value)} /></label>
      <button type="button" onClick={() => { const parsed = parseDetectionIds(batch, rows); add(parsed.valid); setMessage(`已加入 ${parsed.valid.length} 项；未知编号 ${parsed.unknown.join('、') || '无'}`); }}>加入对象池</button><button type="button" onClick={() => setPool([])}>清空对象池</button>
      <p role="status">{message}</p><div className="detection-pool">{selected.map(r => <button type="button" key={r.koId} onClick={() => setPool(ids.filter(id => id !== r.koId))}>移除 {r.koId}</button>)}</div>
      <p>已核验通路关联可在 KO 详情中查看；未核验的映射不作为自动选取依据。</p></details>
    <div className="detection-controls">{Object.entries(VIEWS).map(([v,t]) => <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>{t}</button>)}
      <label>每页对象<select aria-label="每页检出对象" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}>{[10,25,50].map(n => <option key={n}>{n}</option>)}</select></label>
      <button type="button" disabled={currentPage===0} onClick={() => setPage(currentPage-1)}>上一页</button><button type="button" disabled={currentPage===pages-1} onClick={() => setPage(currentPage+1)}>下一页</button>
    </div>
    {view === 'scatter' && <button type="button" onClick={() => chartRef.current?.getEchartsInstance?.().dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect', brushMode: 'single' } })}>启用矩形框选加入对象池</button>}
    {view === 'scatter' && <p>散点显示全部筛选匹配对象，独立于对象池；大量同值点会重叠，不能逐点区分，使用搜索与完整表核对。框选后可加入对象池；坐标固定 0–100%。</p>}
    <div ref={host} style={{ width:'100%', minWidth:0, overflow:'hidden' }}><ReactECharts ref={chartRef} option={option} notMerge style={{width:'100%',height}} ariaLabel="KO 检出率比较图" showDataTable={false}
      onEvents={{ click: p => { if (p.data?.row) setFocused(p.data.row.koId); }, brushSelected: e => { const indices=e.batch?.[0]?.selected?.[0]?.dataIndex || []; setMessage(`已框选 ${indices.length} 项`); if(indices.length) add(indices.map(i => filtered[i].koId)); } }} /></div>
    {focus && <p role="status">{focus.koId}：AD {focus.adDetectedSamples}/{focus.adSampleCount}（{pct(focus.adDetectionRate)}），NC {focus.ncDetectedSamples}/{focus.ncSampleCount}（{pct(focus.ncDetectionRate)}），差值 {(focus.rateGap*100).toFixed(2)} 个百分点。{onInspectKO && <button type="button" onClick={() => onInspectKO(focus.koId)}>查看 {focus.koId} 样本原值与统计证据</button>}</p>}
    <div className="detection-controls"><button type="button" onClick={() => exportRows('current-page',shown)}>下载当前页 CSV</button><button type="button" onClick={() => exportRows('selected-pool',ordered)}>下载对象池 CSV</button><button type="button" onClick={() => exportRows('all-source',rows)}>下载全部源 KO 检出统计 CSV</button><button type="button" onClick={() => save('ko-detection-analysis.json',JSON.stringify(record,null,2),'application/json')}>下载检出分析说明 JSON</button>
      <button type="button" onClick={() => exportEChart(chartRef,{fileName:`ko-detection-${view}-page${currentPage+1}`,format:'svg',minWidth:1200,minHeight:height+50,buildOption:() => ({...option,graphic:[{type:'text',left:20,bottom:5,style:{text:`${data.detectionRule} · AD n=${rows[0].adSampleCount} / NC n=${rows[0].ncSampleCount} · ${view==='scatter'?filtered.length:shown.length} KO · descriptive · revision ${projection?.datasetRevision?.slice(0,12)||'direct'}`,fontSize:10}}]})})}>导出当前视图 SVG</button></div>
    <p>本区导出分别对应当前分页、对象池或全部源 KO；下方原有图表数据与筛选审计对应服务器快捷 Top N，完整结果查询仍是样本级原始记录。</p>
    <details><summary>完整检出统计查询 · 当前匹配 {filtered.length} 项</summary><ClientDataTable rows={filtered} ariaLabel="完整 KO 检出统计" renderRow={r => <tr key={r.koId}><td><button type="button" onClick={() => setFocused(r.koId)}>{r.koId}</button></td><td>{r.adDetectedSamples}/{r.adSampleCount}（{pct(r.adDetectionRate)}）</td><td>{r.ncDetectedSamples}/{r.ncSampleCount}（{pct(r.ncDetectionRate)}）</td><td>{(r.rateGap*100).toFixed(2)}</td><td><button type="button" onClick={() => add([r.koId])}>添加 {r.koId}</button>{onInspectKO && <button type="button" onClick={() => onInspectKO(r.koId)}>详情 {r.koId}</button>}</td></tr>}><thead><tr>{['KO','AD 检出/分母（率）','NC 检出/分母（率）','AD−NC 百分点','对象操作'].map(t => <th key={t}>{t}</th>)}</tr></thead></ClientDataTable></details>
  </section>;
}
