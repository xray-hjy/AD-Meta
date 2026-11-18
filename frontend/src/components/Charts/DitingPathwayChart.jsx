import { pathwaySelection, pathwayGroupSummary, pathwayCsv } from './pathwayResearch';
import FunctionExploration from './FunctionExploration';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { HeatmapChart } from 'echarts/charts';
import { TitleComponent, VisualMapComponent } from 'echarts/components';
import ChartStyleToolbar from './ChartStyleToolbar';
import useChartStylePreferences from './useChartStylePreferences';
import { useChartFrameToolbarTarget } from './ChartFrameActionsContext';
import { resolveResearchPalette, researchPaletteOptions } from './researchPalettes';
import { echarts } from './EChartBase';
import { exportEChart } from './chartExport';
import ResearchChartSurface from './ResearchChartSurface';
import { buildPathwayOption, HEAT_PALETTES, PATHWAY_VIEWS, prepareHeatmap } from './ditingPathwayOptions';
import { distributionStatus, formatPathwayValue as fmt, formatProbability as prob } from './ditingPathwayMath';
import { fetchJson } from '../../api/client';
import { useColorVision } from '../../context/ColorVisionContext';
import StyledSelect from '../ui/StyledSelect';
import SegmentedControl from '../ui/SegmentedControl';
import LoadingState from '../ui/LoadingState';
import ErrorState from '../ui/ErrorState';
import EmptyState from '../ui/EmptyState';
import ResultDisclosure from '../data-display/ResultDisclosure';
import ClientDataTable from '../data-display/ClientDataTable';
import './diting-pathways.css';

echarts.use([HeatmapChart, VisualMapComponent, TitleComponent]);
const EMPTY = [], PAGE_SIZE = 6;
const VIEW_KEYS = { overview: 'pathwayOverview', effects: 'pathwayEffects', distribution: 'pathwayDistribution' };
const choice = (key, label, options, more = true) => ({ key, label, more, options: options.map(([value, text]) => ({ value, label: text })) });
const captions = {
  coverage: '每个点代表一个指标；横轴为全队列非零样本比例，纵轴为 log10(平均丰度 + 1)，颜色为 Cliff’s δ。全零指标在原点合并标记，点击查看列表。',
  dumbbell: '连接两组平均丰度位置；对数坐标先计算各组原值均值，再进行 log10(x + 1) 变换。均值差距不等同于显著差异。',
  forest: '点为 Cliff’s δ，横线为组内重采样 95% 百分位区间（不是全表同时区间，不能代替 BH q）；正值表示 AD 倾向较高。实心点表示全表 BH q < 0.05，空心点表示未达到该阈值。',
  significance: '横轴为 Cliff’s δ，纵轴为 −log10(BH q)；参考横线为 q = 0.05。灰色点未达到全表校正阈值，描边保留效应方向。',
  heatmap: '分组色条标记 AD / NC。聚类采用所选显示值的欧氏距离与平均连接法；样本在 AD、NC 组内分别聚类。恒定指标保留在排列末端，不参加指标聚类。',
  raincloud: '半密度、四分位箱线与全部样本点；密度在零边界进行反射修正。样本点可点击定位，密度形状随平滑设置变化。',
  violin: '对称密度轮廓、中央四分位箱线和全部样本点。点采用蜂群排布；密集零值可能局部重叠，ECDF 可直接核对零值比例。',
  swarm: '箱线须位于 1.5×IQR 范围内；全部样本以确定性的蜂群排布显示。极多相同值超出可用宽度时可能局部重叠，悬浮或定位可查看原值。',
  ecdf: '阶梯高度表示丰度小于等于横轴数值的样本比例；相同值合并为同一次跳跃，零值保留，不进行平滑。',
  ridge: '各通路共用同一丰度横轴；每组轮廓按自身峰值缩放，形状用于比较分布，不代表组样本量或通路之间的总量关系。',
};

function styleFields(view, values) {
  const heat = view === 'heatmap', density = ['violin', 'raincloud', 'ridge'].includes(view), scatter = !['heatmap', 'ridge', 'ecdf'].includes(view);
  return [
    heat ? { key: 'heatPalette', label: '色带', type: 'palette', options: HEAT_PALETTES, disabled: values.heatScale !== 'z', description: '发散色带以零 Z 分数为中心；丰度视图使用单向连续色带。' }
      : { key: 'palette', label: '配色', type: 'palette', discrete: true, options: researchPaletteOptions('pathway'), description: '双色摘选：NC 使用左色，AD 使用右色；概览散点用两端颜色表达效应方向。' },
    { key: 'hover', label: '悬浮', type: 'switch' },
    ...(!['ridge', 'heatmap', 'ecdf'].includes(view) ? [{ key: 'labels', label: ['coverage', 'significance'].includes(view) ? '指标标注' : ['raincloud', 'violin', 'swarm'].includes(view) ? '定位样本标注' : '数值标注', type: 'switch', more: true }] : []),
    ...(scatter ? [choice('pointSize', '点大小', [['4', '小'], ['6', '中'], ['9', '大']]), choice('opacity', '点透明度', [['0.35', '35%'], ['0.65', '65%'], ['1', '100%']]),
      ...(['forest', 'significance'].includes(view) ? [] : [{ key: 'outline', label: '点描边', type: 'switch', more: true }])] : []),
    ...(['forest', 'significance'].includes(view) ? [{ key: 'reference', label: '参考线', type: 'switch' }] : []),
    ...(density ? [choice('smoothing', '密度平滑', [['0.6', '较细'], ['1', '推荐'], ['1.6', '较平滑']], false)] : []),
    ...(heat ? [choice('heatScale', '热图数值', [['z', 'log 后通路 Z'], ['log', 'log10(x + 1)']], false),
      { key: 'transposed', label: '横纵轴互换', type: 'toggle' },
      choice('clustering', '聚类', [['both', '指标＋组内样本'], ['rows', '仅指标'], ['samples', '仅组内样本'], ['none', '不聚类']], false),
      { key: 'trees', label: '指标树枝', type: 'switch', more: true, disabled: ['none', 'samples'].includes(values.clustering) }, { key: 'sampleLabels', label: '样本标签', type: 'switch', more: true }] : []),
    ...(['forest', 'dumbbell', 'ridge', 'heatmap'].includes(view) ? [{ key: 'fullNames', label: '完整名称', type: 'switch', more: true }] : []),
    heat ? { key: 'cellBorders', label: '格子边界', type: 'switch', more: true } : { key: 'grid', label: '网格', type: 'switch', more: true },
    ...(['dumbbell', 'ridge', 'raincloud', 'violin', 'swarm', 'ecdf'].includes(view) ? [{ key: 'legend', label: '图例', type: 'switch', more: true }] : []),
    choice('fontSize', '文字大小', [['10', '小'], ['11', '中'], ['13', '大']]),
  ];
}

export default function DitingPathwayChart({ slug, revision, mode = 'overview' }) {
  const [params, setParams] = useSearchParams(), target = useChartFrameToolbarTarget();
  const [brushIds, setBrushIds] = useState(EMPTY), [tableOpen, setTableOpen] = useState(false), [exportStatus, setExportStatus] = useState(''), [functionOpen, setFunctionOpen] = useState(null);
  const preferences = useChartStylePreferences(`diting-pathway-${mode}`), { colorBlindFriendly } = useColorVision();
  const view = PATHWAY_VIEWS[mode].some(([key]) => key === params.get(VIEW_KEYS[mode])) ? params.get(VIEW_KEYS[mode]) : (mode === 'distribution' ? 'swarm' : PATHWAY_VIEWS[mode][0][0]);
  const viewName = PATHWAY_VIEWS[mode].find(([key]) => key === view)[1];
  const search = params.get('pathwayQuery') || '', sort = params.get('pathwaySort') || 'mean';
  const group = ['AD', 'NC'].includes(params.get('pathwayGroup')) ? params.get('pathwayGroup') : 'all';
  const transform = params.get('pathwayTransform') === 'raw' ? 'raw' : 'log', highlighted = params.get('pathwaySample') || '';
  const limit = Number(params.get('pathwayLimit')) || 15;
  const style = useMemo(() => ({ palette: colorBlindFriendly ? 'okabe-ito' : 'brewer-set2', heatPalette: 'blueRed', heatScale: 'z', clustering: 'both', trees: true,
    sampleLabels: false, cellBorders: false, pointSize: '6', opacity: '0.65', fontSize: '11', grid: true, hover: true, labels: false, legend: true, outline: true, reference: true,
    smoothing: '1', fullNames: false, transposed: false, ...preferences.values }), [colorBlindFriendly, preferences.values]);
  const colors = useMemo(() => { const palette = resolveResearchPalette('pathway', style); return { AD: palette.colors[1], NC: palette.colors[0] }; }, [style]);
  const update = useCallback((updates, options = { replace: true }) => setParams(current => { const next = new URLSearchParams(window.location.search || current);
    Object.entries(updates).forEach(([key, value]) => { if (value == null || value === '') next.delete(key); else next.set(key, String(value)); });
    return next; }, options), [setParams]);
  const base = `/api/datasets/${encodeURIComponent(slug)}/revisions/${encodeURIComponent(revision)}/diting`;
  const query = useQuery({ queryKey: ['diting-pathways', slug, revision], queryFn: ({ signal }) => fetchJson(`${base}/pathways`, { signal }),
    enabled: Boolean(slug && revision), staleTime: Infinity, retry: false });
  const payload = query.data, all = payload?.items || EMPTY;
  const samples = useMemo(() => (payload?.samples || []).map((sample, index) => ({ ...sample, index })), [payload]);
  const filtered = useMemo(() => all.filter(item => (item.name+' '+item.id).toLowerCase().includes(search.toLowerCase())).sort((a, b) =>
    sort === 'effect' ? Math.abs(b.effect) - Math.abs(a.effect) : sort === 'q' ? a.qValue - b.qValue || Math.abs(b.effect) - Math.abs(a.effect) : b.mean - a.mean), [all, search, sort]);
  const { selected: selectedItems, focused: selected, page, pages: pageCount } = useMemo(() => pathwaySelection(all, params.get('pathways'), params.get('pathway'), params.get('pathwayPage'), PAGE_SIZE), [all, params]);
  const universe = mode !== 'distribution' && params.get('pathwayUniverse') === 'all';
  const sortedPool = useMemo(() => [...selectedItems].sort((a,b) => sort === 'effect' ? Math.abs(b.effect)-Math.abs(a.effect) : sort === 'q' ? a.qValue-b.qValue : b.mean-a.mean), [selectedItems, sort]);
  const items = useMemo(() => mode === 'distribution' ? selectedItems.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE) : universe ? all : sortedPool,
    [mode, selectedItems, page, universe, all, sortedPool]);
  const heatSamples = useMemo(() => samples.filter(sample => group === 'all' || sample.group === group), [samples, group]);
  const heatmapModel = useMemo(() => view === 'heatmap' ? prepareHeatmap(items, heatSamples, style.clustering, style.heatScale) : null, [view, items, heatSamples, style.clustering, style.heatScale]);
  const facet = mode === 'distribution' && view !== 'ridge' && items.length > 1;
  const chartHeight = facet ? Math.ceil(items.length / 2) * 360 : 620;
  const model = useMemo(() => ({ view, items, samples, style, colors, group: mode === 'effects' || view === 'coverage' ? 'all' : group, transform, highlighted, heatmapModel }),
    [view, items, samples, style, colors, mode, group, transform, highlighted, heatmapModel]);
  const option = useMemo(() => buildPathwayOption({ ...model, height: chartHeight }), [model, chartHeight]);
  const world = useMemo(() => ({ width: view === 'heatmap' ? Math.max(600, (style.transposed ? items.length : heatSamples.length) * 16) : 900,
    height: view === 'heatmap' ? Math.max(360, (style.transposed ? heatSamples.length : items.length) * 27) : ['forest', 'dumbbell'].includes(view) ? Math.max(400, items.length * 32) : view === 'ridge' ? Math.max(400, items.length * 90) : 500 }), [view, heatSamples.length, items.length, style.transposed]);
  const setPool = ids => update({ pathways: ids.join(',') || 'none', pathway: ids.includes(selected?.id) ? selected.id : ids[0] || null, pathwayPage: 0, pathwayUniverse: 'pool' });
  const toggleSelection = item => { const ids = new Set(selectedItems.map(row => row.id)); if (ids.has(item.id)) ids.delete(item.id); else ids.add(item.id); setPool([...ids]); };
  const focusItem = id => {
    const ids = selectedItems.map(item => item.id); if (!ids.includes(id)) ids.push(id);
    update({ pathways: ids.join(','), pathway: id, pathwayPage: Math.floor(ids.indexOf(id)/PAGE_SIZE), pathwayUniverse: 'pool' });
  };
  const openDistribution = id => {
    const ids = selectedItems.map(item => item.id); if (!ids.includes(id)) ids.push(id);
    update({ chart: 'ditingDistribution', pathways: ids.join(','), pathway: id, pathwayPage: Math.floor(ids.indexOf(id)/PAGE_SIZE), pathwayUniverse: 'pool' }, { replace: false });
  };
  const onSelect = data => {
    if (data?.sampleId && mode === 'distribution') { update({ pathwaySample: data.sampleId, ...(data.pathwayId ? {pathway:data.pathwayId} : {}) }); return; }
    if (data?.pathwayIds) { setBrushIds(data.pathwayIds); setTableOpen(true); return; }
    if (data?.pathwayId) { if (mode === 'distribution') focusItem(data.pathwayId); else openDistribution(data.pathwayId); }
  };
  const onBrush = ids => { setBrushIds(ids); if (ids.length) setTableOpen(true); };
  const exportSpec = useMemo(() => ({ fileName: `diting-${view}-${revision?.slice(0, 8)}-page${page + 1}`,
    suggestedSize: { width: view === 'heatmap' ? Math.max(1600, (style.transposed ? items.length : heatSamples.length) * 9 + 580) : 1600,
      height: ['forest', 'dumbbell', 'heatmap'].includes(view) ? Math.max(700, (view === 'heatmap' && style.transposed ? heatSamples.length : items.length) * 36 + 150) : Math.max(700, chartHeight) },
    displayOption: size => buildPathwayOption({ ...model, ...size }),
    buildOption: ({ width, height }) => {
      const built = buildPathwayOption({ ...model, style: { ...style, fullNames: true }, width, height: height - 45 });
      const title = built.title || [{ text: `DiTing · ${viewName}`, left: 60, top: 6, textStyle: { fontSize: 16 } }];
      return { ...built, title, graphic: [{ type: 'text', left: 30, bottom: 8, style: { fill: '#637487', fontSize: 11,
        text: `DiTing 上游标准化丰度 · 显示 ${view==='heatmap'?`log 后 ${style.heatScale} / ${style.clustering}`:transform} · 可见组 ${model.group} · AD n=${samples.filter(s => s.group === 'AD').length} / NC n=${samples.filter(s => s.group === 'NC').length} · 全表 BH ${all.length} 项 · 版本 ${revision?.slice(0, 8)}${facet || view === 'ridge' ? ` · 已选 ${selectedItems.length} 项，第 ${page + 1}/${pageCount} 页` : ''}` } }] };
    } }), [view, revision, page, model, viewName, samples, all.length, facet, selectedItems.length, pageCount, heatSamples.length, items.length, chartHeight, style, transform]);
  const tableItems = brushIds.length ? filtered.filter(item => brushIds.includes(item.id)) : filtered;
  const save = (name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a'); link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const downloadResults = (selection = all, label = 'all') => {
    const columns = ['ID','Pathway','AD_n','AD_detected','AD_rate','AD_mean','AD_median','AD_Q1','AD_Q3','NC_n','NC_detected','NC_rate','NC_mean','NC_median','NC_Q1','NC_Q3','Cliffs_delta','CI_low','CI_high','p','BH_q','revision','BH_family','scope','unit','method'];
    const rows = selection.map(item => [item.id,item.name,...['AD','NC'].flatMap(g => { const v=pathwayGroupSummary(item,samples,g); return [v.n,v.detected,v.detected/v.n,v.mean,v.median,v.q1,v.q3]; }),item.effect,...item.ci,item.pValue,item.qValue,revision,all.length,'full paired revision cohort','upstream normalized abundance; not percent',payload.statistics.method]);
    save(`diting-statistics-${label}-${revision.slice(0,8)}.csv`,pathwayCsv([columns,...rows]),'text/csv;charset=utf-8');
  };
  const displayValue = (item,index) => view === 'heatmap' ? heatmapModel.values[heatmapModel.items.findIndex(row=>row.id===item.id)][index] : transform==='log'?Math.log10(item.values[index]+1):item.values[index];
  const displayTransform = view==='heatmap' ? `log10(x+1); ${style.heatScale==='z'?'full-cohort pathway Z, ddof=0, unclipped download':'no Z'}` : transform;
  const downloadVisible = () => save(`diting-visible-samples-${revision.slice(0,8)}.csv`,pathwayCsv([
    ['ID','Pathway','Sample','Group','RawValue','DisplayValue','Transform','Revision','StatisticsScope'],
    ...items.flatMap(item=>samples.flatMap((sample,index)=> (model.group === 'all' || sample.group === model.group) ? [[item.id,item.name,sample.id,sample.group,item.values[index],displayValue(item,index),displayTransform,revision,'full paired revision cohort; BH all pathways']] : []))]),'text/csv;charset=utf-8');
  const exportRecord = () => save('diting-analysis-record.json',JSON.stringify({ revision, source: payload.preprocessing, samples: payload.samples, statistics: payload.statistics,
    selectedIds: selectedItems.map(item=>item.id), focusedId:selected?.id, currentIds:items.map(item=>item.id), page:page+1, mode,view,universe,visibleGroup:model.group,transform,displayTransform,style,search,sort,
    cohortScope:'fixed full paired revision cohort',installedDitingVersion:'unknown',heatmapReference:'full cohort log transform and per-pathway standardization; within-group sample clustering' },null,2),'application/json');
  const exportSelected = async () => {
    setExportStatus('正在导出已选通路…');
    const width = 1800, height = view === 'ridge' ? Math.max(700, selectedItems.length * 100 + 160) : Math.max(700, Math.ceil(selectedItems.length / 2) * 380);
    const ok = await exportEChart({ getWidth: () => width, getHeight: () => height, getOption: () => option }, { format: 'svg', fileName: `diting-${view}-selected${selectedItems.length}-${revision.slice(0, 8)}`,
      minWidth: width, maxWidth: width, minHeight: height, maxHeight: height, prepareOption: () => ({ ...buildPathwayOption({ ...model, style: { ...style, fullNames: true }, items: selectedItems, width, height: height - 40 }), tooltip: { show: false },
        graphic: [{ type: 'text', left: 30, bottom: 10, style: { fill: '#637487', fontSize: 11, text: `DiTing 标准化丰度 · 已选 ${selectedItems.length} 项完整分面 · 可见组 ${model.group} / ${transform} · 独立轴（山脊共用轴） · 全队列全表 BH ${all.length} 项 · 版本 ${revision.slice(0, 8)}` } }] }) });
    setExportStatus(ok ? '已选通路完整分面已导出' : '导出失败，请重试');
  };
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={query.refetch} />;
  if (!all.length) return <EmptyState message="当前版本没有可展示的通路。" />;
  const tools = <ChartStyleToolbar label="图形样式" fields={styleFields(view, style)} values={style} onChange={preferences.update} onReset={preferences.reset} />;
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  return <div className="diting-workspace chart-plain">

    {target ? createPortal(tools, target) : tools}
    <section className="diting-research-context" aria-label="通路研究范围与对象状态">
      <p>固定分析队列 {samples.length} 人：AD {samples.filter(s=>s.group==='AD').length}、NC {samples.filter(s=>s.group==='NC').length}。当前可见组：{mode==='effects'||view==='coverage'?'AD / NC（当前图固定显示完整比较）':group==='all'?'AD / NC':group}；统计比较始终基于完整 AD/NC 队列，BH 校正全部 {all.length} 项。</p>
      <p>候选匹配 {filtered.length} 项 · 对象池已选 {selectedItems.length} 项 · 当前图 {items.length} 项 · 聚焦：{selected?.name || '无'}。搜索仅查找候选，不自动改变已选集合；切换模块与图形保留对象池。</p>
      {!filtered.length && <p role="status">搜索无匹配；{items.length ? '仍展示已选对象，图像不属于当前搜索结果。' : '对象池为空。'}<button type="button" onClick={()=>update({pathwayQuery:null})}>清空搜索</button></p>}
      <div className="diting-selection-actions">{[['overview','ditingOverview','概览'],['effects','ditingEffects','组间效应'],['distribution','ditingDistribution','样本分布']].map(([key,chart,label])=><button type="button" className="analysis-button" aria-pressed={mode===key} key={key} onClick={()=>update({chart})}>同一对象池：{label}</button>)}
        {mode!=='distribution' && <button type="button" className="analysis-button" onClick={()=>update({pathwayUniverse:universe?'pool':'all'})}>{universe?'返回对象池视图':'单独查看全部指标概览'}</button>}
      </div>
      <p>{universe?'当前为独立的全部指标概览；对象池仍保留，分布页使用对象池。':'当前图使用共享对象池。'}本批全零 {all.filter(i=>i.values.every(v=>v===0)).length} 项、低检出（含全零，非零样本＜10%）{all.filter(i=>i.values.filter(v=>v>0).length/samples.length<.1).length} 项、全部样本检出 {all.filter(i=>i.values.every(v=>v>0)).length} 项；{all.filter(i=>i.qValue<.05).length} 项 q＜0.05，最小 q {prob(Math.min(...all.map(i=>i.qValue)))}；无显著结果仍可探索，不自动放宽阈值。</p>
      <p>这些是 DiTing 生物地球化学功能指标，不是完整 KEGG 通路目录或 AD 专用功能集；非零不证明完整通路存在或活跃。上游标准化丰度不是百分比，不能相加解释为组成。<a href="https://github.com/xuechunxu/DiTing" target="_blank" rel="noreferrer">功能范围与来源</a></p>
    </section>
    <div className="diting-toolbar">
      <label className="diting-search">搜索通路<input type="search" value={search} placeholder="英文原名、指标 ID 或原名中的基因文本" aria-label="搜索通路候选" onChange={event => update({ pathwayQuery: event.target.value })} /></label>
      <label>排序<StyledSelect value={sort} onChange={e => update({ pathwaySort: e.target.value })} aria-label="通路排序"><option value="mean">平均丰度</option><option value="effect">效应量绝对值</option><option value="q">FDR q 值</option></StyledSelect></label>
      <label>快捷选取数量<StyledSelect value={limit} onChange={e => update({ pathwayLimit:e.target.value })} aria-label="通路展示数量">{[15,30,50,95].map(n=><option key={n} value={n}>Top {n}</option>)}</StyledSelect></label>
      <button type="button" className="analysis-button" onClick={()=>setPool(filtered.slice(0,limit).map(item=>item.id))}>按候选排序替换为 Top {limit}</button>
      <label>聚焦通路<StyledSelect value={selected?.id || ''} onChange={e=>focusItem(e.target.value)} aria-label="选择研究通路"><option value="" disabled>对象池为空</option>{selectedItems.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</StyledSelect></label>
      {mode !== 'effects' && view !== 'coverage' && <label>显示分组<StyledSelect value={group} onChange={e => update({ pathwayGroup: e.target.value, pathwaySample: '' })} aria-label="通路显示分组"><option value="all">AD / NC</option><option value="AD">AD</option><option value="NC">NC</option></StyledSelect></label>}
    </div>
    <div className="chart-stat-strip chart-stat-strip--compact">
      <span className="chart-stat-item"><b>分析样本</b><span className="chart-stat-value">{samples.length}</span><span>AD {samples.filter(s => s.group === 'AD').length} / NC {samples.filter(s => s.group === 'NC').length}</span></span>
      <span className="chart-stat-item"><b>功能指标</b><span className="chart-stat-value">{all.length}</span><span>全零 {all.filter(item => item.values.every(value => value === 0)).length} 项</span></span>
      <span className="chart-stat-item"><b>当前展示</b><span className="chart-stat-value">{items.length}/{universe ? all.length : selectedItems.length}</span><span>{universe ? '全部指标概览' : '共享对象池'}</span></span>
      <span className="chart-stat-item"><b>全表 BH q &lt; 0.05</b><span className="chart-stat-value">{all.filter(item => item.qValue < .05).length}</span></span>
    </div>
    <SegmentedControl className="diting-view-switch" aria-label="通路图形类型">{PATHWAY_VIEWS[mode].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key}
      onClick={() => { setBrushIds(EMPTY); update({ [VIEW_KEYS[mode]]: key }); }}>{label}</button>)}</SegmentedControl>
    {view === 'dumbbell' && <SegmentedControl aria-label="组均值坐标变换">{[['log', 'log10(x + 1)'], ['raw', '原始丰度']].map(([key, label]) => <button key={key} type="button" aria-pressed={transform === key} onClick={() => update({ pathwayTransform: key })}>{label}</button>)}</SegmentedControl>}
    {<>
      <details className="diting-selection"><summary>共享通路对象池 · 已选 {selectedItems.length} 项</summary>
        <div className="diting-selection-actions"><button type="button" className="analysis-button" disabled={!filtered.length} onClick={() => setPool([...new Set([...selectedItems.map(item=>item.id),...filtered.map(item=>item.id)])])}>加入全部候选</button>
          <button type="button" className="analysis-button" disabled={!selected} onClick={() => setPool([selected.id])}>仅当前通路（替换对象池）</button><button type="button" className="analysis-button" onClick={()=>setPool([])}>清空对象池</button><span>每页 {PAGE_SIZE} 项，支持全部 95 项；单项分面独立丰度轴，山脊共用丰度轴。</span></div>
        <div className="diting-selection-list">{filtered.map(item => <label key={item.id}><input type="checkbox" aria-label={`选择 ${item.name}`} checked={selectedItems.some(row => row.id === item.id)} onChange={() => toggleSelection(item)} />{item.name}</label>)}</div>
      </details>
      {mode === 'distribution' && <div className="diting-distribution-controls">
        <SegmentedControl aria-label="通路丰度变换">{[['log', 'log10(x + 1)'], ['raw', '原始丰度']].map(([key, label]) => <button key={key} type="button" aria-pressed={transform === key} onClick={() => update({ pathwayTransform: key })}>{label}</button>)}</SegmentedControl>
        {view !== 'ridge' && <label>定位样本<StyledSelect value={highlighted} onChange={e => update({ pathwaySample: e.target.value })} aria-label="定位通路样本"><option value="">全部样本</option>{heatSamples.map(sample => <option key={sample.id} value={sample.id}>{sample.id} · {sample.group}</option>)}</StyledSelect></label>}
        {selectedItems.length > 1 && <button type="button" className="analysis-button" onClick={exportSelected}>导出全部已选通路 SVG</button>}
      </div>}
      {mode === 'distribution' && pageCount > 1 && <div className="diting-pagination" aria-label="通路分面分页"><button type="button" className="analysis-button" disabled={page === 0} onClick={() => update({ pathwayPage: page - 1, pathway: selectedItems[(page-1)*PAGE_SIZE].id })}>上一页</button>
        <span>第 {page + 1}/{pageCount} 页 · {selectedItems.length} 项</span><button type="button" className="analysis-button" disabled={page + 1 === pageCount} onClick={() => update({ pathwayPage: page + 1, pathway: selectedItems[(page+1)*PAGE_SIZE].id })}>下一页</button></div>}
      {items.map(item => distributionStatus({ ...item, values: heatSamples.map(sample=>item.values[sample.index]) }) ? <p className="diting-caption diting-data-note" key={item.id}>{item.name}：{distributionStatus({ ...item, values: heatSamples.map(sample=>item.values[sample.index]) })}</p> : null)}
    </>}
    {selected && <section className="diting-focused-summary" aria-label="聚焦通路统计摘要"><h3>{selected.name}</h3>
      <p>p={prob(selected.pValue)}；BH q={prob(selected.qValue)}（全队列全部 {all.length} 项）；Cliff’s δ={selected.effect.toFixed(4)}，是跨组样本高低的概率差，不是倍数变化；未调整协变量。</p>
      {['AD','NC'].map(g=>{const v=pathwayGroupSummary(selected,samples,g);return <p key={g}>{g}：n={v.n}，检出 {v.detected}/{v.n}（{(v.detected/v.n*100).toFixed(2)}%），均值 {fmt(v.mean)}，中位数 {fmt(v.median)}，四分位 [{fmt(v.q1)}, {fmt(v.q3)}]。</p>;})}
      {highlighted && samples.some(s=>s.id===highlighted) && <p>定位样本：{highlighted} · {samples.find(s=>s.id===highlighted)?.group} · 原值 {fmt(selected.values[samples.findIndex(s=>s.id===highlighted)])}</p>}
      <button type="button" className="analysis-button" onClick={()=>{update({functionKind:'pathway',functionObject:selected.name,functionScope:JSON.stringify({mode:'cohort',groups:[],sampleCodes:[]})});setFunctionOpen(selected.id);}}>查看聚焦通路相关 KO 与原值证据</button>
    </section>}
    <p className="diting-caption">{captions[view]}{view === 'heatmap' ? style.heatScale === 'z' ? ' 数值先 log10(x + 1)，再按通路计算全队列 Z；转置不改变标准化方向，颜色截断 ±3；不能跨指标比较绝对丰度，指标聚类与标准化参照完整队列，组内样本聚类不能证明 AD/NC 自然分离。' : ' 颜色为 log10(x + 1)，未做总量闭合。' : ''}</p>
    {exportStatus && <p className="diting-caption" role="status">{exportStatus}</p>}
    {!items.length ? <EmptyState message="通路对象池为空，请从候选列表加入通路。" /> : <ResearchChartSurface key={`${slug}:${revision}:${view}:${items.map(item => item.id).join(',')}`} option={option} world={world}
      label={`DiTing ${viewName}`} resetKey={`${view}:${items.map(item => item.id).join(',')}:${group}:${transform}:${style.clustering}:${style.transposed}`} facet={facet} height={chartHeight}
      onSelect={onSelect} onBrush={['coverage', 'significance', 'forest', 'dumbbell'].includes(view) ? onBrush : undefined} exportSpec={exportSpec} />}
    <div className="diting-downloads"><button type="button" onClick={()=>downloadResults(selectedItems,'selected')}>导出当前已选通路统计</button><button type="button" onClick={downloadVisible}>导出当前所见样本原值</button><button type="button" onClick={exportRecord}>导出通路分析说明 JSON</button><button type="button" onClick={()=>downloadResults()}>导出全部通路统计</button><a href={`${apiBase}${base}/download/pathways`}>下载通路原表</a><a href={`${apiBase}${base}/download/ko`}>下载 KO 原表</a></div>
    {brushIds.length > 0 && <p className="diting-caption">框选定位 {brushIds.length} 项 · <button className="diting-row-link" type="button" onClick={() => setBrushIds(EMPTY)}>清除框选定位（保留对象池）</button><button type="button" onClick={()=>setPool([...new Set([...selectedItems.map(item=>item.id),...brushIds])])}>将框选项加入对象池</button></p>}
    <ResultDisclosure title="完整通路结果" summary={`${tableItems.length} 项 · ${brushIds.length ? '框选定位' : '与搜索和排序同步'}`} open={tableOpen} onToggle={e => setTableOpen(e.currentTarget.open)}>
      {tableOpen && <ClientDataTable rows={tableItems} ariaLabel="DiTing 完整通路统计" renderRow={item => <tr key={item.id}><td><button className="diting-row-link" type="button" onClick={() => openDistribution(item.id)}>{item.name}</button></td><td>{fmt(item.groups.AD.mean)}</td><td>{fmt(item.groups.NC.mean)}</td><td>{item.effect.toFixed(3)}</td><td>{item.ci.map(v => v.toFixed(3)).join(' ～ ')}</td><td>{prob(item.pValue)}</td><td>{prob(item.qValue)}</td></tr>}><thead><tr>{['通路 / 功能指标', 'AD 平均丰度', 'NC 平均丰度', 'Cliff’s δ', '95% CI', 'p 值', 'BH q 值'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead></ClientDataTable>}
    </ResultDisclosure>
    <details open={Boolean(selected && functionOpen === selected.id)} onToggle={e=>setFunctionOpen(e.currentTarget.open ? selected?.id || null : null)}><summary>KO 与通路证据联动（固定全队列）</summary>{selected && functionOpen === selected.id && <FunctionExploration slug={slug} revision={revision} pathwayId={selected?.name} fixedCohort />}</details>
    <details className="diting-method"><summary>数据与计算说明</summary><p>DiTing 提供的 {all.length} 项生物地球化学通路及功能指标，保留上游标准化丰度原值。指标可能共享基因，不能相加解释为总丰度百分比；与 AD 的关系需要结合具体研究问题解释。</p>
      <p>两组比较采用双侧 Mann–Whitney U 检验，处理并列秩；Cliff’s δ 表示随机取一个 AD 与一个 NC 样本时丰度高低的概率差。95% 区间采用组内 1,000 次 bootstrap（固定种子 20261016）；BH 校正覆盖全部 {all.length} 项。bootstrap 区间不是全表同时区间，是否跨零不能替代 BH q 判断。搜索、选择、框选、分面分页、变换和平滑仅影响展示，不改变 p/q 结果。当前模型未调整年龄、性别等协变量。</p>
      <p>非零样本以数值 &gt; 0 定义。小提琴、雨云和山脊使用零边界反射高斯核密度，带宽为稳健经验规则乘以所选平滑系数；轮廓按组峰值缩放。恒定值不绘制密度。ECDF 完整保留零值与并列值。</p>
      <p>KO 原表含 {payload.preprocessing.standardKoCount.toLocaleString()} 个标准 KO 和 {payload.preprocessing.additionalFunctionalGenes.length} 个附加功能基因标识；附加标识保留在原表。DiTing 安装版本未注明。</p>
      <p>通路 SHA256：<code>{payload.preprocessing.pathwaySha256}</code></p><p>分析版本：<code>{revision}</code></p>
    </details>
  </div>;
}
