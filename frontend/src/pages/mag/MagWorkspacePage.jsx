import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getMagDistribution,
  getMagFeatures,
  getMagHeatmap,
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
import DataTableViewport from '../../components/data-display/DataTableViewport';
import PaginationControls from '../../components/data-display/PaginationControls';
import TopBar from '../../components/layout/TopBar';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';

const MagChart = lazy(() => import('./MagCharts'));
const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const DEFAULT_SCOPE = { disease: '', gender: '', batch: '', ageMin: '', ageMax: '', abundanceThresholdPercent: '0' };
const MAG_VIEWS = [
  { key: 'features', label: '丰度与候选列表', subtitle: '候选 MAG 的组均值、效应量与 FDR' },
  { key: 'distribution', label: '单 MAG 分布', subtitle: '单个 MAG 的组间分布与样本明细' },
  { key: 'heatmap', label: '样本丰度热图', subtitle: 'Top N MAG 的样本丰度模式' },
  {
    key: 'taxonomy',
    label: 'MAG 分类',
    subtitle: 'GTDB 分类层级中的 MAG 数量与占比',
    capability: 'taxonomy',
    requirement: '当前数据版本需包含与 872 个代表 MAG 一一对应的 GTDB 分类表。',
  },
  {
    key: 'function',
    label: 'MAG 功能注释',
    subtitle: 'MAG 携带的 KO、CAZyme、ARG 与 BGC',
    status: 'planned',
    requirement: '需新增并核验 MAG×KO、CAZyme、ARG、BGC 的稳定 MAG ID 映射。',
  },
  {
    key: 'quality',
    label: 'MAG 质量',
    subtitle: 'CheckM2 完整度、污染率与组装质量',
    capability: 'quality',
    requirement: '当前数据版本需包含与 872 个代表 MAG 一一对应的 CheckM2 质量表。',
  },
  {
    key: 'replication',
    label: '跨队列复现',
    subtitle: '不同队列中的效应与丰度一致性',
    status: 'planned',
    requirement: '需稳定 dRep cluster ID、至少两个独立队列及一致的分组分析口径。',
  },
  { key: 'mapping', label: '映射与丰度阈值', subtitle: '样本映射比例与阈值统计' },
];
const SAMPLE_SCOPED_VIEWS = new Set(['features', 'distribution', 'heatmap', 'mapping']);
const TAXONOMY_RANKS = [
  ['domain', '域'], ['phylum', '门'], ['class', '纲'], ['order', '目'],
  ['family', '科'], ['genus', '属'], ['species', '种'],
];

function viewsForCapabilities(capabilities) {
  return MAG_VIEWS.map(item => item.capability && !capabilities?.[item.capability]
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
    <label>疾病分组<select {...field('disease')}><option value="">AD + NC</option><option>AD</option><option>NC</option></select></label>
    <label>性别<select {...field('gender')}><option value="">全部</option>{options.genders.map(g => <option key={g}>{g}</option>)}</select></label>
    <label>HPC_Batch<select {...field('batch')}><option value="">全部批次</option>{options.batches.map(b => <option key={b}>{b}</option>)}</select></label>
    <label>最低年龄<input type="number" min="0" max="120" step="any" placeholder={options.ageMin} {...field('ageMin')} /></label>
    <label>最高年龄<input type="number" min="0" max="120" step="any" placeholder={options.ageMax} {...field('ageMax')} /></label>
    <label>丰度阈值（%）<input type="number" min="0" max="100" step="any" required {...field('abundanceThresholdPercent')} /></label>
    <button type="submit" className="analysis-button analysis-button--primary">应用筛选</button>
    <button type="button" className="analysis-button" onClick={() => { setDraft(DEFAULT_SCOPE); setError(''); onApply(DEFAULT_SCOPE); }}>重置</button>
    {error ? <span role="alert">{error}</span> : null}
  </form>;
}

function Audit({ audit, params }) {
  return <details className="mag-audit">
    <summary>方法、样本范围与运行时输入溯源</summary>
    <p>输入 {audit.version} · {audit.sampleCount} 个样本进入当前分析，排除 {audit.excludedSampleCount} 个。分组字段：{audit.groupField}。</p>
    <p>丰度单位 %；阈值统计定义：丰度严格大于 {audit.filters.abundanceThresholdPercent}%。该阈值不代表生物学检出界限。检验族：{audit.testedFeatureCount} 个 MAG。</p>
    {audit.upstreamGeneration ? <p>上游生成：{audit.upstreamGeneration.tool} {audit.upstreamGeneration.toolVersion} · {audit.upstreamGeneration.mapper} · minimum covered fraction {audit.upstreamGeneration.minimumCoveredFraction} · {audit.upstreamGeneration.outputFormat} 输出。依据：{audit.upstreamGeneration.basis}。</p> : null}
    <ul>{audit.warnings.map(w => <li key={w}>{w}</li>)}</ul>
    <p>数据指纹：<code>{audit.dataFingerprint}</code></p>
    <p>分析版本：{audit.analysisVersion}；请求指纹：<code>{audit.requestFingerprint}</code></p>
    <p>矩阵行和核验容差 {audit.mappingTolerancePercentPoints} 个百分点；实测最大偏差 {number(audit.maxMappingErrorPercentPoints)}。</p>
    <details><summary>当前样本 ID（{audit.sampleIds.length}）</summary><p>{audit.sampleIds.join(', ') || '无样本'}</p></details>
    <ul>{audit.sources.map(source => <li key={source.file}><code>{source.file}</code><br /><code>SHA-256: {source.sha256}</code></li>)}</ul>
    <a className="analysis-button" href={magDownloadUrl('provenance', params)} download>下载分析溯源 JSON</a>
  </details>;
}

function FeatureTable({ data, onSelect }) {
  return <DataTableViewport ariaLabel="MAG 候选列表，可横向滚动" maxHeight={420}>
    <thead><tr>{['MAG ID（查看分布）', '长度 bp', 'AD 均值 %', 'NC 均值 %', 'AD−NC 百分点', 'AD 超过阈值 %', 'NC 超过阈值 %', '秩效应量', 'p 值', 'BH-FDR q'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{data.items.map(row => <tr key={row.magId}>
      <td><button className="analysis-text-button" onClick={() => onSelect(row.magId)}>{row.magId}</button></td>
      {['lengthBp', 'adMeanPercent', 'ncMeanPercent', 'meanDifferencePercentPoints', 'adAboveThresholdPercent', 'ncAboveThresholdPercent', 'rankBiserial', 'pValue', 'qValue'].map(key => <td key={key}>{key === 'lengthBp' ? row[key].toLocaleString('en-US') : number(row[key])}</td>)}
    </tr>)}</tbody>
  </DataTableViewport>;
}

function SampleTable({ items, distribution = false }) {
  return <DataTableViewport ariaLabel="MAG 样本数据" maxHeight={360}>
    <thead><tr>{['样本 ID', 'disease', '年龄', '性别', 'HPC_Batch', ...(distribution ? ['丰度 %'] : ['映射 %', '未映射 %', '超过阈值的 MAG 数'])].map(v => <th scope="col" key={v}>{v}</th>)}</tr></thead>
    <tbody>{items.map(s => <tr key={s.sampleId}>
      <td>{s.sampleId}</td><td>{s.disease}</td><td>{s.age}</td><td>{s.gender}</td><td>{s.batch}</td>
      {distribution ? <td>{number(s.abundancePercent)}</td> : <><td>{number(s.mappedPercent)}</td><td>{number(s.unmappedPercent)}</td><td>{s.aboveThresholdMagCount}</td></>}
    </tr>)}</tbody>
  </DataTableViewport>;
}

function WorkspaceResults({ overview, scope, view, setView }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [sortBy, setSortBy] = useState('meanPercent');
  const [direction, setDirection] = useState('desc');
  const [selectedMag, setSelectedMag] = useState('');
  const [topN, setTopN] = useState(20);
  const [taxonomyRank, setTaxonomyRank] = useState('phylum');
  const [format, setFormat] = useState('svg');
  const [size, setSize] = useState('standard');
  const params = { ...scope, revision: overview.provenance.dataFingerprint };
  const staticParams = { revision: overview.provenance.dataFingerprint };
  const featureParams = { ...params, query, sortBy, direction, limit: 25, offset: (page - 1) * 25 };
  const featuresEnabled = view === 'features' || view === 'distribution';
  const features = useQuery({ queryKey: ['mag', 'features', featureParams], queryFn: ({ signal }) => getMagFeatures(featureParams, { signal }), enabled: featuresEnabled });
  const magId = selectedMag || features.data?.items[0]?.magId || '';
  const distribution = useQuery({ queryKey: ['mag', 'distribution', params, magId], queryFn: ({ signal }) => getMagDistribution(magId, params, { signal }), enabled: view === 'distribution' && Boolean(magId) });
  const heatmap = useQuery({ queryKey: ['mag', 'heatmap', params, topN], queryFn: ({ signal }) => getMagHeatmap({ ...params, topN }, { signal }), enabled: view === 'heatmap' });
  const mapping = useQuery({ queryKey: ['mag', 'samples', params], queryFn: ({ signal }) => getMagSamples(params, { signal }), enabled: view === 'mapping' });
  const taxonomy = useQuery({ queryKey: ['mag', 'taxonomy', staticParams.revision, taxonomyRank], queryFn: ({ signal }) => getMagTaxonomy({ ...staticParams, rank: taxonomyRank, topN: 20 }, { signal }), enabled: view === 'taxonomy' });
  const quality = useQuery({ queryKey: ['mag', 'quality', staticParams.revision], queryFn: ({ signal }) => getMagQuality(staticParams, { signal }), enabled: view === 'quality' });
  const active = { features, distribution, heatmap, taxonomy, quality, mapping }[view];
  const data = active.data;
  const audit = data?.provenance || overview.provenance;
  const sampleScoped = SAMPLE_SCOPED_VIEWS.has(view);
  const empty = (sampleScoped && audit.sampleCount === 0)
    || (view === 'features' && data?.items.length === 0)
    || (view === 'distribution' && !magId && !features.isPending)
    || (view === 'taxonomy' && data?.items.length === 0)
    || (view === 'quality' && data?.items.length === 0);
  const downloadParams = { ...params, query, sortBy, direction, view, topN, magId, limit: 25, offset: (page - 1) * 25 };
  const auditParams = sampleScoped ? downloadParams : { ...staticParams, view, rank: taxonomyRank, topN: 20 };
  const changeSort = event => { setSortBy(event.target.value); setDirection(event.target.value === 'qValue' || event.target.value === 'magId' ? 'asc' : 'desc'); setPage(1); };
  const selectMag = id => { setSelectedMag(id); setView('distribution'); };
  const title = MAG_VIEWS.find(item => item.key === view).label;
  const subtitle = view === 'features' ? '图示当前列表页前 15 个 MAG 的组均值；表格和下载包含搜索后的完整候选结果。'
    : view === 'distribution' ? '箱体为四分位范围，须为 1.5×IQR 范围内最远观测；散点保留全部样本，未做对数变换。'
      : view === 'heatmap' ? '按所选样本平均丰度取 Top N；颜色为 log10(1 + 丰度%)，提示保留原始百分比。按疾病/批次分层，不聚类。'
        : view === 'taxonomy' ? '按所选 GTDB 分类层级统计全部 872 个代表 MAG；显示 Top 20，其余合并为“其他分类”。不受样本筛选影响。'
          : view === 'quality' ? '每个点代表一个 MAG；完整度和污染率来自 CheckM2 1.1.0。横轴从 50% 起，仅覆盖上游已筛选的代表 MAG。'
            : '映射比例与超过所设丰度阈值的 MAG 数；该阈值不是生物学检出界限，映射比例也不是覆盖度、完整度或污染度。';
  const controls = <div className="analysis-controls">
    {(view === 'features' || view === 'distribution') ? <form className="analysis-filter-form" aria-label="搜索 MAG" onSubmit={e => { e.preventDefault(); setQuery(draftQuery.trim()); setSelectedMag(''); setPage(1); }}>
      <label>MAG ID 搜索<input value={draftQuery} onChange={e => setDraftQuery(e.target.value)} placeholder="输入完整或部分 MAG ID" maxLength={200} /></label>
      <button type="submit" className="analysis-button">搜索</button>
      <label>排序<select value={sortBy} onChange={changeSort}>
        <option value="meanPercent">平均丰度</option><option value="qValue">BH-FDR q</option><option value="meanDifferencePercentPoints">AD−NC 均值差</option><option value="rankBiserial">秩效应量</option><option value="magId">MAG ID</option>
      </select></label>
      <label>方向<select value={direction} onChange={e => { setDirection(e.target.value); setPage(1); }}><option value="desc">降序</option><option value="asc">升序</option></select></label>
      {view === 'distribution' ? <label className="mag-selection">选择 MAG<select value={magId} onChange={e => setSelectedMag(e.target.value)}>
        {selectedMag && !features.data?.items.some(r => r.magId === selectedMag) ? <option value={selectedMag}>{selectedMag}</option> : null}
        {(features.data?.items || []).map(row => <option key={row.magId}>{row.magId}</option>)}
      </select></label> : null}
    </form> : null}
    {view === 'heatmap' ? <label>显示 MAG 数 <select aria-label="显示 MAG 数" value={topN} onChange={e => setTopN(Number(e.target.value))}>{[10, 20, 30, 50].map(n => <option key={n}>{n}</option>)}</select></label> : null}
    {view === 'taxonomy' ? <label>分类层级 <select aria-label="分类层级" value={taxonomyRank} onChange={e => setTaxonomyRank(e.target.value)}>{TAXONOMY_RANKS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label> : null}
    <div className="analysis-downloads">
      <label>图像格式 <select value={format} onChange={e => setFormat(e.target.value)}><option value="svg">SVG 矢量</option><option value="png">PNG（2×）</option></select></label>
      <label>导出尺寸 <select value={size} onChange={e => setSize(e.target.value)}><option value="standard">标准 ≥1100×640</option><option value="large">大图 ≥1800×1000</option></select></label>
      {!active.isError && !(featuresEnabled && features.isError) ? view === 'taxonomy'
        ? <a className="analysis-button" href={magDownloadUrl('taxonomy', staticParams)} download>下载完整分类 CSV</a>
        : view === 'quality'
          ? <a className="analysis-button" href={magDownloadUrl('quality', staticParams)} download>下载完整质量 CSV</a>
          : <>
            <a className="analysis-button" href={magDownloadUrl('features', downloadParams)} download>下载全部候选 CSV</a>
            <a className="analysis-button" href={magDownloadUrl(view === 'mapping' ? 'samples' : 'matrix', params)} download>{view === 'mapping' ? '下载样本映射与阈值 CSV' : '下载所选样本 × 全部 MAG'}</a>
          </> : null}
    </div>
  </div>;
  const displayedFeatures = empty ? 0 : view === 'features' ? Math.min(15, data?.items.length || 0)
    : view === 'distribution' ? (data ? 1 : 0)
      : view === 'heatmap' ? (data?.magIds.length || 0)
        : view === 'taxonomy' ? (data?.totalMagCount || 0)
          : view === 'quality' ? (data?.items.length || 0)
            : audit.magCount;
  const disclosure = <ProjectionDisclosure data={{ scope: { mode: audit.excludedSampleCount ? 'subset' : 'cohort' }, featureLabel: 'MAG',
    projection: { kind: 'mag', sampleCount: audit.sampleCount, sourceFeatureCount: audit.magCount,
      returnedFeatureCount: displayedFeatures, truncatedFeatureCount: audit.magCount - displayedFeatures } }} />;
  return <ChartFrame title={title} subtitle={subtitle} layout="document" controls={controls}
    loadingState={<LoadingState message="正在读取 MAG 数据并计算所选范围..." />}
    loading={!empty && (active.isPending || (view === 'distribution' && features.isPending))}
    error={(active.error || (featuresEnabled ? features.error : null))?.message} onRetry={() => { active.refetch(); if (featuresEnabled) features.refetch(); }} empty={empty}
    disclosure={disclosure} audit={<Audit audit={audit} params={auditParams} />}>
    {data ? <>
      {view === 'distribution' ? <p className="mag-selected-id"><strong>{data.feature.magId}</strong> · BH-FDR q = {number(data.feature.qValue)} · 秩效应量 {number(data.feature.rankBiserial)}</p> : null}
      <Suspense fallback={<LoadingState />}><MagChart view={view} data={data} format={format} size={size} /></Suspense>
      {view === 'features' ? <>
        <p className="analysis-result-count">共 {data.total} 个 MAG · 第 {page} / {Math.max(1, Math.ceil(data.total / 25))} 页 · 检验族 {data.provenance.testedFeatureCount} 个；搜索与排序不重新计算 q 值。</p>
        <FeatureTable data={data} onSelect={selectMag} />
      </> : null}
      {(view === 'features' || view === 'distribution') && features.data ? <PaginationControls page={page} pageCount={Math.ceil(features.data.total / 25)} onPageChange={setPage} disabled={features.isFetching} ariaLabel="MAG 列表分页" /> : null}
      {view === 'distribution' ? <SampleTable items={data.samples} distribution /> : null}
      {view === 'mapping' ? <><p>丰度阈值：丰度 &gt; {audit.filters.abundanceThresholdPercent}%（严格大于）；仅用于阈值统计，不代表生物学检出。</p><SampleTable items={data.items} /></> : null}
      {view === 'heatmap' ? <p>{data.selection} 完整原始数值可通过“下载所选样本 × 全部 MAG”取得。</p> : null}
      {view === 'taxonomy' ? <div className="mag-stat-grid" aria-label="MAG 分类统计">
        <span><strong>{data.distinctTaxonCount}</strong> 个所选层级分类</span>
        <span><strong>{data.resolvedMagCount}</strong> 个已解析</span>
        <span><strong>{data.unresolvedMagCount}</strong> 个未解析至该层级</span>
        <span><strong>{data.method}</strong>{data.version ? ` ${data.version}` : '（版本待补）'}</span>
      </div> : null}
      {view === 'quality' ? <><div className="mag-stat-grid" aria-label="MAG 质量统计">
        <span><strong>{data.summary.totalMagCount}</strong> 个代表 MAG</span>
        <span><strong>{data.summary.referenceBandCount}</strong> 个位于参考区间</span>
        <span><strong>{number(data.summary.completenessMinPercent)}–{number(data.summary.completenessMaxPercent)}%</strong> 完整度</span>
        <span><strong>{number(data.summary.contaminationMinPercent)}–{number(data.summary.contaminationMaxPercent)}%</strong> 污染率</span>
      </div><p className="mag-inline-notice">{data.referenceBand.label}；图中阈值不替代包含 rRNA/tRNA 等条件的完整 MIMAG 质量标准。</p></> : null}
    </> : null}
  </ChartFrame>;
}

export default function MagWorkspacePage({ datasets = [], onDatasetChange, onDomainChange }) {
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [view, setView] = useState('features');
  const overview = useQuery({ queryKey: ['mag', 'overview', scope], queryFn: ({ signal }) => getMagOverview(scope, { signal }), retry: false });
  const audit = overview.data?.provenance;
  const views = viewsForCapabilities(overview.data?.capabilities);
  const readyLabels = [
    '丰度分析',
    overview.data?.capabilities?.taxonomy ? 'MAG分类' : null,
    overview.data?.capabilities?.quality ? 'MAG质量' : null,
    '技术质控',
  ].filter(Boolean).join('、');
  const pendingLabels = [
    overview.data && !overview.data.capabilities?.taxonomy ? 'MAG分类' : null,
    'MAG功能注释',
    overview.data && !overview.data.capabilities?.quality ? 'MAG质量' : null,
    '跨队列复现',
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
    key: audit?.version || 'mag',
    name: audit ? `当前 MAG 分析结果（${audit.version}）` : 'MAG 分析结果加载中',
    sampleCount: audit?.sampleCount || 0,
  };
  const topbar = <TopBar
    featureKind="mag"
    summary={summary}
    workspaceSubtitle="MAG 解析"
    runs={[magRun]}
    runsLoading={overview.isPending}
    runsError={overview.error?.message || null}
    activeRun={magRun}
    activeArtifact={summary ? { sampleCount: summary.totalSamples } : null}
    onRunChange={() => {}}
  />;
  const sidebar = <aside className="sidebar" data-scroll-region="sidebar">
    <section className="sidebar-section"><div className="sidebar-section__header"><h3 className="sidebar-heading">数据概览</h3><span className="sidebar-section__status">当前队列</span></div>
      <DatasetSummary summary={summary} />
    </section>
    <section className="sidebar-section"><div className="sidebar-section__header"><h3 className="sidebar-heading">分析模块</h3><span className="sidebar-section__status">稳定入口</span></div>
      <AnalysisDomainNav datasets={datasets} featureKind="mag" activeDomainKey="mag" onDatasetChange={onDatasetChange} onDomainChange={onDomainChange} />
    </section>
    <section className="sidebar-section sidebar-section--navigation"><h3 className="sidebar-heading">分析导航</h3>
      <ChartNav charts={views} activeChart={view} featureKind="mag" onChange={setView} />
    </section>
    <section className="sidebar-section"><h3 className="sidebar-heading">HPC_Batch 分组构成</h3><p className="mag-muted">筛选不是协变量校正；留意批次内组别比例。</p>
      {overview.data ? <DataTableViewport ariaLabel="批次分组构成"><thead><tr><th>批次</th><th>AD</th><th>NC</th></tr></thead><tbody>{overview.data.batches.map(b => <tr key={b.batch}><td>{b.batch}</td><td>{b.AD}</td><td>{b.NC}</td></tr>)}</tbody></DataTableViewport> : null}
    </section>
    <div className="mag-readiness" aria-label="MAG 模块数据就绪度">
      <strong>数据就绪度</strong>
      <span><i className="mag-readiness__dot mag-readiness__dot--ready" aria-hidden="true" />已接入：{readyLabels}</span>
      <span><i className="mag-readiness__dot" aria-hidden="true" />待核验：{pendingLabels}</span>
    </div>
  </aside>;
  return <AppShell topbar={topbar} sidebar={sidebar} main={<MainWorkspace chartKey="mag">
    <div className="analysis-workspace-stack">
      <div className="mag-research-notice">仅供探索性研究。候选特征不等于已验证生物标志物，不支持临床诊断或因果判断。组间检验未做协变量校正。</div>
      {overview.isPending ? <LoadingState message="正在校验 MAG 数据包与样本范围..." /> : overview.error ? <ErrorState message={overview.error.message} onRetry={overview.refetch} /> : <>
        {SAMPLE_SCOPED_VIEWS.has(view) ? <section className="mag-filter-panel"><ScopeForm value={scope} options={overview.data.options} onApply={setScope} />
          <p className="mag-muted">丰度阈值只用于“超过阈值”的比例和数量统计，不定义生物学检出；原始丰度和组间检验保持不变。年龄、性别、批次均在同一筛选范围内比较。</p>
        </section> : <section className="mag-filter-panel"><p className="mag-muted">当前为 MAG 级注释视图，覆盖全部 872 个代表 MAG，不使用 disease、年龄、性别、批次或丰度阈值筛选。</p></section>}
        {audit.warnings.filter(w => w.includes('全部为 100%') || w.includes('少于 2')).map(w => <p className="mag-inline-notice" key={w}>{w}</p>)}
        <WorkspaceResults key={JSON.stringify([scope, audit.dataFingerprint])} overview={overview.data} scope={scope} view={view} setView={setView} />
      </>}
    </div>
  </MainWorkspace>} />;
}
