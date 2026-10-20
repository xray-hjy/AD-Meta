import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { getMagRecords } from '../../api/mag';
import ChartFrame from '../../components/Charts/ChartFrame';
import PaginationControls from '../../components/data-display/PaginationControls';
import DataTableViewport from '../../components/data-display/DataTableViewport';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';
import StyledSelect from '../../components/ui/StyledSelect';

const count = value => value == null ? '—' : Number(value).toLocaleString('en-US');

function FunctionResults({ overview, initialMagId = '' }) {
  const revision = overview.provenance.dataFingerprint;
  const [module, setModule] = useState(overview.capabilities.arg ? 'arg' : 'bgc');
  const [metric, setMetric] = useState('knownHits');
  const [mag, setMag] = useState(initialMagId);
  const [draft, setDraft] = useState(initialMagId);
  const [page, setPage] = useState(1);
  const summaryKind = module === 'arg' ? 'arg_summary' : 'bgc_status';
  const detailKind = module === 'arg' ? 'arg_hits' : 'bgc_regions';
  const field = module === 'arg' ? metric : 'regionCount';
  const summary = useQuery({ queryKey: ['mag', 'source-summary', module, field, revision],
    queryFn: ({ signal }) => getMagRecords(module, { revision, kind: summaryKind, rankBy: field, limit: 20 }, { signal }) });
  const params = { revision, kind: detailKind, magId: mag, limit: 25, offset: (page - 1) * 25 };
  const details = useQuery({ queryKey: ['mag', 'source-details', module, params],
    queryFn: ({ signal }) => getMagRecords(module, params, { signal }) });
  const error = summary.error || details.error;
  const ranked = [...(summary.data?.items || [])].filter(row => row[field] != null)
    .sort((a, b) => b[field] - a[field] || a.magId.localeCompare(b.magId)).slice(0, 20).reverse();
  const labels = { knownHits: 'ARG HMM 命中数', novel075: '新候选（passed_0.75）', novel095: '新候选（passed_0.95）', regionCount: 'BGC 区域数' };
  const option = { animation: false, tooltip: { trigger: 'axis', confine: true },
    grid: { left: 300, right: 30, top: 20, bottom: 40 },
    xAxis: { type: 'value', name: labels[field], minInterval: 1 },
    yAxis: { type: 'category', data: ranked.map(row => row.magId), axisLabel: { fontSize: 10, width: 275, overflow: 'truncate' } },
    series: [{ type: 'bar', data: ranked.map(row => row[field]), itemStyle: { color: '#347f79' } }] };
  return <ChartFrame title="MAG 功能潜力" subtitle="来源：DRAMMA 与 antiSMASH；按稳定 MAG ID 关联原文件结果。" layout="document">
    <div className="analysis-filter-form">
      <label>结果类型<StyledSelect value={module} onChange={event => { setModule(event.target.value); setPage(1); setMag(''); setDraft(''); }}>
        {overview.capabilities.arg && <option value="arg">ARG</option>}{overview.capabilities.bgc && <option value="bgc">BGC</option>}
      </StyledSelect></label>
      {module === 'arg' && <label>统计指标<StyledSelect value={metric} onChange={event => setMetric(event.target.value)}>
        {Object.entries(labels).filter(([key]) => key !== 'regionCount').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </StyledSelect></label>}
    </div>
    {error ? <ErrorState message={error.message} onRetry={() => { summary.refetch(); details.refetch(); }} /> : null}
    {summary.isPending ? <LoadingState /> : <>
      <div className="mag-stat-grid"><span><strong>{count(summary.data?.total)}</strong> 个 MAG 的分析状态</span>
        {module === 'arg' ? <><span>HMM 命中 <strong>{count(summary.data?.report.knownHits)}</strong></span><span>新候选 0.75 / 0.95：<strong>{count(summary.data?.report.novel075)} / {count(summary.data?.report.novel095)}</strong></span></>
          : <><span>BGC 区域 <strong>{count(summary.data?.report.regionCount)}</strong></span><span>未完整提供结果的 MAG：{count(summary.data?.report.incompleteMags)}</span></>}
      </div>
      <ReactECharts option={option} style={{ height: 560 }} notMerge onEvents={{ click: event => { if (event.name) { setMag(event.name); setDraft(event.name); setPage(1); } } }} />
      <p className="mag-muted">图示完整目录中该指标最高的 20 个 MAG，可点击柱形查看明细。它们表示基因或基因簇潜力，不能解释为表达量或耐药表型。</p>
    </>}
    <form className="analysis-filter-form" onSubmit={event => { event.preventDefault(); setMag(draft.trim()); setPage(1); }}>
      <label>MAG ID<input value={draft} onChange={event => setDraft(event.target.value)} placeholder="完整 MAG ID；留空查看全部" /></label>
      <button className="analysis-button" type="submit">查看明细</button>
      <button className="analysis-button" type="button" onClick={() => { setMag(''); setDraft(''); setPage(1); }}>全部 MAG</button>
    </form>
    {module === 'arg' && <p className="mag-muted">HMM 命中与模型新候选分开展示。passed 标记沿用上游判定，不能直接解释为模型分数的数值阈值；0.95 候选是 0.75 候选的子集。</p>}
    {module === 'bgc' && <p className="mag-muted">坐标为原 contig 的 0 起点半开区间。缺少结果与成功分析但零命中分别记录；区域重叠时不把区域内基因数当作独立基因总数。</p>}
    {details.isPending ? <LoadingState /> : <DataTableViewport ariaLabel="MAG 功能结果明细" pagination={<PaginationControls page={page} pageCount={Math.ceil((details.data?.total || 0) / 25)} onPageChange={setPage} ariaLabel="功能结果分页" />}>
      <thead><tr>{(module === 'arg' ? ['MAG', '蛋白', '类别', '命中名称', '模型分数'] : ['MAG', 'Contig / 区域', '类型', '坐标', '区域内 CDS']).map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{(details.data?.items || []).map(row => <tr key={row.id}><td>{row.magId}</td>
        {module === 'arg' ? <><td>{row.proteinId}</td><td>{row.category === 'known_hmm_hit' ? 'HMM 命中' : '新候选'}</td><td>{row.queryName || '—'}</td><td>{row.modelScore}</td></>
          : <><td>{row.contigId} / {row.regionNumber}</td><td>{row.products.join(', ')}</td><td>{row.start}–{row.end}</td><td>{row.geneCount}</td></>}</tr>)}</tbody>
    </DataTableViewport>}
    <p className="analysis-result-count">共 {count(details.data?.total)} 条明细。</p>
    <p className="mag-muted">MAG 层面的 KO、CAZyme 等结果将按各自的来源和处理状态接入；当前群落 KO 丰度不作为 MAG 功能注释。</p>
  </ChartFrame>;
}

function PhylogenyResults({ overview }) {
  const revision = overview.provenance.dataFingerprint;
  const [selected, setSelected] = useState('');
  const query = useQuery({ queryKey: ['mag', 'phylogeny', revision],
    queryFn: ({ signal }) => getMagRecords('phylogeny', { revision, kind: 'trees', limit: 10 }, { signal }) });
  const trees = query.data?.items || [];
  const current = trees.find(tree => tree.id === selected) || trees[0];
  const option = current ? { animation: false, tooltip: { trigger: 'item', renderMode: 'richText', formatter: info => `${info.data.name || '内部节点'}\n分支长度：${info.data.branchLength ?? '未提供'}` },
    series: [{ type: 'tree', data: [current.tree], top: 20, left: '8%', right: '30%', bottom: 20, roam: true,
      initialTreeDepth: 3, expandAndCollapse: true, symbolSize: 5,
      label: { position: 'left', fontSize: 10 }, leaves: { label: { position: 'right' } } }] } : {};
  return <ChartFrame title="MAG 系统发育树" subtitle="直接读取 IQ-TREE 的最终 Newick 结果。" layout="document">
    {query.error && <ErrorState message={query.error.message} onRetry={query.refetch} />}
    {query.isPending ? <LoadingState /> : current ? <>
      <label>树文件<StyledSelect value={current.id} onChange={event => setSelected(event.target.value)}>{trees.map(tree => <option key={tree.id} value={tree.id}>{tree.id} · {tree.leafIds.length} 个 MAG</option>)}</StyledSelect></label>
      <p>{current.sourceName} · {current.leafIds.length} 个叶节点。点击内部节点展开，拖动或滚轮调整视图。</p>
      <ReactECharts option={option} style={{ height: 720 }} notMerge />
      <p className="mag-muted">这里按拓扑排布，画面中的水平距离不按分支长度缩放；分支原值在提示中保留。内部节点标签按原文件显示，不自动解释为时间或统一类型的支持度。丰度热图的聚类树与本系统发育树含义不同。</p>
    </> : <p>当前分析记录没有可用的系统发育树。</p>}
  </ChartFrame>;
}

export default function MagSourceResults({ overview, view, initialMagId = '' }) {
  return view === 'phylogeny' ? <PhylogenyResults key={overview.provenance.dataFingerprint} overview={overview} />
    : <FunctionResults key={`${overview.provenance.dataFingerprint}:${initialMagId}`} overview={overview} initialMagId={initialMagId} />;
}
