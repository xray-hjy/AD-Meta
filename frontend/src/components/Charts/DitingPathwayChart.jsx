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
  forest: '点为 Cliff’s δ，横线为组内重采样 95% 区间；正值表示 AD 倾向较高。实心点表示全表 BH q < 0.05，空心点表示未达到该阈值。',
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
  const [brushIds, setBrushIds] = useState(EMPTY), [tableOpen, setTableOpen] = useState(false), [exportStatus, setExportStatus] = useState('');
  const preferences = useChartStylePreferences(`diting-pathway-${mode}`), { colorBlindFriendly } = useColorVision();
  const view = PATHWAY_VIEWS[mode].some(([key]) => key === params.get(VIEW_KEYS[mode])) ? params.get(VIEW_KEYS[mode]) : PATHWAY_VIEWS[mode][0][0];
  const viewName = PATHWAY_VIEWS[mode].find(([key]) => key === view)[1];
  const search = params.get('pathwayQuery') || '', sort = params.get('pathwaySort') || (mode === 'effects' ? 'effect' : 'mean');
  const group = ['AD', 'NC'].includes(params.get('pathwayGroup')) ? params.get('pathwayGroup') : 'all';
  const transform = params.get('pathwayTransform') === 'raw' ? 'raw' : 'log', highlighted = params.get('pathwaySample') || '';
  const limit = Number(params.get('pathwayLimit')) || (['coverage', 'significance', 'heatmap'].includes(view) ? 95 : 15);
  const style = useMemo(() => ({ palette: colorBlindFriendly ? 'okabe-ito' : 'brewer-set2', heatPalette: 'blueRed', heatScale: 'z', clustering: 'both', trees: true,
    sampleLabels: false, cellBorders: false, pointSize: '6', opacity: '0.65', fontSize: '11', grid: true, hover: true, labels: false, legend: true, outline: true, reference: true,
    smoothing: '1', fullNames: false, transposed: false, ...preferences.values }), [colorBlindFriendly, preferences.values]);
  const colors = useMemo(() => { const palette = resolveResearchPalette('pathway', style); return { AD: palette.colors[1], NC: palette.colors[0] }; }, [style]);
  const update = useCallback((updates, options = { replace: true }) => setParams(current => { const next = new URLSearchParams(current);
    Object.entries(updates).forEach(([key, value]) => { if (value == null || value === '') next.delete(key); else next.set(key, String(value)); });
    return next; }, options), [setParams]);
  const base = `/api/datasets/${encodeURIComponent(slug)}/revisions/${encodeURIComponent(revision)}/diting`;
  const query = useQuery({ queryKey: ['diting-pathways', slug, revision], queryFn: ({ signal }) => fetchJson(`${base}/pathways`, { signal }),
    enabled: Boolean(slug && revision), staleTime: Infinity, retry: false });
  const payload = query.data, all = payload?.items || EMPTY;
  const samples = useMemo(() => (payload?.samples || []).map((sample, index) => ({ ...sample, index })), [payload]);
  const filtered = useMemo(() => all.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) =>
    sort === 'effect' ? Math.abs(b.effect) - Math.abs(a.effect) : sort === 'q' ? a.qValue - b.qValue || Math.abs(b.effect) - Math.abs(a.effect) : b.mean - a.mean), [all, search, sort]);
  const selected = all.find(item => item.id === params.get('pathway')) || filtered[0] || all[0];
  const selectionParam = params.get('pathways') || '';
  const selectedItems = useMemo(() => {
    const byId = new Map(all.map(item => [item.id, item]));
    const chosen = [...new Set(selectionParam.split(','))].map(id => byId.get(id)).filter(Boolean);
    return chosen.length ? chosen : selected ? [selected] : EMPTY;
  }, [selectionParam, all, selected]);
  const pageCount = Math.max(1, Math.ceil(selectedItems.length / PAGE_SIZE));
  const page = Math.min(pageCount - 1, Math.max(0, Number(params.get('pathwayPage')) || 0));
  const items = useMemo(() => mode === 'distribution' ? selectedItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : filtered.slice(0, Math.max(1, Math.min(95, limit))),
    [mode, selectedItems, page, filtered, limit]);
  const heatSamples = useMemo(() => samples.filter(sample => group === 'all' || sample.group === group), [samples, group]);
  const heatmapModel = useMemo(() => view === 'heatmap' ? prepareHeatmap(items, heatSamples, style.clustering, style.heatScale) : null, [view, items, heatSamples, style.clustering, style.heatScale]);
  const facet = mode === 'distribution' && view !== 'ridge' && items.length > 1;
  const chartHeight = facet ? Math.ceil(items.length / 2) * 360 : 620;
  const model = useMemo(() => ({ view, items, samples, style, colors, group: mode === 'effects' || view === 'coverage' ? 'all' : group, transform, highlighted, heatmapModel }),
    [view, items, samples, style, colors, mode, group, transform, highlighted, heatmapModel]);
  const option = useMemo(() => buildPathwayOption({ ...model, height: chartHeight }), [model, chartHeight]);
  const world = useMemo(() => ({ width: view === 'heatmap' ? Math.max(600, (style.transposed ? items.length : heatSamples.length) * 16) : 900,
    height: view === 'heatmap' ? Math.max(360, (style.transposed ? heatSamples.length : items.length) * 27) : ['forest', 'dumbbell'].includes(view) ? Math.max(400, items.length * 32) : view === 'ridge' ? Math.max(400, items.length * 90) : 500 }), [view, heatSamples.length, items.length, style.transposed]);
  const toggleSelection = item => {
    const ids = new Set(selectedItems.map(row => row.id)); if (ids.has(item.id)) ids.delete(item.id); else ids.add(item.id);
    if (!ids.size) ids.add(item.id);
    update({ pathways: [...ids].join(','), pathwayPage: 0, pathway: [...ids][0] });
  };
  const openDistribution = useCallback(id => update({ chart: 'ditingDistribution', pathway: id, pathways: id, pathwayPage: 0 }, { replace: false }), [update]);
  const onSelect = useCallback(data => {
    if (data?.sampleId && mode === 'distribution') { update({ pathwaySample: data.sampleId }); return; }
    if (data?.pathwayIds) { setBrushIds(data.pathwayIds); setTableOpen(true); update({ pathways: data.pathwayIds.join(','), pathway: data.pathwayIds[0], pathwayPage: 0 }); return; }
    if (data?.pathwayId) {
      if (mode === 'distribution') update({ pathway: data.pathwayId, pathways: data.pathwayId, pathwayDistribution: 'raincloud', pathwayPage: 0 });
      else openDistribution(data.pathwayId);
    }
  }, [mode, update, openDistribution]);
  const onBrush = useCallback(ids => { setBrushIds(ids); if (ids.length) { setTableOpen(true); update({ pathways: ids.join(','), pathway: ids[0], pathwayPage: 0 }); } }, [update]);
  const exportSpec = useMemo(() => ({ fileName: `diting-${view}-${revision?.slice(0, 8)}-page${page + 1}`,
    suggestedSize: { width: view === 'heatmap' ? Math.max(1600, (style.transposed ? items.length : heatSamples.length) * 9 + 580) : 1600,
      height: ['forest', 'dumbbell', 'heatmap'].includes(view) ? Math.max(700, (view === 'heatmap' && style.transposed ? heatSamples.length : items.length) * 36 + 150) : Math.max(700, chartHeight) },
    displayOption: size => buildPathwayOption({ ...model, ...size }),
    buildOption: ({ width, height }) => {
      const built = buildPathwayOption({ ...model, style: { ...style, fullNames: true }, width, height: height - 45 });
      const title = built.title || [{ text: `DiTing · ${viewName}`, left: 60, top: 6, textStyle: { fontSize: 16 } }];
      return { ...built, title, graphic: [{ type: 'text', left: 30, bottom: 8, style: { fill: '#637487', fontSize: 11,
        text: `DiTing 标准化丰度原值 · AD n=${samples.filter(s => s.group === 'AD').length} / NC n=${samples.filter(s => s.group === 'NC').length} · 全表 BH ${all.length} 项 · 版本 ${revision?.slice(0, 8)}${facet || view === 'ridge' ? ` · 已选 ${selectedItems.length} 项，第 ${page + 1}/${pageCount} 页` : ''}` } }] };
    } }), [view, revision, page, model, viewName, samples, all.length, facet, selectedItems.length, pageCount, heatSamples.length, items.length, chartHeight, style]);
  const tableItems = brushIds.length ? filtered.filter(item => brushIds.includes(item.id)) : filtered;
  const downloadResults = () => {
    const rows = [['Pathway', 'AD_mean', 'NC_mean', 'Cliffs_delta', 'CI_low', 'CI_high', 'p', 'BH_q'],
      ...all.map(item => [item.name, item.groups.AD.mean, item.groups.NC.mean, item.effect, ...item.ci, item.pValue, item.qValue])];
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `diting-pathways-${revision.slice(0, 8)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const exportSelected = async () => {
    setExportStatus('正在导出已选通路…');
    const width = 1800, height = view === 'ridge' ? Math.max(700, selectedItems.length * 100 + 160) : Math.max(700, Math.ceil(selectedItems.length / 2) * 380);
    const ok = await exportEChart({ getWidth: () => width, getHeight: () => height, getOption: () => option }, { format: 'svg', fileName: `diting-${view}-selected${selectedItems.length}-${revision.slice(0, 8)}`,
      minWidth: width, maxWidth: width, minHeight: height, maxHeight: height, prepareOption: () => ({ ...buildPathwayOption({ ...model, style: { ...style, fullNames: true }, items: selectedItems, width, height: height - 40 }), tooltip: { show: false },
        graphic: [{ type: 'text', left: 30, bottom: 10, style: { fill: '#637487', fontSize: 11, text: `DiTing 标准化丰度 · 已选 ${selectedItems.length} 项完整分面 · 全表 BH ${all.length} 项 · 版本 ${revision.slice(0, 8)}` } }] }) });
    setExportStatus(ok ? '已选通路完整分面已导出' : '导出失败，请重试');
  };
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={query.refetch} />;
  if (!all.length) return <EmptyState message="当前版本没有可展示的通路。" />;
  const tools = <ChartStyleToolbar label="图形样式" fields={styleFields(view, style)} values={style} onChange={preferences.update} onReset={preferences.reset} />;
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  return <div className="diting-workspace chart-plain">
    {target ? createPortal(tools, target) : tools}
    <div className="diting-toolbar">
      <label className="diting-search">搜索通路<input type="search" value={search} placeholder="输入通路名称或功能基因名称" onChange={event => update({ pathwayQuery: event.target.value })} /></label>
      {mode !== 'distribution' ? <>
        <label>排序<StyledSelect value={sort} onChange={e => update({ pathwaySort: e.target.value })} aria-label="通路排序"><option value="mean">平均丰度</option><option value="effect">效应量绝对值</option><option value="q">FDR q 值</option></StyledSelect></label>
        <label>展示数量<StyledSelect value={limit} onChange={e => update({ pathwayLimit: e.target.value })} aria-label="通路展示数量">{[15, 30, 50, 95].map(n => <option key={n} value={n}>{n === 95 ? '全部 95 项' : `Top ${n}`}</option>)}</StyledSelect></label>
      </> : <label className="diting-picker">研究通路<StyledSelect value={selected.id} onChange={e => update({ pathway: e.target.value, pathways: e.target.value, pathwayPage: 0 })} aria-label="选择研究通路">{[...new Map([selected, ...filtered].map(item => [item.id, item])).values()].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</StyledSelect></label>}
      {mode !== 'effects' && view !== 'coverage' && <label>显示分组<StyledSelect value={group} onChange={e => update({ pathwayGroup: e.target.value, pathwaySample: '' })} aria-label="通路显示分组"><option value="all">AD / NC</option><option value="AD">AD</option><option value="NC">NC</option></StyledSelect></label>}
    </div>
    <div className="chart-stat-strip chart-stat-strip--compact">
      <span className="chart-stat-item"><b>分析样本</b><span className="chart-stat-value">{samples.length}</span><span>AD {samples.filter(s => s.group === 'AD').length} / NC {samples.filter(s => s.group === 'NC').length}</span></span>
      <span className="chart-stat-item"><b>功能指标</b><span className="chart-stat-value">{all.length}</span><span>全零 {all.filter(item => item.values.every(value => value === 0)).length} 项</span></span>
      <span className="chart-stat-item"><b>当前展示</b><span className="chart-stat-value">{items.length}/{mode === 'distribution' ? selectedItems.length : filtered.length}</span><span>{mode === 'distribution' ? '已选通路' : '匹配指标'}</span></span>
      <span className="chart-stat-item"><b>全表 BH q &lt; 0.05</b><span className="chart-stat-value">{all.filter(item => item.qValue < .05).length}</span></span>
    </div>
    <SegmentedControl className="diting-view-switch" aria-label="通路图形类型">{PATHWAY_VIEWS[mode].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key}
      onClick={() => { setBrushIds(EMPTY); update({ [VIEW_KEYS[mode]]: key }); }}>{label}</button>)}</SegmentedControl>
    {view === 'dumbbell' && <SegmentedControl aria-label="组均值坐标变换">{[['log', 'log10(x + 1)'], ['raw', '原始丰度']].map(([key, label]) => <button key={key} type="button" aria-pressed={transform === key} onClick={() => update({ pathwayTransform: key })}>{label}</button>)}</SegmentedControl>}
    {mode === 'distribution' && <>
      <details className="diting-selection"><summary>选择分面通路 · 已选 {selectedItems.length} 项</summary>
        <div className="diting-selection-actions"><button type="button" className="analysis-button" disabled={!filtered.length} onClick={() => update({ pathways: filtered.map(item => item.id).join(','), pathwayPage: 0 })}>选择全部搜索结果</button>
          <button type="button" className="analysis-button" onClick={() => update({ pathways: selected.id, pathwayPage: 0 })}>仅当前通路</button><span>每页 {PAGE_SIZE} 项，支持全部 95 项；单项分面独立丰度轴，山脊共用丰度轴。</span></div>
        <div className="diting-selection-list">{filtered.map(item => <label key={item.id}><input type="checkbox" checked={selectedItems.some(row => row.id === item.id)} onChange={() => toggleSelection(item)} />{item.name}</label>)}</div>
      </details>
      <div className="diting-distribution-controls">
        <SegmentedControl aria-label="通路丰度变换">{[['log', 'log10(x + 1)'], ['raw', '原始丰度']].map(([key, label]) => <button key={key} type="button" aria-pressed={transform === key} onClick={() => update({ pathwayTransform: key })}>{label}</button>)}</SegmentedControl>
        {view !== 'ridge' && <label>定位样本<StyledSelect value={highlighted} onChange={e => update({ pathwaySample: e.target.value })} aria-label="定位通路样本"><option value="">全部样本</option>{heatSamples.map(sample => <option key={sample.id} value={sample.id}>{sample.id} · {sample.group}</option>)}</StyledSelect></label>}
        {selectedItems.length > 1 && <button type="button" className="analysis-button" onClick={exportSelected}>导出全部已选通路 SVG</button>}
      </div>
      {pageCount > 1 && <div className="diting-pagination" aria-label="通路分面分页"><button type="button" className="analysis-button" disabled={page === 0} onClick={() => update({ pathwayPage: page - 1 })}>上一页</button>
        <span>第 {page + 1}/{pageCount} 页 · {selectedItems.length} 项</span><button type="button" className="analysis-button" disabled={page + 1 === pageCount} onClick={() => update({ pathwayPage: page + 1 })}>下一页</button></div>}
      {items.map(item => distributionStatus(item) ? <p className="diting-caption diting-data-note" key={item.id}>{item.name}：{distributionStatus(item)}</p> : null)}
    </>}
    <p className="diting-caption">{captions[view]}{view === 'heatmap' ? style.heatScale === 'z' ? ' 数值先 log10(x + 1)，再按通路计算全队列 Z；转置不改变标准化方向，颜色截断 ±3。' : ' 颜色为 log10(x + 1)，未做总量闭合。' : ''}</p>
    {exportStatus && <p className="diting-caption" role="status">{exportStatus}</p>}
    {!items.length ? <EmptyState message="没有匹配的通路，请调整搜索词。" /> : <ResearchChartSurface key={`${slug}:${revision}:${view}:${items.map(item => item.id).join(',')}`} option={option} world={world}
      label={`DiTing ${viewName}`} resetKey={`${view}:${items.map(item => item.id).join(',')}:${group}:${transform}:${style.clustering}:${style.transposed}`} facet={facet} height={chartHeight}
      onSelect={onSelect} onBrush={['coverage', 'significance', 'forest', 'dumbbell'].includes(view) ? onBrush : undefined} exportSpec={exportSpec} />}
    <div className="diting-downloads"><button type="button" onClick={downloadResults}>导出全部通路统计</button><a href={`${apiBase}${base}/download/pathways`}>下载通路原表</a><a href={`${apiBase}${base}/download/ko`}>下载 KO 原表</a></div>
    {brushIds.length > 0 && <p className="diting-caption">框选定位 {brushIds.length} 项 · <button className="diting-row-link" type="button" onClick={() => setBrushIds(EMPTY)}>显示完整列表</button></p>}
    <ResultDisclosure title="完整通路结果" summary={`${tableItems.length} 项 · ${brushIds.length ? '框选定位' : '与搜索和排序同步'}`} open={tableOpen} onToggle={e => setTableOpen(e.currentTarget.open)}>
      {tableOpen && <ClientDataTable rows={tableItems} ariaLabel="DiTing 完整通路统计" renderRow={item => <tr key={item.id}><td><button className="diting-row-link" type="button" onClick={() => openDistribution(item.id)}>{item.name}</button></td><td>{fmt(item.groups.AD.mean)}</td><td>{fmt(item.groups.NC.mean)}</td><td>{item.effect.toFixed(3)}</td><td>{item.ci.map(v => v.toFixed(3)).join(' ～ ')}</td><td>{prob(item.pValue)}</td><td>{prob(item.qValue)}</td></tr>}><thead><tr>{['通路 / 功能指标', 'AD 平均丰度', 'NC 平均丰度', 'Cliff’s δ', '95% CI', 'p 值', 'BH q 值'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead></ClientDataTable>}
    </ResultDisclosure>
    <details className="diting-method"><summary>数据与计算说明</summary><p>DiTing 提供的 {all.length} 项生物地球化学通路及功能指标，保留上游标准化丰度原值。指标可能共享基因，不能相加解释为总丰度百分比；与 AD 的关系需要结合具体研究问题解释。</p>
      <p>两组比较采用双侧 Mann–Whitney U 检验，处理并列秩；Cliff’s δ 表示随机取一个 AD 与一个 NC 样本时丰度高低的概率差。95% 区间采用组内 1,000 次 bootstrap（固定种子 20261016）；BH 校正覆盖全部 {all.length} 项。搜索、选择、框选、分面分页、变换和平滑仅影响展示，不改变 p/q 结果。当前模型未调整年龄、性别等协变量。</p>
      <p>非零样本以数值 &gt; 0 定义。小提琴、雨云和山脊使用零边界反射高斯核密度，带宽为稳健经验规则乘以所选平滑系数；轮廓按组峰值缩放。恒定值不绘制密度。ECDF 完整保留零值与并列值。</p>
      <p>KO 原表含 {payload.preprocessing.standardKoCount.toLocaleString()} 个标准 KO 和 {payload.preprocessing.additionalFunctionalGenes.length} 个附加功能基因标识；附加标识保留在原表。DiTing 安装版本未注明。</p>
      <p>通路 SHA256：<code>{payload.preprocessing.pathwaySha256}</code></p><p>分析版本：<code>{revision}</code></p>
    </details>
  </div>;
}
