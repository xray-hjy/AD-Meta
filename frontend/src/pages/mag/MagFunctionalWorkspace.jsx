import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagFunctions, magFunctionDownloadUrl } from '../../api/mag';
import ChartFrame from '../../components/Charts/ChartFrame';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';
import DataTableViewport from '../../components/data-display/DataTableViewport';
import PaginationControls from '../../components/data-display/PaginationControls';
import StyledSelect from '../../components/ui/StyledSelect';
import SlidingTabs from '../../components/ui/SlidingTabs';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import { ToolbarPopover } from './MagToolbar';
import MagFunctionalChart from './MagFunctionalChart';
import MagFunctionalSources from './MagFunctionalSources';
import { functionMatrixOption, functionOverviewOption, functionBarOption, signalOption, themeEvidenceOption, comparisonDistributionOption } from './magFunctionOptions';
import './mag-functional.css';

const DEFAULTS = { namespace: 'kofam_ko', query: '', magQuery: '', magLimit: 40, featureLimit: 30, featureIds: '', magIds: '',
  valueKind: 'presence', rowOrder: 'taxonomy', columnOrder: 'rank', minCompleteness: '', maxContamination: '' };
const fmt = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const names = { kofam_ko: 'KO', kofam_ec: 'EC', dbcan_family: 'CAZyme 家族', dbcan_subfamily: 'CAZyme 亚家族',
  dbcan_substrate: '底物预测', merops_family: 'MEROPS 家族', merops_id: 'MEROPS 命中', dram_db: 'DRAM HMM' };
function load(key, initialMagId, hasDram) {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { /* Optional state. */ }
  try {
    const shared = JSON.parse(new URLSearchParams(window.location.search).get('magFn') || 'null');
    if (shared?.release && key.endsWith(shared.release)) saved = shared.state;
  } catch { /* Invalid links do not replace saved selections. */ }
  const applied = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof saved?.applied?.[key] === typeof DEFAULTS[key]) applied[key] = saved.applied[key];
  }
  if (!names[applied.namespace]) applied.namespace = DEFAULTS.namespace;
  return { applied, tab: ['matrix', 'overview', 'themes', 'arg', 'bgc', 'signals'].includes(saved?.tab) ? saved.tab : hasDram ? 'matrix' : 'arg',
    feature: typeof saved?.feature === 'string' ? saved.feature : '', comparison: Array.isArray(saved?.comparison) ? saved.comparison.filter(v => typeof v === 'string') : [],
    focusedMag: initialMagId || (typeof saved?.focusedMag === 'string' ? saved.focusedMag : ''), page: Number.isInteger(saved?.page) && saved.page > 0 ? saved.page : 1,
    carrierPage: Number.isInteger(saved?.carrierPage) && saved.carrierPage > 0 ? saved.carrierPage : 1 };
}

function CountPanel({ value, max, noun, onApply, close }) {
  const [draft, setDraft] = useState(value);
  const valid = Number.isInteger(Number(draft)) && draft >= 1 && draft <= max;
  return <form className="mag-top-n-settings" onSubmit={e => { e.preventDefault(); if (valid) { onApply(Number(draft)); close(); } }}>
    <p className="mag-top-n-settings__context">选择展示{noun}数量 · 上限 {max}</p>
    <div className="mag-top-n-settings__presets">{[10, 20, 30, 40, 60, 100, 200].filter(n => n <= max).map(n => <button className="analysis-button" type="button" key={n} onClick={() => setDraft(n)} aria-pressed={Number(draft) === n}>{n}</button>)}</div>
    <label className="mag-top-n-settings__number">自定义<input type="number" min="1" max={max} value={draft} onChange={e => setDraft(e.target.value)} aria-label={`展示${noun}数量`} /></label>
    <input className="mag-top-n-settings__slider" type="range" min="1" max={max} value={draft || 1} onChange={e => setDraft(e.target.value)} aria-label={`${noun}数量滑条`} />
    <div className="mag-top-n-settings__footer"><button className="analysis-button" type="button" onClick={() => setDraft(max)}>全部匹配</button><button className="analysis-button analysis-button--primary" type="submit" disabled={!valid}>确认数量</button></div>
  </form>;
}

function CountControl({ value, max, noun, onChange }) {
  return <div className="mag-inline-field">{noun}<ToolbarPopover label={`${value} ${noun === 'MAG' ? '个' : '项'} ⌄`} title={`展示${noun}数量`} ariaLabel={`展示${noun}数量`} className="mag-top-n-popover" fitViewport>
    {close => <CountPanel value={value} max={Math.max(1, Math.min(1000, max))} noun={noun} onApply={onChange} close={close} />}
  </ToolbarPopover></div>;
}

function QueryState({ query, children }) {
  if (query.error) return <ErrorState message={query.error.message} onRetry={query.refetch} />;
  if (query.isPending) return <LoadingState />;
  return children;
}

function SignalPanel({ revision, namespace, scope, featureId, search = '' }) {
  const [kind, setKind] = useState('carriers'), [page, setPage] = useState(1), [selected, setSelected] = useState(featureId || '');
  const params = { revision, ...scope, namespace, kind, featureId: selected, query: search, offset: (page - 1) * 25, limit: 25 };
  const query = useQuery({ queryKey: ['mag', 'functional-signals', params], queryFn: ({ signal }) => getMagFunctions('signals', params, { signal }) });
  const chartData = query.data && { ...query.data, samples: query.data.samples };
  return <>
    <p className="mag-overview-note">样本范围沿用当前 MAG 工作区。此处是代表 MAG 丰度加权代理量，单位和原始群落 KO 不同；检验以样本为单位，BH 校正在本命名空间全部功能上计算。</p>
    <label className="mag-inline-field">派生量<StyledSelect value={kind} onChange={e => setKind(e.target.value)}><option value="carriers">携带功能的 MAG 丰度和</option><option value="copies">MAG 丰度加权基因计数</option></StyledSelect></label>
    <QueryState query={query}>{chartData && <>
      {selected && <CollapsibleResultSection title={`${selected} · 样本代理量分布`} storageKey="admeta:mag:signals:fold"><MagFunctionalChart kind="signals" data={chartData} buildOption={signalOption} /></CollapsibleResultSection>}
      <CollapsibleResultSection title="派生信号结果" summary={`${query.data.total} 项 · 检验族 ${query.data.testFamily}`} actions={<a className="analysis-button" href={magFunctionDownloadUrl('signals', { revision, ...scope, namespace, signalKind: kind, query: search })}>完整匹配 CSV</a>}>
        <DataTableViewport ariaLabel="功能派生信号" pagination={<PaginationControls page={page} pageCount={Math.ceil(query.data.total / 25)} onPageChange={setPage} ariaLabel="派生信号分页" />}>
          <thead><tr><th>功能</th><th>AD 均值</th><th>NC 均值</th><th>秩效应量</th><th>BH q</th></tr></thead><tbody>{query.data.items.map(r => <tr key={r.featureId}><td><button type="button" className="mag-functional-link" onClick={() => setSelected(r.featureId)}>{r.featureId}</button></td><td>{fmt(r.adMean)}</td><td>{fmt(r.ncMean)}</td><td>{fmt(r.effect)}</td><td>{fmt(r.qValue)}</td></tr>)}</tbody>
        </DataTableViewport></CollapsibleResultSection>
    </>}</QueryState>
  </>;
}

function CommunityPanel({ revision, featureId }) {
  const query = useQuery({ queryKey: ['mag', 'functional-community', revision, featureId],
    queryFn: ({ signal }) => getMagFunctions('community', { revision, featureId }, { signal }) });
  const build = (data, style) => signalOption({ ...data, samples: data.items }, style);
  return <CollapsibleResultSection title={`${featureId} · 原始群落 KO 对照`} summary="关联修订 · DiTing 单位" storageKey="admeta:mag:community-ko:fold">
    <QueryState query={query}>{query.data?.available ? <><MagFunctionalChart kind="community-ko" data={query.data} buildOption={build} />
      <p className="mag-muted">{query.data.meaning} 群落修订：{query.data.communityRevision}。按 KO ID 对照不等于 MAG→物种映射。</p></> : <p className="mag-muted">该 KO 在关联的群落结果中没有记录；保留当前 MAG 注释证据。</p>}</QueryState>
  </CollapsibleResultSection>;
}

function CandidateDistributions({ revision, scope, comparison, onDetail }) {
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(comparison.length / 6)));
  const params = { revision, ...scope, magIds: comparison.join(','), limit: 6, offset: (currentPage - 1) * 6 };
  const query = useQuery({ queryKey: ['mag', 'functional-comparison-distributions', params],
    queryFn: ({ signal }) => getMagFunctions('distributions', params, { signal }) });
  return <CollapsibleResultSection title="候选 MAG 样本分布" summary={`当前分面 ${currentPage} / ${Math.ceil(comparison.length / 6)} · 每页 6 项`} storageKey="admeta:mag:compare-distributions:fold"
    actions={<a className="analysis-button" href={magFunctionDownloadUrl('distributions', { revision, ...scope, magIds: comparison.join(',') })}>全部候选样本 CSV</a>}>
    <QueryState query={query}>{query.data && <MagFunctionalChart kind="comparison-distribution" data={query.data} buildOption={comparisonDistributionOption}
      onSelect={row => { if (row?.magId) onDetail(row.magId); }} label="当前分面的候选 MAG 箱线及全样本散点" />}</QueryState>
    <PaginationControls page={currentPage} pageCount={Math.ceil(comparison.length / 6)} onPageChange={setPage} ariaLabel="候选分布分面分页" />
    <p className="mag-muted">每项使用独立的原始百分比坐标，箱体与须由后端计算；全部样本含零值。图像导出当前分面，样本 CSV 覆盖全部候选。</p>
  </CollapsibleResultSection>;
}

export default function MagFunctionalWorkspace({ overview, scope, initialMagId = '', onDetail, onNavigate, scopeControls }) {
  const revision = overview.provenance.dataFingerprint, hasDram = Boolean(overview.capabilities.metabolism);
  const key = `admeta:mag:functional:${revision}`;
  const [saved] = useState(() => load(key, initialMagId, hasDram));
  const [applied, setApplied] = useState(saved.applied), [draft, setDraft] = useState(saved.applied), [tab, setTab] = useState(saved.tab);
  const [feature, setFeature] = useState(saved.feature), [focusedMag, setFocusedMag] = useState(saved.focusedMag);
  const [page, setPage] = useState(saved.page), [carrierPage, setCarrierPage] = useState(saved.carrierPage), [carrierSort, setCarrierSort] = useState('geneCount');
  const [comparison, setComparison] = useState(saved.comparison), [brush, setBrush] = useState([]), [theme, setTheme] = useState('butyrate');
  const [themeMag, setThemeMag] = useState(0);
  const [copyMessage, setCopyMessage] = useState('');
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify({ applied, tab, feature, comparison, focusedMag, page, carrierPage })); } catch { /* Optional state. */ } }, [key, applied, tab, feature, comparison, focusedMag, page, carrierPage]);
  const params = { revision, ...applied };
  const functional = useQuery({ queryKey: ['mag', 'functional-overview', revision], enabled: hasDram,
    queryFn: ({ signal }) => getMagFunctions('overview', { revision }, { signal }), staleTime: Infinity });
  const matrix = useQuery({ queryKey: ['mag', 'functional-matrix', params], enabled: hasDram && tab === 'matrix',
    queryFn: ({ signal }) => getMagFunctions('matrix', params, { signal }), placeholderData: previous => previous });
  const directoryParams = { revision, namespace: applied.namespace, query: applied.query, limit: 25, offset: (page - 1) * 25 };
  const directory = useQuery({ queryKey: ['mag', 'functional-directory', directoryParams], enabled: hasDram && ['matrix', 'overview'].includes(tab),
    queryFn: ({ signal }) => getMagFunctions('features', directoryParams, { signal }) });
  const ranking = useQuery({ queryKey: ['mag', 'functional-ranking', revision, applied.namespace, applied.query, applied.featureLimit], enabled: hasDram && tab === 'overview',
    queryFn: ({ signal }) => getMagFunctions('features', { revision, namespace: applied.namespace, query: applied.query, limit: applied.featureLimit }, { signal }) });
  const carrierParams = { revision, ...scope, namespace: applied.namespace, featureId: feature, limit: 25, offset: (carrierPage - 1) * 25, sortBy: carrierSort };
  const carriers = useQuery({ queryKey: ['mag', 'functional-carriers', carrierParams], enabled: hasDram && Boolean(feature),
    queryFn: ({ signal }) => getMagFunctions('carriers', carrierParams, { signal }) });
  const themeQuery = useQuery({ queryKey: ['mag', 'functional-theme', revision, theme, applied.magIds, applied.magLimit], enabled: hasDram && tab === 'themes',
    queryFn: ({ signal }) => getMagFunctions(`themes/${theme}`, { revision, magIds: applied.magIds, magLimit: applied.magLimit }, { signal }) });
  const compareParams = { revision, ...scope, magIds: comparison.join(',') };
  const compare = useQuery({ queryKey: ['mag', 'functional-compare', compareParams], enabled: hasDram && comparison.length > 0,
    queryFn: ({ signal }) => getMagFunctions('compare', compareParams, { signal }) });
  const tabs = [hasDram && ['matrix', '功能谱'], hasDram && ['overview', '功能总览'], hasDram && ['themes', '代谢专题'],
    overview.capabilities.arg && ['arg', 'ARG'], overview.capabilities.bgc && ['bgc', 'BGC'], hasDram && ['signals', '样本代理量']].filter(Boolean);
  const chooseFeature = id => { setFeature(id); setCarrierPage(1); };
  const openCell = item => { if (item?.magId) { setFocusedMag(item.magId); onDetail?.(item.magId, { tab: item.role === 'annotation' ? 'quality' : 'function', featureId: item.featureId || '', namespace: item.namespace || applied.namespace }); } };
  const add = ids => setComparison(current => [...new Set([...current, ...ids])]);
  const apply = e => { e.preventDefault(); setApplied({ ...draft }); setPage(1); setFeature(''); };
  const field = name => ({ value: draft[name], onChange: e => setDraft(current => ({ ...current, [name]: e.target.value })) });
  const activeNamespace = names[applied.namespace];
  const overviewData = useMemo(() => {
    if (!functional.data) return null;
    const manual = applied.magIds.split(/[,;\s]+/).filter(Boolean);
    return { ...functional.data, items: functional.data.items.filter(r =>
      (!manual.length || manual.includes(r.magId)) && (!applied.magQuery || `${r.magId} ${Object.values(r.taxonomy).join(' ')}`.toLowerCase().includes(applied.magQuery.toLowerCase())) &&
      (applied.minCompleteness === '' || (r.quality.completenessPercent != null && r.quality.completenessPercent >= Number(applied.minCompleteness))) &&
      (applied.maxContamination === '' || (r.quality.contaminationPercent != null && r.quality.contaminationPercent <= Number(applied.maxContamination)))) };
  }, [functional.data, applied]);
  const dirty = JSON.stringify(applied) !== JSON.stringify(draft);
  const copyLink = async () => {
    const url = new URL(window.location.href);
    const payload = { release: revision, datasetKey: overview.provenance.datasetKey, scope,
      state: { applied, tab, feature, focusedMag, comparison } };
    url.searchParams.set('magFn', JSON.stringify(payload));
    if (url.href.length > 16000) { setCopyMessage('选择清单过长，请下载配置与溯源保存完整条件。'); return; }
    try { await navigator.clipboard.writeText(url.href); setCopyMessage('当前功能视图链接已复制'); }
    catch { setCopyMessage('复制不可用，请通过配置与溯源保存选择。'); }
  };
  const buildBars = useMemo(() => (data, style) => functionBarOption(data.items, style), []);
  const selectAxis = event => {
    const featureAxis = event.transposed ? 'yAxis' : 'xAxis';
    if (event.axis === featureAxis && matrix.data.features.some(r => r.featureId === event.value)) chooseFeature(event.value);
    else if (matrix.data.mags.some(r => r.magId === event.value)) openCell({ magId: event.value });
  };
  return <ChartFrame title="MAG 功能注释" subtitle="围绕代表 MAG 的功能谱、样本分布与基因证据查阅。" layout="document">
    <SlidingTabs className="mag-functional-tabs" aria-label="功能分析视图">{tabs.map(([id, label]) => <button key={id} id={`mag-fn-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="mag-functional-panel" onClick={() => setTab(id)}>{label}</button>)}</SlidingTabs>
    <div id="mag-functional-panel" role="tabpanel" aria-labelledby={`mag-fn-${tab}`}>
      <div className="mag-functional-context"><strong>代表 MAG 目录</strong><span>{overview.provenance.magCount} 个 MAG</span><span>注释固定于当前发布；样本旁注沿用当前筛选。</span><button className="analysis-button" type="button" onClick={copyLink}>复制视图链接</button><span role="status">{copyMessage}</span></div>
      {scopeControls && (feature || comparison.length || tab === 'signals') ? <details className="mag-functional-sample-scope"><summary>样本统计范围 · AD {overview.provenance.groupCounts.AD} / NC {overview.provenance.groupCounts.NC}</summary>{scopeControls}<p className="mag-muted">只改变丰度旁注、候选分布和样本代理量，不改变 MAG 的固定功能注释；筛选不等于协变量校正。</p></details> : null}
      {hasDram && !['arg', 'bgc', 'themes'].includes(tab) && <form className="mag-heatmap-settings mag-functional-settings" onSubmit={apply}>
        <div className="mag-heatmap-settings__main"><label>功能库<StyledSelect {...field('namespace')}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</StyledSelect></label>
          <label>功能 ID / 描述<input {...field('query')} placeholder="搜索 KO、家族或原始描述" /></label>{tab !== 'signals' && <><label>MAG / 分类<input {...field('magQuery')} placeholder="MAG ID 或 GTDB 名称" /></label>
          <CountControl value={draft.magLimit} max={overview.provenance.magCount} noun="MAG" onChange={magLimit => setDraft(s => ({ ...s, magLimit }))} />
          <CountControl value={draft.featureLimit} max={functional.data?.report.namespaces?.[draft.namespace]?.featureCount || 1000} noun="功能" onChange={featureLimit => setDraft(s => ({ ...s, featureLimit }))} />
          <label>数值含义<StyledSelect {...field('valueKind')}><option value="presence">存在 / 本次未命中</option><option value="count">注释基因计数 · log1p 颜色</option></StyledSelect></label></>}</div>
        {tab !== 'signals' && <details><summary>高级 MAG 与功能选择</summary><div className="mag-heatmap-settings__advanced">
          <label>完整度 ≥ %<input type="number" min="0" max="100" {...field('minCompleteness')} /></label><label>污染率 ≤ %<input type="number" min="0" max="100" {...field('maxContamination')} /></label>
          <label>MAG 排列<StyledSelect {...field('rowOrder')}><option value="taxonomy">分类与 ID</option><option value="cluster">功能相似聚类</option></StyledSelect></label>
          <label>功能排列<StyledSelect {...field('columnOrder')}><option value="rank">携带 MAG 数</option><option value="id">功能 ID</option><option value="cluster">功能相似聚类</option></StyledSelect></label>
          <label>固定 MAG 清单<textarea rows="2" {...field('magIds')} placeholder="逗号或换行分隔；保留清单顺序" /></label>
          <label>固定功能清单<textarea rows="2" {...field('featureIds')} placeholder="同一命名空间内的功能 ID" /></label></div></details>}
        <div className="mag-heatmap-settings__footer"><button className="analysis-button analysis-button--primary" type="submit">应用设置</button><button className="analysis-button" type="button" onClick={() => setDraft(DEFAULTS)}>恢复默认条件</button><span role="status">{dirty ? '有未应用更改' : '设置已应用'}</span></div>
      </form>}
      {tab === 'matrix' && <QueryState query={matrix}>{matrix.data && <CollapsibleResultSection title="MAG 功能谱" summary={`${activeNamespace} · ${matrix.data.selection.shownMags} MAG × ${matrix.data.selection.shownFeatures} 功能`} storageKey="admeta:mag:functional-matrix:fold">
        <div className="mag-functional-context"><span>目录 {matrix.data.selection.catalogMags}</span><span>匹配 MAG {matrix.data.selection.matchedMags}</span><span>匹配功能 {matrix.data.selection.matchedFeatures}</span>{matrix.isFetching && <span role="status">正在更新，暂保留上次结果…</span>}</div>
        {matrix.data.mags.length && matrix.data.features.length ? <MagFunctionalChart kind="matrix" data={matrix.data} buildOption={functionMatrixOption} camera onSelect={openCell} onAxis={selectAxis} label="MAG 与功能注释矩阵" /> : <p className="mag-functional-empty">当前条件没有匹配 MAG 或功能，请调整选择。</p>}
        <div className="mag-heatmap-footer"><div className="mag-heatmap-legend"><span>浅色：本次未命中</span><span>深色：命中 / 较高计数</span><span>灰色：不可评价</span></div><details className="mag-heatmap-methods"><summary>绘图与筛选方法</summary><p>{matrix.data.methods.meaning}</p><p>{matrix.data.methods.clustering}。排列：{matrix.data.methods.rowOrder} / {matrix.data.methods.columnOrder}。</p><p>点击功能标题查看携带者，点击单元格查基因。质量轨道具有独立尺度。完整度偏低 MAG 的零命中不代表生物学不存在。</p></details></div>
      </CollapsibleResultSection>}</QueryState>}
      {tab === 'overview' && <QueryState query={functional}>{functional.data && <>
        <div className="mag-functional-context"><span>预测基因 {fmt(functional.data.report.geneCount)}</span><span>已核验命名空间 {functional.data.namespaces.length}</span><span>每个基因在联合注释比例中只计一次。</span></div>
        <CollapsibleResultSection title="MAG 注释覆盖" summary={`${overviewData.items.length} 个匹配 MAG`} storageKey="admeta:mag:functional-overview:fold"><MagFunctionalChart kind="overview" data={overviewData} buildOption={functionOverviewOption} onSelect={openCell} onBrush={setBrush} /></CollapsibleResultSection>
        {brush.length > 0 && <div className="mag-brush-results"><span>已定位 {brush.length} 个 MAG</span><button className="analysis-button" type="button" onClick={() => add(brush)}>加入比较集合</button></div>}
        <CollapsibleResultSection title={`${activeNamespace} 携带数量`} summary="全代表 MAG 目录 · 功能筛选" storageKey="admeta:mag:functional-ranking:fold"><QueryState query={ranking}>{ranking.data && <MagFunctionalChart kind="ranking" data={ranking.data} buildOption={buildBars} onSelect={r => chooseFeature(r.featureId)} />}</QueryState></CollapsibleResultSection>
      </>}</QueryState>}
      {tab === 'themes' && <>
        <form className="analysis-filter-form" onSubmit={apply}><label>专题 MAG 清单<textarea {...field('magIds')} rows="2" placeholder="留空使用代表 MAG 目录" /></label><CountControl value={draft.magLimit} max={overview.provenance.magCount} noun="MAG" onChange={magLimit => setDraft(s => ({ ...s, magLimit }))} /><button className="analysis-button analysis-button--primary" type="submit">应用专题范围</button></form>
        <div className="mag-functional-themes">{functional.data?.themes.map(r => <button className="analysis-button" type="button" key={r.id} aria-pressed={theme === r.id} onClick={() => { setTheme(r.id); setThemeMag(0); }}>{r.label}</button>)}</div>
        <QueryState query={themeQuery}>{themeQuery.data && <><p className="mag-overview-note">{themeQuery.data.theme.description} 此图为研究基因集合；不计算通路完整度。</p>
          <CollapsibleResultSection title={themeQuery.data.theme.label} summary="步骤/基因证据" storageKey="admeta:mag:themes:fold">{themeQuery.data.features.length ? <MagFunctionalChart kind="themes" data={themeQuery.data} buildOption={functionMatrixOption} camera onSelect={openCell} /> : <p className="mag-functional-empty">当前注释未提供该集合的可评价功能标识；不以其他功能替补。</p>}</CollapsibleResultSection>
          {themeQuery.data.mags.length > 0 && <CollapsibleResultSection title="单 MAG 专题基因证据" summary="各基因独立评价，不推断通路完整性" storageKey="admeta:mag:theme-evidence:fold"
            controls={<label className="mag-inline-field">MAG<StyledSelect value={Math.min(themeMag, themeQuery.data.mags.length - 1)} onChange={e => setThemeMag(Number(e.target.value))}>{themeQuery.data.mags.map((r, i) => <option key={r.magId} value={i}>{r.label} · {r.magId}</option>)}</StyledSelect></label>}>
            <MagFunctionalChart kind="theme-evidence" data={{ ...themeQuery.data, selectedIndex: Math.min(themeMag, themeQuery.data.mags.length - 1) }} buildOption={themeEvidenceOption} height={Math.max(260, Math.ceil(themeQuery.data.features.length / 3) * 80)} onSelect={openCell} />
          </CollapsibleResultSection>}
          <p className="mag-muted">定义：{themeQuery.data.theme.definitionVersion} · {themeQuery.data.theme.source}</p></>}</QueryState>
      </>}
      {['arg', 'bgc'].includes(tab) && <MagFunctionalSources key={tab} module={tab} revision={revision} overview={overview} initialMagId={focusedMag} onDetail={onDetail} />}
      {tab === 'signals' && (['kofam_ko', 'dbcan_family', 'dbcan_substrate', 'merops_family'].includes(applied.namespace)
        ? <SignalPanel key={`${applied.namespace}:${applied.query}`} revision={revision} namespace={applied.namespace} scope={scope} featureId={feature} search={applied.query} />
        : <p className="mag-overview-note">样本代理量支持 KO、CAZyme 家族/底物及 MEROPS 家族，请选择相应功能库并应用。</p>)}
      {hasDram && ['matrix', 'overview'].includes(tab) && <CollapsibleResultSection title="功能目录" summary={directory.data ? `${directory.data.total} 项 · 第 ${page} 页` : ''} storageKey="admeta:mag:functional-directory:fold"
        actions={<><a className="analysis-button" href={magFunctionDownloadUrl('features', { revision, namespace: applied.namespace, query: applied.query })}>完整目录 CSV</a><a className="analysis-button" href={magFunctionDownloadUrl('matrix', params)}>图形原始矩阵</a><a className="analysis-button" href={magFunctionDownloadUrl('matrix', { ...params, allMatches: 1 })}>全部匹配矩阵</a><a className="analysis-button" href={magFunctionDownloadUrl('provenance', params)}>配置与溯源</a></>}>
        <QueryState query={directory}><DataTableViewport ariaLabel="MAG 功能目录" pagination={<PaginationControls page={page} pageCount={Math.ceil((directory.data?.total || 0) / 25)} onPageChange={setPage} ariaLabel="功能目录分页" />}>
          <thead><tr><th>功能 ID</th><th>来源描述</th><th>携带 MAG</th><th>注释基因</th></tr></thead><tbody>{directory.data?.items.map(r => <tr key={r.featureId} aria-selected={feature === r.featureId}><td><button type="button" className="mag-functional-link" onClick={() => chooseFeature(r.featureId)}>{r.featureId}</button></td><td>{r.description || '未提供描述'}</td><td>{fmt(r.carrierCount)}</td><td>{fmt(r.geneCount)}</td></tr>)}</tbody>
        </DataTableViewport></QueryState>
      </CollapsibleResultSection>}
      {feature && ['matrix', 'overview'].includes(tab) && <>
        <CollapsibleResultSection title={`${feature} · 携带 MAG`} summary={`${carriers.data?.total ?? '…'} 个`} storageKey="admeta:mag:functional-carriers:fold"
          controls={<label className="mag-inline-field">排序<StyledSelect value={carrierSort} onChange={e => { setCarrierSort(e.target.value); setCarrierPage(1); }}><option value="geneCount">基因计数</option><option value="qValue">MAG q 值</option><option value="meanPercent">MAG 平均丰度</option><option value="magId">MAG ID</option></StyledSelect></label>}
          actions={<a className="analysis-button" href={magFunctionDownloadUrl('carriers', { revision, ...scope, namespace: applied.namespace, featureId: feature })}>完整携带者 CSV</a>}>
          <QueryState query={carriers}><DataTableViewport ariaLabel="功能携带 MAG" pagination={<PaginationControls page={carrierPage} pageCount={Math.ceil((carriers.data?.total || 0) / 25)} onPageChange={setCarrierPage} ariaLabel="携带 MAG 分页" />}>
            <thead><tr><th>MAG</th><th>分类</th><th>基因计数</th><th>AD 均值 %</th><th>NC 均值 %</th><th>MAG q</th><th>比较</th></tr></thead><tbody>{carriers.data?.items.map(r => <tr key={r.magId}><td><button className="mag-functional-link" type="button" onClick={() => openCell({ ...r, featureId: feature })}>{r.magId}</button></td><td>{r.taxonomyName}</td><td>{r.geneCount}</td><td>{fmt(r.adMeanPercent)}</td><td>{fmt(r.ncMeanPercent)}</td><td>{fmt(r.qValue)}</td><td><button className="analysis-button" type="button" onClick={() => add([r.magId])}>加入</button></td></tr>)}</tbody>
          </DataTableViewport></QueryState><p className="mag-muted">丰度与 MAG q 值沿用当前样本范围、全部代表 MAG 检验族；静态基因计数不作为疾病受试者统计。</p>
        </CollapsibleResultSection>
        {applied.namespace === 'kofam_ko' && /^K\d{5}$/.test(feature) && <CommunityPanel revision={revision} featureId={feature} />}
      </>}
      {comparison.length > 0 && <CollapsibleResultSection title="固定 MAG 比较集合" summary={`${comparison.length} 个`} storageKey="admeta:mag:functional-compare:fold" actions={<><button className="analysis-button" type="button" onClick={() => { setDraft(s => ({ ...s, magIds: comparison.join('\n'), magLimit: comparison.length })); setTab('matrix'); }}>用此集合配置功能谱</button><button className="analysis-button" type="button" onClick={() => setComparison([])}>清空集合</button></>}>
        <QueryState query={compare}><DataTableViewport ariaLabel="固定 MAG 对照"><thead><tr><th>MAG</th><th>完整度 %</th><th>污染率 %</th><th>KO 种类</th><th>AD / NC 均值 %</th><th>操作</th></tr></thead><tbody>{compare.data?.items.map(r => <tr key={r.magId}><td><button className="mag-functional-link" type="button" onClick={() => onDetail(r.magId)}>{r.magId}</button></td><td>{fmt(r.completenessPercent)}</td><td>{fmt(r.contaminationPercent)}</td><td>{r.functional.kofam_ko_unique_features}</td><td>{fmt(r.adMeanPercent)} / {fmt(r.ncMeanPercent)}</td><td><button className="analysis-button" type="button" onClick={() => onNavigate('distribution', r.magId)}>样本分布</button><button className="analysis-button" type="button" onClick={() => setComparison(s => s.filter(id => id !== r.magId))}>移除</button></td></tr>)}</tbody></DataTableViewport></QueryState>
      </CollapsibleResultSection>}
      {comparison.length > 0 && <CandidateDistributions revision={revision} scope={scope} comparison={comparison} onDetail={onDetail} />}
      {hasDram && <details className="mag-heatmap-methods"><summary>方法、功能边界与汇总核对</summary><p>注释表示编码潜力；不等于表达、代谢活性或临床结论。KO、CAZyme、ARG 和 BGC 各保留来源与计数单位。</p><p>DRAM 源运行：{functional.data?.report.runId}；汇总：{functional.data?.report.summaryRunId}。</p>
        <p>distill 单 KO 行与矩阵存在差异：{functional.data?.report.distill.differingRows} 行。专题使用已核对的基因计数，原始 distill 保留待核对；不将其零值直接解释为功能缺失。</p></details>}
    </div>
  </ChartFrame>;
}
