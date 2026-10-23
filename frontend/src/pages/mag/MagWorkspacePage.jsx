import StyledSelect from '../../components/ui/StyledSelect';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import {
  getMagDatasets,
  getMagReleases,
  getMagDistribution,
  getMagFeatures,
  getMagOverview,
  getMagQuality,
  getMagSamples,
  getMagTaxonomy,
  magDownloadUrl,
} from '../../api/mag';
import AppShell from '../../components/layout/AppShell';
import MainWorkspace from '../../components/layout/MainWorkspace';
import ChartFrame from '../../components/Charts/ChartFrame';
import ProjectionDisclosure from '../../components/analysisScope/ProjectionDisclosure';
import AnalysisDomainNav from '../../components/dataset/AnalysisDomainNav';
import ChartNav from '../../components/dataset/ChartNav';
import DatasetSummary from '../../components/dataset/DatasetSummary';
import DataTableViewport, { QUERY_TABLE_PAGE_SIZE } from '../../components/data-display/DataTableViewport';
import PaginationControls from '../../components/data-display/PaginationControls';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';
import TopBar from '../../components/layout/TopBar';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import MagFeatureTable, { MAG_COLUMNS } from './MagFeatureTable';
import MagProcessingFlow from './MagProcessingFlow';
import MagDatasetDescription from './MagDatasetDescription';
import MagHeatmapWorkspace from './MagHeatmapWorkspace';
import MagCatalogExplorer from './MagCatalogExplorer';
import MagDetailDrawer from './MagDetailDrawer';
import MagResearchPlans from './MagResearchPlans';
import MagSearchInput, { MagEntityPicker } from './MagSearchInput';
import { getMagComparisonSelection } from './magComparisonSelection';
import { MagCandidateBrowser, MagChartControls, MagChartExportMenu, MagColumnSettings, MagListSort } from './MagToolbar';
import './mag-workspace.css';

const MagChart = lazy(() => import('./MagCharts'));
const MagLineageView = lazy(() => import('./MagLineageView'));
const MagSourceResults = lazy(() => import('./MagSourceResults'));
const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const DEFAULT_SCOPE = { disease: '', gender: '', batch: '', ageMin: '', ageMax: '', abundanceThresholdPercent: '0' };
const MAG_VIEWS = [
  { key: 'features', label: '丰度与候选列表', subtitle: '候选 MAG 的组均值、效应量与 FDR' },
  { key: 'distribution', label: '单 MAG 分布', subtitle: '单个 MAG 的组间分布与样本明细' },
  { key: 'heatmap', label: '样本丰度热图', subtitle: '筛选 MAG 的样本丰度与变化模式' },
  {
    key: 'taxonomy',
    label: 'MAG 分类',
    subtitle: 'GTDB 分类层级中的 MAG 数量与占比',
    capability: 'taxonomy',
    requirement: '当前数据版本需包含与代表 MAG 一一对应的 GTDB 分类表。',
  },
  {
    key: 'function',
    label: 'MAG 功能注释',
    subtitle: 'MAG 携带的 KO、CAZyme、ARG 与 BGC',
    capability: 'function',
    requirement: 'ARG、BGC 等结果按各自的来源和处理状态接入。',
  },
  {
    key: 'quality',
    label: 'MAG 质量',
    subtitle: 'CheckM2 完整度、污染率与组装质量',
    capability: 'quality',
    requirement: '当前数据版本需包含与代表 MAG 一一对应的 CheckM2 质量表。',
  },
  {
    key: 'lineage',
    label: '来源与去冗余',
    subtitle: 'dRep 代表关系、来源追溯与物种映射',
    capability: 'lineage',
    requirement: '当前数据版本需包含已核验的 dRep 成员及代表关系。',
  },
  { key: 'phylogeny', label: '系统发育树', subtitle: 'IQ-TREE 最终树与 MAG 叶节点', capability: 'phylogeny' },
  { key: 'mapping', label: '映射与丰度阈值', subtitle: '样本映射比例与阈值统计' },
];
const SAMPLE_SCOPED_VIEWS = new Set(['features', 'distribution', 'heatmap', 'mapping']);
const TAXONOMY_RANKS = [
  ['domain', '域'], ['phylum', '门'], ['class', '纲'], ['order', '目'],
  ['family', '科'], ['genus', '属'], ['species', '种'],
];

function viewsForCapabilities(capabilities) {
  return MAG_VIEWS.map(item => item.capability && !(item.capability === 'function' ? capabilities?.metabolism || capabilities?.arg || capabilities?.bgc : capabilities?.[item.capability])
    ? { ...item, status: 'planned' }
    : item);
}

function ScopeForm({ value, options, onApply }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const field = name => ({ value: draft[name], onChange: e => setDraft({ ...draft, [name]: e.target.value }) });
  const submit = event => {
    event.preventDefault();
    if (draft.ageMin !== '' && draft.ageMax !== '' && Number(draft.ageMin) > Number(draft.ageMax)) {
      setError('最低年龄不能大于最高年龄。'); return;
    }
    setError(''); onApply(draft);
  };
  return <form className="analysis-filter-form" onSubmit={submit} aria-label="MAG 样本筛选">
    <label>疾病分组<StyledSelect {...field('disease')}><option value="">AD + NC</option><option>AD</option><option>NC</option></StyledSelect></label>
    {options.genders.length > 0 && <label>性别<StyledSelect {...field('gender')}><option value="">全部</option>{options.genders.map(g => <option key={g}>{g}</option>)}</StyledSelect></label>}
    {options.batches.length > 0 && <label>HPC_Batch<StyledSelect {...field('batch')}><option value="">全部批次</option>{options.batches.map(b => <option key={b}>{b}</option>)}</StyledSelect></label>}
    {options.ageMin != null && <label>最低年龄<input type="number" min="0" max="120" step="any" placeholder={options.ageMin} {...field('ageMin')} /></label>}
    {options.ageMax != null && <label>最高年龄<input type="number" min="0" max="120" step="any" placeholder={options.ageMax} {...field('ageMax')} /></label>}
    <label>丰度阈值（%）<input type="number" min="0" max="100" step="any" required {...field('abundanceThresholdPercent')} /></label>
    <button type="submit" className="analysis-button analysis-button--primary">应用筛选</button>
    <button type="button" className="analysis-button" onClick={() => { setDraft(DEFAULT_SCOPE); setError(''); onApply(DEFAULT_SCOPE); }}>重置</button>
    {error ? <span role="alert">{error}</span> : null}
  </form>;
}

function Audit({ audit, params, catalog = false }) {
  return <details className="mag-audit">
    <summary>方法、样本范围与运行时输入溯源</summary>
    {catalog ? <p>输入 {audit.version} · {audit.magCount} 个代表 MAG 组成完整目录。此处统计分类或质量证据，不执行样本分组丰度检验。</p> : <><p>输入 {audit.version} · {audit.sampleCount} 个样本进入当前分析，排除 {audit.excludedSampleCount} 个。分组字段：{audit.groupField}。</p>
    <p>丰度单位 %；阈值统计定义：丰度严格大于 {audit.filters.abundanceThresholdPercent}%。该阈值不代表生物学检出界限。检验族：{audit.testedFeatureCount} 个 MAG。</p></>}
    {audit.upstreamGeneration ? <p>上游生成：{audit.upstreamGeneration.tool} {audit.upstreamGeneration.toolVersion} · {audit.upstreamGeneration.mapper} · minimum covered fraction {audit.upstreamGeneration.minimumCoveredFraction} · {audit.upstreamGeneration.outputFormat} 输出。依据：{audit.upstreamGeneration.basis}。</p> : null}
    <ul>{audit.warnings.filter(w => !catalog || (!w.includes('全部为 100%') && !w.includes('少于 2'))).map(w => <li key={w}>{w}</li>)}</ul>
    <p>数据指纹：<code>{audit.dataFingerprint}</code></p>
    <p>分析版本：{audit.analysisVersion}；请求指纹：<code>{audit.requestFingerprint}</code></p>
    <p>矩阵行和核验容差 {audit.mappingTolerancePercentPoints} 个百分点；实测最大偏差 {number(audit.maxMappingErrorPercentPoints)}。</p>
    <details><summary>当前样本 ID（{audit.sampleIds.length}）</summary><p>{audit.sampleIds.join(', ') || '无样本'}</p></details>
    <ul>{audit.sources.map(source => <li key={source.file}><code>{source.file}</code><br /><code>SHA-256: {source.sha256}</code></li>)}</ul>
    <a className="analysis-button" href={magDownloadUrl('provenance', params)} download>下载分析溯源 JSON</a>
  </details>;
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 16v5h16v-5" /></svg>;
}

function SampleTable({ items, distribution = false }) {
  return <DataTableViewport ariaLabel="MAG 样本数据" className={distribution ? 'mag-sample-table' : ''} resizable>
    <thead><tr>{['样本 ID', 'disease', '年龄', '性别', 'HPC_Batch', ...(distribution ? ['丰度 %'] : ['映射 %', '未映射 %', '超过阈值的 MAG 数'])].map(v => <th scope="col" key={v}>{v}</th>)}</tr></thead>
    <tbody>{items.map(s => <tr key={s.sampleId}>
      <td>{s.sampleId}</td><td>{s.disease}</td><td>{s.age}</td><td>{s.gender}</td><td>{s.batch}</td>
      {distribution ? <td>{number(s.abundancePercent)}</td> : <><td>{number(s.mappedPercent)}</td><td>{number(s.unmappedPercent)}</td><td>{s.aboveThresholdMagCount}</td></>}
    </tr>)}</tbody>
  </DataTableViewport>;
}

function DistributionSummary({ data }) {
  const row = data.feature;
  return <section className="mag-distribution-summary" aria-label="所选 MAG 证据摘要">
    <div className="mag-stat-grid">
      <span><strong>{number(row.adMeanPercent)} / {number(row.ncMeanPercent)}%</strong> AD / NC 均值</span>
      <span><strong>{number(row.adMedianPercent)} / {number(row.ncMedianPercent)}%</strong> AD / NC 中位数</span>
      <span><strong>{number(row.adAboveThresholdPercent)} / {number(row.ncAboveThresholdPercent)}%</strong> AD / NC 丰度 &gt; {data.provenance.filters.abundanceThresholdPercent}% 的样本比例</span>
      <span><strong>{number(row.rankBiserial)}</strong> 秩效应量（正值：AD 较高）</span>
      <span><strong>{number(row.qValue)}</strong> BH-FDR q · 检验族 {data.provenance.testedFeatureCount} 个 MAG</span>
      <span><strong>{number(row.completenessPercent)}% / {number(row.contaminationPercent)}%</strong> 完整度 / 污染率</span>
    </div>
    <p className="mag-muted">当前范围：AD {data.provenance.groupCounts.AD} 个样本，NC {data.provenance.groupCounts.NC} 个样本；散点包含零丰度样本。组间检验未做协变量校正。</p>
  </section>;
}

function WorkspaceResults({ overview, scope, view, setView, selectedMag, setSelectedMag, onDetail, heatmapCandidate, onHeatmapCandidate, onScopeChange }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [sortBy, setSortBy] = useState('meanPercent');
  const [direction, setDirection] = useState('desc');
  const [chartSortBy, setChartSortBy] = useState('meanPercent');
  const [topN, setTopN] = useState(20);
  const [comparisonZoomToolbarTarget, setComparisonZoomToolbarTarget] = useState(null);
  const [taxonomyRank, setTaxonomyRank] = useState('phylum');
  const [taxonSelection, setTaxonSelection] = useState(null);
  const [brushSelection, setBrushSelection] = useState([]);
  const [format, setFormat] = useState('svg');
  const [size, setSize] = useState('standard');
  const columnStorageKey = `admeta:mag:columns:${overview.provenance.dataFingerprint}`;
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(columnStorageKey));
      if (Array.isArray(saved)) return ['magId', ...MAG_COLUMNS.map(column => column.key).filter(key => key !== 'magId' && saved.includes(key))];
    } catch { /* Use all columns when preferences are unavailable. */ }
    return MAG_COLUMNS.map(column => column.key);
  });
  useEffect(() => {
    try { localStorage.setItem(columnStorageKey, JSON.stringify(visibleColumns)); }
    catch { /* Column controls remain usable without browser storage. */ }
  }, [columnStorageKey, visibleColumns]);
  const params = { ...scope, revision: overview.provenance.dataFingerprint };
  const staticParams = { revision: overview.provenance.dataFingerprint };
  const featureParams = { ...params, query, sortBy, direction, limit: QUERY_TABLE_PAGE_SIZE, offset: (page - 1) * QUERY_TABLE_PAGE_SIZE };
  const featuresEnabled = view === 'features' || view === 'distribution';
  const features = useQuery({ queryKey: ['mag', 'features', featureParams], queryFn: ({ signal }) => getMagFeatures(featureParams, { signal }), enabled: featuresEnabled, placeholderData: previous => previous });
  const chartParams = { ...params, query, sortBy: chartSortBy, direction: 'desc', limit: topN, offset: 0 };
  const comparison = useQuery({ queryKey: ['mag', 'comparison', chartParams], queryFn: ({ signal }) => getMagComparisonSelection(chartParams, { signal }), enabled: view === 'features', placeholderData: previous => previous });
  useEffect(() => {
    if (view === 'distribution' && !selectedMag && features.data?.items[0]) setSelectedMag(features.data.items[0].magId);
  }, [view, selectedMag, features.data, setSelectedMag]);
  const magId = selectedMag || features.data?.items[0]?.magId || '';
  const distribution = useQuery({ queryKey: ['mag', 'distribution', params, magId], queryFn: ({ signal }) => getMagDistribution(magId, params, { signal }), enabled: view === 'distribution' && Boolean(magId) });
  const mapping = useQuery({ queryKey: ['mag', 'samples', params], queryFn: ({ signal }) => getMagSamples(params, { signal }), enabled: view === 'mapping' });
  const taxonomy = useQuery({ queryKey: ['mag', 'taxonomy', staticParams.revision, taxonomyRank], queryFn: ({ signal }) => getMagTaxonomy({ ...staticParams, rank: taxonomyRank, topN: 20 }, { signal }), enabled: view === 'taxonomy' });
  const quality = useQuery({ queryKey: ['mag', 'quality', staticParams.revision], queryFn: ({ signal }) => getMagQuality(staticParams, { signal }), enabled: view === 'quality' });
  if (view === 'heatmap') return <MagHeatmapWorkspace key={heatmapCandidate || 'saved'} params={params} overview={overview} initialMagId={heatmapCandidate} onSelect={onDetail} />;
  if (view === 'lineage') return <Suspense fallback={<LoadingState message="正在加载来源与去冗余视图..." />}><MagLineageView overview={overview} initialMagId={selectedMag} onDetail={onDetail} /></Suspense>;
  if (view === 'phylogeny' || (view === 'function' && (overview.capabilities.metabolism || overview.capabilities.arg || overview.capabilities.bgc))) return <Suspense fallback={<LoadingState />}><MagSourceResults overview={overview} scope={scope} view={view} initialMagId={selectedMag} onDetail={onDetail} onNavigate={(next, id) => { setSelectedMag(id); setView(next); }} scopeControls={<ScopeForm value={scope} options={overview.options} onApply={onScopeChange} />} /></Suspense>;
  if (view === 'roadmap' || view === 'function') return <MagResearchPlans capabilities={overview.capabilities} />;
  const active = { features: comparison, distribution, taxonomy, quality, mapping }[view];
  const data = active.data;
  const audit = data?.provenance || overview.provenance;
  const selectionError = view === 'distribution' && !magId ? features.error : null;
  const sampleScoped = SAMPLE_SCOPED_VIEWS.has(view);
  const empty = (sampleScoped && (overview.provenance.sampleCount === 0 || audit.sampleCount === 0))
    || (view === 'features' && data?.items.length === 0)
    || (view === 'distribution' && !magId && !features.isPending)
    || (view === 'taxonomy' && data?.items.length === 0)
    || (view === 'quality' && data?.items.length === 0);
  const downloadParams = { ...params, query, sortBy, direction, chartSortBy, view, topN, magId, limit: QUERY_TABLE_PAGE_SIZE, offset: (page - 1) * QUERY_TABLE_PAGE_SIZE };
  const auditParams = sampleScoped ? downloadParams : { ...staticParams, view, rank: taxonomyRank, topN: 20 };
  const changeSort = event => { setSortBy(event.target.value); setDirection(event.target.value === 'qValue' || event.target.value === 'magId' ? 'asc' : 'desc'); setPage(1); };
  const selectMag = onDetail;
  const currentTaxon = taxonSelection?.rank === taxonomyRank ? taxonSelection.label : '';
  const onBrush = ids => setBrushSelection(previous => previous.join('|') === ids.join('|') ? previous : ids);
  const title = MAG_VIEWS.find(item => item.key === view).label;
  const selectedTaxonomy = data?.feature ? `${data.feature.taxonomyName || 'GTDB 分类未解析'}${data.feature.taxonomyRank ? `（${TAXONOMY_RANKS.find(([key]) => key === data.feature.taxonomyRank)?.[1]}级）` : ''}` : '';
  const subtitle = view === 'features' ? '按当前样本范围与 MAG 搜索结果选取 Top N 或全部 MAG，比较 AD / NC 组平均相对丰度；列表分页和列表排序不改变图表。'
    : view === 'distribution' ? '展示所选 MAG 在当前样本范围内的丰度分布；箱体为四分位范围，须为 1.5×IQR 范围内最远观测；散点包含该范围内全部样本，未做对数变换。'
      : view === 'taxonomy' ? `按所选 GTDB 分类层级统计全部 ${audit.magCount} 个代表 MAG；显示 Top 20，其余合并为“其他分类”。不受样本筛选影响。`
          : view === 'quality' ? `每个点代表一个 MAG；完整度和污染率来自 ${data?.method || 'CheckM2'}${data?.version ? ` ${data.version}` : ''}，覆盖当前代表 MAG 目录。`
            : '映射比例与超过所设丰度阈值的 MAG 数；该阈值不是生物学检出界限，映射比例也不是覆盖度、完整度或污染度。';
  const controls = <div className="analysis-controls">
    {(view === 'features' || view === 'distribution') ? <form className="analysis-filter-form mag-shared-search" aria-label="搜索 MAG" onSubmit={e => { e.preventDefault(); setQuery(draftQuery.trim()); setPage(1); }}>
      <label>MAG 搜索<MagSearchInput revision={params.revision} label="MAG 搜索" value={draftQuery} onChange={setDraftQuery}
        onSelect={value => { setQuery(value); setPage(1); }} placeholder="输入 MAG ID 或 GTDB 分类名称" /></label>
      <button type="submit" className="analysis-button">搜索</button>
      <div className="mag-search-context" role="status">{query ? <><span>搜索：<strong>{query}</strong> · {features.isFetching ? '查询中…' : `${features.data?.total ?? 0} 个 MAG`}</span>
        <button type="button" className="analysis-button" onClick={() => { setDraftQuery(''); setQuery(''); setPage(1); }}>清除搜索</button></> : <span>{view === 'features' ? '搜索应用于丰度图和结果列表' : '搜索 MAG 候选；保留当前所选 MAG'}</span>}</div>
    </form> : null}
    {view === 'taxonomy' ? <label>分类层级 <StyledSelect aria-label="分类层级" value={taxonomyRank} onChange={e => setTaxonomyRank(e.target.value)}>{TAXONOMY_RANKS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</StyledSelect></label> : null}
    {view !== 'features' && view !== 'distribution' ? <div className="analysis-downloads">
      <label>图像格式 <StyledSelect value={format} onChange={e => setFormat(e.target.value)}><option value="svg">SVG 矢量</option><option value="png">PNG（2×）</option></StyledSelect></label>
      <label>导出尺寸 <StyledSelect value={size} onChange={e => setSize(e.target.value)}><option value="standard">标准 ≥1100×640</option><option value="large">大图 ≥1800×1000</option></StyledSelect></label>
      {view !== 'features' && !active.isError && !selectionError ? view === 'taxonomy'
        ? <a className="analysis-button" href={magDownloadUrl('taxonomy', staticParams)} download>下载完整分类 CSV</a>
        : view === 'quality'
          ? <a className="analysis-button" href={magDownloadUrl('quality', staticParams)} download>下载完整质量 CSV</a>
          : <>
            <a className="analysis-button" href={magDownloadUrl('features', downloadParams)} download>下载全部候选 CSV</a>
            <a className="analysis-button" href={magDownloadUrl(view === 'mapping' ? 'samples' : 'matrix', params)} download>{view === 'mapping' ? '下载样本映射与阈值 CSV' : '下载所选样本 × 全部 MAG'}</a>
          </> : null}
    </div> : null}
  </div>;
  const displayedFeatures = empty ? 0 : view === 'features' ? (data?.items.length || 0)
    : view === 'distribution' ? (data ? 1 : 0)
      : view === 'taxonomy' ? (data?.totalMagCount || 0)
          : view === 'quality' ? (data?.items.length || 0)
            : audit.magCount;
  const disclosure = !sampleScoped ? <div className="mag-catalog-context"><strong>代表 MAG 目录</strong><span>{audit.magCount} 个 MAG · 分类、质量证据不受样本筛选影响</span></div> : <ProjectionDisclosure data={{ scope: { mode: audit.excludedSampleCount ? 'subset' : 'cohort' }, featureLabel: 'MAG',
    dataSemantics: { abundanceScale: sampleScoped ? '相对丰度（%）' : '不适用', normalization: !sampleScoped ? '不适用' : '保留上游百分比，未再次标准化' },
    projection: { kind: view === 'distribution' ? 'mag_distribution' : 'mag', sampleCount: audit.sampleCount, groupCounts: audit.groupCounts, sourceFeatureCount: audit.magCount,
      returnedFeatureCount: displayedFeatures, truncatedFeatureCount: audit.magCount - displayedFeatures } }} />;
  return <ChartFrame title={title} subtitle={subtitle} layout="document" controls={controls}
    refreshing={view === 'features' && comparison.isFetching && !comparison.isPending}
    loadingState={<LoadingState message="正在读取 MAG 数据并计算所选范围..." />}
    loading={!empty && (active.isPending || (view === 'distribution' && !magId && features.isPending))}
    error={(active.error || selectionError)?.message} onRetry={() => { active.refetch(); if (featuresEnabled) features.refetch(); }} empty={empty}
    disclosure={view === 'features' || view === 'distribution' ? null : disclosure} audit={<Audit audit={audit} params={auditParams} catalog={!sampleScoped} />}>
    {data ? <>
      {view === 'features' ? <CollapsibleResultSection title="MAG 丰度对比" storageKey="admeta:mag:comparison:fold"
        className="mag-comparison-section"
        controls={<MagChartControls topN={topN} chartSortBy={chartSortBy} onTopNChange={setTopN} onRankChange={setChartSortBy}
          matchedCount={data.total ?? audit.magCount} loading={comparison.isFetching} />}
        renderChartActions={actions => <MagChartExportMenu actions={actions} format={format} size={size} onFormatChange={setFormat} onSizeChange={setSize}
          pngLabel="PNG（按图形尺寸适配）" note="导出当前完整展示集合，不含导航面板。大量 MAG 的 PNG 会适配像素尺寸；保留矢量细节请选择 SVG。" />}>
        {disclosure}
        <div className="mag-heatmap-navigation" ref={setComparisonZoomToolbarTarget} />
        <Suspense fallback={<LoadingState />}><MagChart view={view} data={data} format={format} size={size} onSelect={selectMag} toolbarTarget={comparisonZoomToolbarTarget} /></Suspense>
      </CollapsibleResultSection> : view === 'distribution' ? <CollapsibleResultSection title="MAG 分布与证据" storageKey="admeta:mag:distribution:fold" className="mag-distribution-section"
        actions={<><button type="button" className="analysis-button" onClick={() => { onHeatmapCandidate(magId); setView('heatmap'); }}>加入热图候选</button>
          {overview.capabilities?.lineage ? <button type="button" className="analysis-button" onClick={() => setView('lineage')}>查看该 MAG 来源与去冗余</button> : null}</>}
        controls={<div className="mag-distribution-picker">
          <label>选择 MAG<MagEntityPicker revision={params.revision} label="选择 MAG" value={magId} onChange={setSelectedMag} /></label>
          <MagCandidateBrowser sortBy={sortBy} direction={direction} onSortChange={changeSort} onDirectionChange={value => { setDirection(value); setPage(1); }}
            total={features.data?.total} page={page} loading={features.isFetching} error={features.error?.message} onRetry={features.refetch}
            pagination={features.data ? <PaginationControls page={page} pageCount={Math.ceil(features.data.total / QUERY_TABLE_PAGE_SIZE)} onPageChange={setPage} disabled={features.isFetching} ariaLabel="MAG 候选分页" /> : null}
            downloads={<><a className="analysis-button" href={magDownloadUrl('features', downloadParams)} download>下载全部候选 CSV</a>
              <a className="analysis-button" href={magDownloadUrl('matrix', params)} download>下载所选样本 × 全部 MAG</a></>} />
        </div>}
        renderChartActions={actions => <MagChartExportMenu actions={actions} format={format} size={size} onFormatChange={setFormat} onSizeChange={setSize} ariaLabel="单 MAG 分布操作" />}>
        {disclosure}
        <div className="mag-distribution-identity" role="group" aria-label="当前 MAG 标识">
          <h4>{data.feature.magId}</h4>
          <p>{selectedTaxonomy}</p>
        </div>
        <Suspense fallback={<LoadingState />}><MagChart view={view} data={data} format={format} size={size} onSelect={selectMag} /></Suspense>
        <DistributionSummary data={data} />
      </CollapsibleResultSection> : <Suspense fallback={<LoadingState />}><MagChart view={view} data={data} format={format} size={size}
        onSelect={view === 'taxonomy' ? label => setTaxonSelection({ rank: taxonomyRank, label }) : view === 'quality' ? selectMag : undefined}
        onBrush={view === 'quality' ? onBrush : undefined} selected={view === 'quality' ? brushSelection : undefined} /></Suspense>}
      {view === 'distribution' && features.error ? <ErrorState message={`MAG 列表加载失败：${features.error.message}`} onRetry={features.refetch} /> : null}
      {view === 'features' ? <CollapsibleResultSection title="MAG 结果列表" storageKey="admeta:mag:results:fold" className="result-section--table"
        summary={features.data ? `${features.data.total} 个 MAG · ${page} / ${Math.max(1, Math.ceil(features.data.total / QUERY_TABLE_PAGE_SIZE))} 页` : '正在读取列表'}
        actions={<><MagListSort sortBy={sortBy} direction={direction} onSortChange={changeSort} onDirectionChange={value => { setDirection(value); setPage(1); }} />
          <MagColumnSettings value={visibleColumns} onChange={setVisibleColumns} />
          <a className="analysis-button" href={magDownloadUrl('features', downloadParams)} download aria-label="下载全部候选 CSV" title="下载全部候选 CSV">
          <DownloadIcon />候选 CSV</a>
          <a className="analysis-button" href={magDownloadUrl('matrix', params)} download aria-label="下载所选样本 × 全部 MAG" title="下载所选样本 × 全部 MAG">
            <DownloadIcon />丰度矩阵</a></>}>
        {features.error ? <ErrorState message={`MAG 列表加载失败：${features.error.message}`} onRetry={features.refetch} /> : null}
        {features.isPending ? <LoadingState message="正在读取 MAG 结果列表..." /> : null}
        {features.data ? <>
        {features.isPlaceholderData && features.isFetching ? <p className="mag-muted" role="status">正在加载第 {page} 页，暂时保留上一版列表。</p> : null}
        <MagFeatureTable data={features.data} onSelect={selectMag} page={page} visibleColumns={visibleColumns}
          description={`检验族 ${features.data.provenance.testedFeatureCount} 个 MAG · 搜索与排序不重新计算 q 值 · 图表${topN === 0 ? '全部匹配' : ' Top'} ${data.items.length} 个 MAG，独立于列表分页`}
          pagination={<PaginationControls page={page} pageCount={Math.ceil(features.data.total / QUERY_TABLE_PAGE_SIZE)} onPageChange={setPage} disabled={features.isFetching} ariaLabel="MAG 列表分页" />} />
        </> : null}
      </CollapsibleResultSection> : null}
      {view === 'distribution' ? <CollapsibleResultSection title="样本丰度明细" storageKey="admeta:mag:distribution-samples:fold" className="result-section--table"
        summary={`${data.samples.length} 个样本 · AD ${audit.groupCounts.AD} / NC ${audit.groupCounts.NC}`}>
        <SampleTable items={data.samples} distribution />
      </CollapsibleResultSection> : null}
      {view === 'mapping' ? <><div className="mag-stat-grid" aria-label="映射证据摘要">
        {['AD', 'NC'].map(group => { const rows = data.items.filter(row => row.disease === group); const average = key => rows.length ? rows.reduce((total, row) => total + row[key], 0) / rows.length : null;
          return <span key={group}><strong>{group} · {rows.length} 样本</strong>平均映射 {number(average('mappedPercent'))}% · 平均超阈值 {number(average('aboveThresholdMagCount'))} 个 MAG</span>; })}
      </div>{new Set(data.items.map(row => row.aboveThresholdMagCount)).size <= 1 && <p className="mag-inline-notice">当前所有样本的超阈值数量相同，关系图不提供数量差异信息。自动视图展示映射分布；点的纵向微移仅用于避开重叠，不表示数值差异。</p>}
      <p>丰度阈值：丰度 &gt; {audit.filters.abundanceThresholdPercent}%（严格大于）；仅用于阈值统计，不代表生物学检出。映射比例不等于单 MAG 覆盖广度。</p><SampleTable items={data.items} /></> : null}
      {view === 'taxonomy' ? <div className="mag-stat-grid" aria-label="MAG 分类统计">
        <span><strong>{data.distinctTaxonCount}</strong> 个所选层级分类</span>
        <span><strong>{data.resolvedMagCount}</strong> 个已解析</span>
        <span><strong>{data.unresolvedMagCount}</strong> 个未解析至该层级</span>
        <span><strong>{data.method}</strong>{data.version ? ` ${data.version}` : '（版本待补）'}</span>
      </div> : null}
      {view === 'taxonomy' ? <><div className="mag-research-chart__actions"><span>点击分类柱查看对应 MAG；占比以完整代表目录为分母。</span>
        {currentTaxon && <button type="button" className="analysis-button" onClick={() => setTaxonSelection(null)}>清除分类选择</button>}</div>
        <MagCatalogExplorer revision={staticParams.revision} kind="taxonomy" rank={taxonomyRank} taxon={currentTaxon}
          shownTaxa={data.items.filter(item => item.label !== '其他分类').map(item => item.label)} onSelect={onDetail} /></> : null}
      {view === 'quality' ? <><div className="mag-stat-grid" aria-label="MAG 质量统计">
        <span><strong>{data.summary.totalMagCount}</strong> 个代表 MAG</span>
        <span><strong>{data.summary.referenceBandCount}</strong> 个位于参考区间</span>
        <span><strong>{number(data.summary.completenessMinPercent)}–{number(data.summary.completenessMaxPercent)}%</strong> 完整度</span>
        <span><strong>{number(data.summary.contaminationMinPercent)}–{number(data.summary.contaminationMaxPercent)}%</strong> 污染率</span>
      </div><p className="mag-inline-notice">{data.referenceBand.label}；图中阈值不替代包含 rRNA/tRNA 等条件的完整 MIMAG 质量标准。</p>
        <MagCatalogExplorer revision={staticParams.revision} kind="quality" selected={brushSelection} onSelect={onDetail} /></> : null}
    </> : null}
  </ChartFrame>;
}

function readEvidenceReturn() {
  try {
    const shared = JSON.parse(new URLSearchParams(window.location.search).get('magFn') || 'null');
    if (/^[a-f0-9]{64}$/.test(shared?.release || '') && typeof shared.datasetKey === 'string') {
      return { datasetKey: shared.datasetKey, release: shared.release, scope: { ...DEFAULT_SCOPE, ...shared.scope }, view: 'function', selectedMag: shared.state?.focusedMag || '' };
    }
  } catch { /* Ignore malformed shared links. */ }
  try { return JSON.parse(sessionStorage.getItem('admeta:evidence:mag-return') || 'null') || {}; } catch { return {}; }
}

export default function MagWorkspacePage({ datasets = [], onDatasetChange, onDomainChange }) {
  const resultsStart = useRef(null);
  const [restored] = useState(readEvidenceReturn);
  const [scope, setScope] = useState(restored.scope || DEFAULT_SCOPE);
  const [selectedMag, setSelectedMag] = useState(restored.selectedMag || '');
  const [detailMag, setDetailMag] = useState(restored.detailMag || '');
  const [detailContext, setDetailContext] = useState({});
  const [heatmapCandidate, setHeatmapCandidate] = useState(restored.heatmapCandidate || '');
  const [view, setView] = useState(restored.view || 'features');
  useEffect(() => { try { sessionStorage.removeItem('admeta:evidence:mag-return'); } catch { /* Optional browser storage. */ } }, []);
  const [release, setRelease] = useState(restored.release || '');
  const cohorts = useQuery({ queryKey: ['mag', 'datasets'], queryFn: ({ signal }) => getMagDatasets({ signal }) });
  const defaultDataset = cohorts.data?.items?.find(item => item.key === cohorts.data?.defaultDataset)?.key || cohorts.data?.items?.[0]?.key || '';
  const activeDataset = restored.datasetKey || defaultDataset;
  const cohortEntry = cohorts.data?.items?.find(item => item.key === activeDataset);
  const releases = useQuery({ queryKey: ['mag', 'releases', activeDataset], enabled: Boolean(activeDataset),
    queryFn: ({ signal }) => getMagReleases(activeDataset, { signal }) });
  const overviewParams = { ...scope, dataset: activeDataset, release };
  const overview = useQuery({
    queryKey: ['mag', 'overview', overviewParams],
    queryFn: ({ signal }) => getMagOverview(overviewParams, { signal }),
    enabled: Boolean(activeDataset),
    placeholderData: (previous, previousQuery) => {
      const prior = previousQuery?.queryKey?.[2];
      return prior?.dataset === activeDataset && prior?.release === release ? previous : undefined;
    },
    retry: (failureCount, error) => failureCount < 1 && error instanceof ApiError && ['timeout', 'network'].includes(error.kind),
  });
  const audit = overview.data?.provenance;
  const linkedResults = Object.values(audit?.communityResults || (release ? {} : cohortEntry?.communityResults) || {});
  const cohortDatasets = datasets.filter(item => linkedResults.some(result => result.datasetSlug === item.slug));
  const views = viewsForCapabilities(overview.data?.capabilities);
  const readyLabels = [
    '丰度分析',
    overview.data?.capabilities?.taxonomy ? 'MAG分类' : null,
    overview.data?.capabilities?.quality ? 'MAG质量' : null,
    overview.data?.capabilities?.lineage ? '来源与去冗余' : null,
    overview.data?.capabilities?.arg ? 'ARG' : null,
    overview.data?.capabilities?.metabolism ? 'KO / CAZyme / MEROPS' : null,
    overview.data?.capabilities?.bgc ? 'BGC' : null,
    overview.data?.capabilities?.phylogeny ? '系统发育树' : null,
    '技术质控',
  ].filter(Boolean).join('、');
  const pendingLabels = [
    overview.data && !overview.data.capabilities?.taxonomy ? 'MAG分类' : null,
    overview.data && !overview.data.capabilities?.quality ? 'MAG质量' : null,
    overview.data && !overview.data.capabilities?.lineage ? '来源与去冗余' : null,
    '独立外部队列验证',
  ].filter(Boolean).join('、');
  const summary = audit ? {
    featureKind: 'mag',
    featureLabel: 'MAG',
    totalSamples: audit.sampleCount,
    totalFeatures: audit.magCount,
    adSamples: audit.groupCounts.AD,
    ncSamples: audit.groupCounts.NC,
  } : null;
  const magRun = {
    key: audit?.dataFingerprint || 'mag',
    name: audit ? (cohortEntry?.name || audit.datasetKey) : 'MAG 分析结果加载中',
    sampleCount: audit?.sampleCount || 0,
  };
  const topbar = <TopBar
    featureKind="mag"
    summary={summary}
    workspaceSubtitle="MAG 解析"
    runs={releases.data?.items?.length ? releases.data.items.map(item => ({ key: item.key, name: cohortEntry?.name || activeDataset, sampleCount: audit?.processing?.sampleCount || 0 })) : [magRun]}
    runsLoading={overview.isPending}
    runsError={overview.error?.message || null}
    activeRun={magRun}
    activeArtifact={summary ? { sampleCount: summary.totalSamples } : null}
    onRunChange={value => { setRelease(value); setDetailMag(''); setSelectedMag(''); setScope(DEFAULT_SCOPE); setHeatmapCandidate(''); }}
  />;
  const sidebar = <aside className="sidebar" data-scroll-region="sidebar">
    <section className="sidebar-section"><div className="sidebar-section__header"><h3 className="sidebar-heading">数据概览</h3><span className="sidebar-section__status">当前队列</span></div>
      {cohorts.error && <p role="alert">{cohorts.error.message}</p>}
      <DatasetSummary summary={summary} />
    </section>
    <section className="sidebar-section"><div className="sidebar-section__header"><h3 className="sidebar-heading">分析模块</h3><span className="sidebar-section__status">稳定入口</span></div>
      <AnalysisDomainNav datasets={cohortDatasets} featureKind="mag" activeDomainKey="mag"
        onDatasetChange={slug => onDatasetChange?.(slug, linkedResults.find(result => result.datasetSlug === slug))} onDomainChange={onDomainChange} />
    </section>
    <section className="sidebar-section sidebar-section--navigation"><h3 className="sidebar-heading">分析导航</h3>
      <ChartNav charts={views} activeChart={view} featureKind="mag" onChange={setView} />
      <button type="button" className={`nav-item ${view === 'roadmap' ? 'nav-item--active' : ''}`} onClick={() => setView('roadmap')}><span className="nav-item-label">研究拓展</span><span className="nav-item-hint">已规划，待完成 · 查看证据补充模板</span></button>
    </section>
    <section className="sidebar-section"><h3 className="sidebar-heading">HPC_Batch 分组构成</h3><p className="mag-muted">筛选不是协变量校正；留意批次内组别比例。</p>
      {overview.data ? <DataTableViewport ariaLabel="批次分组构成"><thead><tr><th>批次</th><th>AD</th><th>NC</th></tr></thead><tbody>{overview.data.batches.map(b => <tr key={b.batch}><td>{b.batch}</td><td>{b.AD}</td><td>{b.NC}</td></tr>)}</tbody></DataTableViewport> : null}
    </section>
    <div className="mag-readiness" aria-label="MAG 模块数据就绪度">
      <strong>数据就绪度</strong>
      <span><i className="mag-readiness__dot mag-readiness__dot--ready" aria-hidden="true" />已接入：{readyLabels}</span>
      <span><i className="mag-readiness__dot" aria-hidden="true" />待核验：{pendingLabels}</span>
      {overview.data && !overview.data.capabilities?.metabolism && <span><i className="mag-readiness__dot" aria-hidden="true" />待接入：MAG 层面的 KO / CAZyme 等结果</span>}
    </div>
  </aside>;
  return <AppShell tone="mag" topbar={topbar} sidebar={sidebar} main={<MainWorkspace chartKey="mag">
    <div className="analysis-workspace-stack mag-workspace">
      {cohorts.error || (cohorts.isSuccess && !activeDataset) ? <ErrorState message={cohorts.error?.message || '尚未导入 MAG 原文件。请复制 raw 数据并执行队列导入。'} onRetry={cohorts.refetch} /> : overview.isPending ? <LoadingState message="正在准备 MAG 数据与样本范围，首次加载可能需要一些时间..." /> : overview.error ? <ErrorState message={overview.error.message} onRetry={overview.refetch} /> : <>
        <MagDatasetDescription key={`data-${audit.dataFingerprint}`} provenance={audit} capabilities={overview.data.capabilities} cohort={cohortEntry} pending={overview.isPlaceholderData} />
        <MagProcessingFlow key={`flow-${audit.dataFingerprint}`} provenance={audit} capabilities={overview.data.capabilities}
          onNavigate={target => { setView(target); requestAnimationFrame(() => resultsStart.current?.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })); }}
          onCommunityNavigate={onDatasetChange ? link => onDatasetChange(link.datasetSlug, link) : undefined} />
        <div ref={resultsStart} className="mag-results-anchor" />
        {SAMPLE_SCOPED_VIEWS.has(view) ? <section className="mag-filter-panel"><ScopeForm value={scope} options={overview.data.options} onApply={setScope} />
          <p className="mag-muted">丰度阈值只用于“超过阈值”的比例和数量统计，不定义生物学检出；原始丰度和组间检验保持不变。年龄、性别、批次均在同一筛选范围内比较。</p>
        </section> : ['lineage', 'roadmap', 'function', 'phylogeny'].includes(view) ? null : <section className="mag-filter-panel"><p className="mag-muted">当前为 MAG 级注释视图，覆盖全部 {audit.magCount} 个代表 MAG，不使用 disease、年龄、性别、批次或丰度阈值筛选。</p></section>}
        {SAMPLE_SCOPED_VIEWS.has(view) && audit.warnings.filter(w => w.includes('全部为 100%') || w.includes('少于 2')).map(w => <p className="mag-inline-notice" key={w}>{w}</p>)}
        <WorkspaceResults key={JSON.stringify([scope, audit.dataFingerprint])} overview={overview.data} scope={scope} view={view} setView={setView} selectedMag={selectedMag} setSelectedMag={setSelectedMag}
          onDetail={(id, context = {}) => { setDetailContext(context); setDetailMag(id); }} heatmapCandidate={heatmapCandidate} onHeatmapCandidate={setHeatmapCandidate} onScopeChange={setScope} />
        {detailMag && <MagDetailDrawer key={`${audit.dataFingerprint}:${detailMag}`} magId={detailMag} overview={overview.data} scope={scope} onClose={() => setDetailMag('')}
          initialTab={detailContext.tab || (restored.detailMag === detailMag ? restored.detailTab : 'abundance')}
          initialFeatureId={detailContext.featureId || ''} initialNamespace={detailContext.namespace || 'kofam_ko'}
          onEvidenceOpen={detailTab => { try { sessionStorage.setItem('admeta:evidence:mag-return', JSON.stringify({ datasetKey: activeDataset, release: audit.dataFingerprint, scope, selectedMag, detailMag, heatmapCandidate, view, detailTab })); } catch { /* Navigation still works. */ } }}
          onNavigate={(next, id) => { setSelectedMag(id); if (next === 'heatmap') setHeatmapCandidate(id); setView(next); setDetailMag(''); }} />}
      </>}
    </div>
  </MainWorkspace>} />;
}
