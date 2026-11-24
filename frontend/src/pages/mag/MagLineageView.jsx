import StyledSelect from '../../components/ui/StyledSelect';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getMagCrosswalk,
  getMagLineage,
  getMagLineageCluster,
  getMagLineageClusters,
  magDownloadUrl,
} from '../../api/mag';
import ChartFrame from '../../components/Charts/ChartFrame';
import DataTableViewport, { QUERY_TABLE_PAGE_SIZE } from '../../components/data-display/DataTableViewport';
import PaginationControls from '../../components/data-display/PaginationControls';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';
import MagResearchChart from './MagResearchChart';
import { lineageResearchOption } from './magResearchOptions';
import MagSearchInput from './MagSearchInput';
import MagLineageOverview from './MagLineageOverview';
import { downloadLineageMembers } from './magLineageDownload';

const PAGE_SIZE = QUERY_TABLE_PAGE_SIZE;
const STATUS_OPTIONS = [
  ['', '全部映射状态'],
  ['matched_exact_ncbi_species_taxid', '精确匹配'],
  ['ncbi_species_taxid_not_observed_in_reads', 'TaxID 有效但本批未观察到'],
  ['no_gtdb_reference', '未解析'],
];
const statusLabel = status => STATUS_OPTIONS.find(([key]) => key === status)?.[1] || '未解析';
const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 5 });
const percent = value => value == null ? '—' : `${number(Number(value) * 100)}%`;

function StatusBadge({ status }) {
  const tone = status === 'matched_exact_ncbi_species_taxid' ? 'exact'
    : status === 'ncbi_species_taxid_not_observed_in_reads' ? 'not-observed' : 'unresolved';
  if (!status) return <span className="mag-status-badge">未提供对应</span>;
  return <span className={`mag-status-badge mag-status-badge--${tone}`} title={status}>{statusLabel(status)}</span>;
}

function EvidenceChain({ evidence }) {
  if (!evidence) return null;
  const { member, crosswalk } = evidence;
  const steps = [
    ['来源样本', member.memberSourceSampleId, `disease=${member.memberDisease} · Group=${member.memberGroup}（来源组）`],
    ['成员 MAG', member.memberMag, `完整度 ${number(member.memberCompletenessPercent)}% · 污染率 ${number(member.memberContaminationPercent)}%`],
    ['dRep 聚类', member.clusterId, `${member.clusterMethod} · ${member.comparisonAlgorithm} · 实际 ANI ${number(member.memberToRepAni)}`],
    ['代表 MAG', member.representativeMag, `reference；成员为 query · 基因组比对比例 ${percent(member.memberToRepAlignmentCoverage)}`],
    ['GTDB 分类', evidence.cluster.gtdbSpecies || '未解析', crosswalk?.gtdbReferenceAccession || '参考信息见 MAG 分类详情'],
    ...(crosswalk ? [['NCBI / Bracken', statusLabel(crosswalk.mappingStatus), crosswalk.krakenSpeciesName || crosswalk.ncbiOrganismName || '无物种名称']] : []),
  ];
  return <section className="mag-evidence" aria-label="单 MAG 证据链">
    <div className="mag-evidence__header">
      <div><span className="mag-kicker">单 MAG 证据链</span><h3>{evidence.queriedMagId}</h3></div>
      <StatusBadge status={crosswalk?.mappingStatus} />
    </div>
    <ol>{steps.map(([label, value, note]) => <li key={label}>
      <span>{label}</span><strong>{value}</strong><small>{note}</small>
    </li>)}</ol>
    {member.memberToRepAni < 0.95 ? <p className="mag-inline-notice">该成员的实际 ANI 低于 0.95，已保留原值。这是 average-linkage 聚类边界记录；等价阈值不是逐成员实测 ANI。</p> : null}
    <p className="mag-muted">crosswalk 仅表示分类标识符对应，不证明 reads 直接比对到具体 MAG；dRep 跨样本聚类不等于跨队列验证。</p>
  </section>;
}

function ClusterTable({ data, onSelect, pagination, page }) {
  return <DataTableViewport ariaLabel="dRep 聚类概览，可横向滚动" resizable pagination={pagination} pageKey={page}>
    <thead><tr>{['代表 MAG / 聚类', '成员', '来源样本', 'AD / NC 成员', 'Group 来源组', 'ANI 范围', '低于 0.95', 'GTDB 物种', '完整度 / 污染率', '物种映射'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{data.items.map(row => <tr key={row.clusterId}>
      <td><button className="analysis-text-button" onClick={() => onSelect(row)}>{row.representativeMag}</button><small>{row.clusterId}</small></td>
      <td>{row.memberCount}</td><td>{row.sourceSampleCount}</td><td>{row.adMemberCount} / {row.ncMemberCount}</td>
      <td>{row.sourceGroups.join(' + ')}</td><td>{number(row.aniMin)}–{number(row.aniMax)}</td>
      <td>{row.below095AniCount ? <strong className="mag-low-ani">{row.below095AniCount}</strong> : '0'}</td>
      <td>{row.gtdbSpecies || '未解析'}</td><td>{number(row.completenessPercent)}% / {number(row.contaminationPercent)}%</td>
      <td><StatusBadge status={row.mappingStatus} /></td>
    </tr>)}</tbody>
  </DataTableViewport>;
}

function MemberTable({ data, onSelect, pagination, page }) {
  return <DataTableViewport ariaLabel="当前 dRep 聚类成员，可横向滚动" resizable pagination={pagination} pageKey={page}>
    <thead><tr>{['成员 MAG（查看证据链）', '来源样本', 'disease', 'Group 来源组', '实际 ANI', '基因组比对比例', '成员完整度 / 污染率', '角色'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{data.items.map(row => <tr key={row.memberMag}>
      <td><button className="analysis-text-button" onClick={() => onSelect(row.memberMag)}>{row.memberMag}</button></td>
      <td>{row.memberSourceSampleId}</td><td>{row.memberDisease}</td><td>{row.memberGroup}</td>
      <td title={`ANI 原始比例 ${row.memberToRepAni}`} className={row.memberToRepAni < 0.95 ? 'mag-low-ani' : ''}>{number(row.memberToRepAni)}</td>
      <td title={`原始比例 ${row.memberToRepAlignmentCoverage}`}>{percent(row.memberToRepAlignmentCoverage)}</td><td>{number(row.memberCompletenessPercent)}% / {number(row.memberContaminationPercent)}%</td>
      <td>{row.isRepresentative ? '代表自身' : '成员'}</td>
    </tr>)}</tbody>
  </DataTableViewport>;
}

function CrosswalkTable({ data, pagination, page, onSelect }) {
  return <DataTableViewport ariaLabel="MAG 物种 crosswalk，可横向滚动" resizable pagination={pagination} pageKey={page}>
    <thead><tr>{['代表 MAG', 'GTDB R232 物种', 'GTDB 参考', 'NCBI species TaxID', 'NCBI 名称', 'NCBI 属级核查', 'Kraken2 / Bracken 物种', '原批次观察状态'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{data.items.map(row => <tr key={row.magId}>
      <td><button type="button" className="analysis-text-button" onClick={() => onSelect?.(row.magId)}>{row.magId}</button></td><td>{row.gtdbSpecies || '未解析'}</td><td>{row.gtdbReferenceAccession || '—'}</td>
      <td>{row.ncbiSpeciesTaxid || '—'}</td><td>{row.ncbiOrganismName || '—'}</td>
      <td>{row.ncbiLineageStatus === 'verified' ? row.ncbiGenus : <><span>待核查</span>{row.ncbiLineageReason && <small>{row.ncbiLineageReason}</small>}</>}</td>
      <td>{row.krakenSpeciesName || (row.mappingStatus === 'ncbi_species_taxid_not_observed_in_reads' ? '本批未观察到' : '—')}</td>
      <td><StatusBadge status={row.mappingStatus} /></td>
    </tr>)}</tbody>
  </DataTableViewport>;
}

export default function MagLineageView({ overview, initialMagId = '', onDetail }) {
  const revision = overview.provenance.dataFingerprint;
  const [clusterPage, setClusterPage] = useState(1);
  const [clusterDraft, setClusterDraft] = useState(initialMagId);
  const [clusterQuery, setClusterQuery] = useState(initialMagId);
  const [mappingStatus, setMappingStatus] = useState('');
  const [lowAniOnly, setLowAniOnly] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [memberPageSize, setMemberPageSize] = useState(PAGE_SIZE);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberDraft, setMemberDraft] = useState('');
  const [memberLowAni, setMemberLowAni] = useState(false);
  const [sizeBin, setSizeBin] = useState('');
  const [selectedMag, setSelectedMag] = useState(initialMagId);
  const [crosswalkPage, setCrosswalkPage] = useState(1);
  const [crosswalkDraft, setCrosswalkDraft] = useState(initialMagId);
  const [crosswalkQuery, setCrosswalkQuery] = useState(initialMagId);
  const [crosswalkStatus, setCrosswalkStatus] = useState('');
  const [brush, setBrush] = useState({ source: null, ids: [] });
  const clusterParams = { revision, query: clusterQuery, mappingStatus, lowAniOnly, sizeBin, sortBy: 'memberCount', direction: 'desc', limit: PAGE_SIZE, offset: (clusterPage - 1) * PAGE_SIZE };
  const clusters = useQuery({ queryKey: ['mag', 'lineage-clusters', clusterParams], queryFn: ({ signal }) => getMagLineageClusters(clusterParams, { signal }), placeholderData: previous => previous });
  const clusterId = selectedCluster || clusters.data?.items[0]?.clusterId || '';
  const plotParams = { revision, allMembers: true, sortBy: 'memberToRepAni', direction: 'asc' };
  const plot = useQuery({ queryKey: ['mag', 'lineage-plot', clusterId, revision], queryFn: ({ signal }) => getMagLineageCluster(clusterId, plotParams, { signal }), enabled: Boolean(clusterId), staleTime: Infinity });
  const memberParams = { revision, query: memberQuery, lowAniOnly: memberLowAni, limit: memberPageSize, offset: (memberPage - 1) * memberPageSize, sortBy: 'memberToRepAni', direction: 'asc' };
  const cluster = useQuery({ queryKey: ['mag', 'lineage-cluster', clusterId, memberParams], queryFn: ({ signal }) => getMagLineageCluster(clusterId, memberParams, { signal }), enabled: Boolean(clusterId), placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === clusterId ? previous : undefined });
  const selectedIds = brush.source === plot.data ? brush.ids : [];
  const evidenceMag = clusterId ? selectedMag || plot.data?.items[0]?.memberMag || '' : '';
  const selectedMember = plot.data?.items.find(row => row.memberMag === evidenceMag);
  const resetCluster = () => { setSelectedCluster(''); setSelectedMag(''); setMemberPage(1); setMemberQuery(''); setMemberDraft(''); setMemberLowAni(false); };
  const selectMember = id => { setSelectedMag(id); onDetail?.(id); };
  const evidence = useQuery({ queryKey: ['mag', 'lineage-evidence', evidenceMag, revision], queryFn: ({ signal }) => getMagLineage(evidenceMag, { revision }, { signal }), enabled: Boolean(evidenceMag) });
  const crosswalkParams = { revision, query: crosswalkQuery, mappingStatus: crosswalkStatus, limit: PAGE_SIZE, offset: (crosswalkPage - 1) * PAGE_SIZE };
  const crosswalk = useQuery({ queryKey: ['mag', 'crosswalk', crosswalkParams], queryFn: ({ signal }) => getMagCrosswalk(crosswalkParams, { signal }), placeholderData: previous => previous, enabled: Boolean(overview.capabilities.crosswalk) });

  useEffect(() => { setMemberPage(1); }, [clusterId]);

  const activeError = clusters.error || plot.error || cluster.error || evidence.error || crosswalk.error;
  const retry = () => { clusters.refetch(); plot.refetch(); cluster.refetch(); evidence.refetch(); crosswalk.refetch(); };
  const controls = <div className="analysis-downloads">
    <a className="analysis-button" href={magDownloadUrl('lineage', { revision })} download>下载去冗余关系 CSV</a>
    {overview.capabilities.crosswalk && <a className="analysis-button" href={magDownloadUrl('crosswalk', { revision })} download>下载分类对应 CSV</a>}
  </div>;

  return <ChartFrame title="来源与去冗余" subtitle="查看来源样本、成员—代表关系、实际 ANI 与质量。跨分类体系对应作为独立可选结果。" layout="document" controls={controls}>
    <div className="mag-lineage-stack">
      <p className="mag-inline-notice">disease 是 AD/NC 疾病分组；Group 是元数据中的来源组。这里展示跨样本去冗余，不是独立外部队列验证。</p>
      <form className="analysis-filter-form" aria-label="筛选 dRep 聚类" onSubmit={event => { event.preventDefault(); setClusterQuery(clusterDraft.trim()); setSizeBin(''); setClusterPage(1); resetCluster(); }}>
        <label>聚类 / 代表 MAG / GTDB 物种<MagSearchInput revision={revision} context="lineage" label="聚类 / 代表 MAG / GTDB 物种" value={clusterDraft} onChange={setClusterDraft}
          onSelect={value => { setClusterQuery(value); setSizeBin(''); setClusterPage(1); resetCluster(); }} /></label>
        {overview.capabilities.crosswalk && <label>物种映射状态<StyledSelect value={mappingStatus} onChange={event => { setMappingStatus(event.target.value); setClusterPage(1); setSizeBin(''); resetCluster(); }}>{STATUS_OPTIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</StyledSelect></label>}
        <label className="mag-check"><input type="checkbox" checked={lowAniOnly} onChange={event => { setLowAniOnly(event.target.checked); setClusterPage(1); setSizeBin(''); resetCluster(); }} />仅看含 ANI＜0.95 记录的聚类</label>
        <button className="analysis-button analysis-button--primary" type="submit">搜索聚类</button>
      </form>
      {activeError ? <ErrorState message={activeError.message} onRetry={retry} /> : null}
      {clusters.isPending ? <LoadingState message="正在读取 dRep 聚类摘要..." /> : clusters.data ? <>
        <div className="mag-stat-grid" aria-label="lineage 数据概览">
          <span><strong>{clusters.data.summary.memberMagCount.toLocaleString('en-US')}</strong> 个唯一成员 MAG</span>
          <span><strong>{clusters.data.summary.secondaryClusterCount}</strong> 个二级聚类 / 代表 MAG</span>
          <span><strong>{clusters.data.summary.sourceSampleCount}</strong> 个可追溯来源样本</span>
          <span><strong>{clusters.data.summary.below095AniCount}</strong> 条实际 ANI＜0.95（保留原值）</span>
        </div>
        <MagLineageOverview data={clusters.data} selected={sizeBin} loading={clusters.isFetching} onSelect={value => { setSizeBin(value); setClusterPage(1); resetCluster(); }} />
        <p className="analysis-result-count" role="status">{sizeBin ? `分档 ${clusters.data.sizeDistribution?.find(bin => bin.id === sizeBin)?.label || sizeBin} 个成员：` : '筛选后 '}{clusters.data.total} 个聚类{clusters.isFetching ? ' · 正在更新' : ''}。</p>
        <ClusterTable data={clusters.data} onSelect={row => { resetCluster(); setSelectedCluster(row.clusterId); setSelectedMag(row.representativeMag); }} page={clusterPage} pagination={<PaginationControls page={clusterPage} pageCount={Math.ceil(clusters.data.total / PAGE_SIZE)} onPageChange={setClusterPage} disabled={clusters.isFetching} ariaLabel="dRep 聚类分页" />} />
      </> : null}

      {plot.isPending && clusterId ? <LoadingState message="正在读取整簇成员比对证据..." /> : plot.data && clusterId ? <section className="mag-detail-section mag-lineage-detail">
        <div className="mag-section-heading"><div><span className="mag-kicker">局部关系 · 整簇证据</span><h3>{plot.data.cluster.clusterId} · {plot.data.cluster.representativeMag}</h3></div><span>{plot.data.total} 个成员</span></div>
        <CollapsibleResultSection title="成员与代表的比对证据" storageKey="admeta:mag:lineage-scatter:fold" className="mag-lineage-scatter"
          summary={`整簇 ${plot.data.total} / ${plot.data.cluster.memberCount} 成员 · 菱形为代表自身`}
          actions={<><button type="button" className="analysis-button" onClick={() => onDetail?.(plot.data.cluster.representativeMag)}>查看代表 MAG 详情</button>
            <button type="button" className="analysis-button" onClick={() => downloadLineageMembers(plot.data)}>下载整簇成员原值 CSV</button></>}>
          <p className="mag-muted">代表 MAG 作 reference、成员 MAG 作 query。95% 为参考线；实际 ANI 保留原值，整簇图不受下方成员表的搜索、筛选和分页影响。</p>
          <MagResearchChart kind="lineage" data={plot.data} buildOption={lineageResearchOption} selected={[...selectedIds, evidenceMag]}
            onSelect={selectMember}
            onBrush={ids => setBrush(previous => previous.source === plot.data && previous.ids.join('|') === ids.join('|') ? previous : { source: plot.data, ids })}
            exportConfig={{ fileName: `ADMeta-lineage-${clusterId}-all${plot.data.total}-${revision.slice(0, 12)}`, format: 'svg', minWidth: 1100, minHeight: 640, title: '导出整簇比对证据 SVG' }} />
          <p className="mag-muted">成员计数：AD {plot.data.cluster.adMemberCount} / NC {plot.data.cluster.ncMemberCount}；来源组 {plot.data.cluster.sourceGroups.join(' / ')}。纵轴是基因组比对比例；成员计数不等于样本丰度、检出率或组间差异证据。</p>
          <div className="mag-lineage-boundaries" aria-label="实际 ANI 低于 95% 的成员">
            <strong>实际 ANI＜95%：{plot.data.items.filter(row => row.memberToRepAni < .95).length} 条</strong>
            {plot.data.items.filter(row => row.memberToRepAni < .95).map(row => <button type="button" key={row.memberMag} className="analysis-text-button" onClick={() => selectMember(row.memberMag)}>{row.memberMag} · ANI 原值 {row.memberToRepAni}</button>)}
          </div>
          {selectedMember && <section className="mag-lineage-exact" aria-label="所选成员精确比对证据">
            <h4>{selectedMember.memberMag}</h4>
            <dl className="mag-detail-facts">{[['来源样本', selectedMember.memberSourceSampleId], ['疾病 / 来源组', `${selectedMember.memberDisease} / ${selectedMember.memberGroup}`],
              ['实际 ANI（原始比例）', String(selectedMember.memberToRepAni)], ['基因组比对比例（原始比例）', String(selectedMember.memberToRepAlignmentCoverage)],
              ['reference', selectedMember.representativeMag], ['query', selectedMember.memberMag]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </section>}
          {selectedIds.length > 0 && <div className="mag-brush-results" aria-label="框选的聚类成员"><strong>框选 {selectedIds.length} 个成员</strong>{selectedIds.map(id => <button key={id} type="button" className="analysis-text-button" onClick={() => selectMember(id)}>{id}</button>)}</div>}
        </CollapsibleResultSection>
        <form className="analysis-filter-form" aria-label="筛选聚类成员表" onSubmit={event => { event.preventDefault(); setMemberQuery(memberDraft.trim()); setMemberPage(1); }}>
          <label>成员 ID / 来源样本<input aria-label="成员 ID / 来源样本" value={memberDraft} onChange={event => setMemberDraft(event.target.value)} /></label>
          <label className="mag-check"><input type="checkbox" checked={memberLowAni} onChange={event => { setMemberLowAni(event.target.checked); setMemberPage(1); }} />成员表仅看 ANI＜95%</label>
          <label>每页成员数<StyledSelect aria-label="每页成员数" value={memberPageSize} onChange={event => { setMemberPageSize(Number(event.target.value)); setMemberPage(1); }}>{[25, 100, PAGE_SIZE].map(count => <option key={count} value={count}>{count}</option>)}</StyledSelect></label>
          <button type="submit" className="analysis-button">查询成员</button>
        </form>
        {cluster.isPending ? <LoadingState message="正在读取成员表..." /> : cluster.data ? <>
          <p className="mag-muted" role="status">成员表匹配 {cluster.data.total} 条 · 当前页 {cluster.data.items.length} 条；整簇图始终保留 {plot.data.total} 个成员。</p>
          <MemberTable data={cluster.data} onSelect={selectMember} page={memberPage} pagination={<PaginationControls page={memberPage} pageCount={Math.ceil(cluster.data.total / memberPageSize)} onPageChange={setMemberPage} disabled={cluster.isFetching} ariaLabel="聚类成员分页" />} />
        </> : null}
      </section> : null}

      {evidence.isPending && evidenceMag ? <LoadingState message="正在构建单 MAG 证据链..." /> : <EvidenceChain evidence={evidence.data} />}

      {overview.capabilities.crosswalk && <section className="mag-detail-section">
        <div className="mag-section-heading"><div><span className="mag-kicker">分类标识符对应</span><h3>代表 MAG 物种 crosswalk</h3></div></div>
        <form className="analysis-filter-form" aria-label="筛选 MAG 物种映射" onSubmit={event => { event.preventDefault(); setCrosswalkQuery(crosswalkDraft.trim()); setCrosswalkPage(1); }}>
          <label>MAG / GTDB / NCBI / Bracken 搜索<MagSearchInput revision={revision} context="crosswalk" label="MAG / GTDB / NCBI / Bracken 搜索" value={crosswalkDraft} onChange={setCrosswalkDraft}
            onSelect={value => { setCrosswalkQuery(value); setCrosswalkPage(1); }} /></label>
          <label>映射状态<StyledSelect value={crosswalkStatus} onChange={event => { setCrosswalkStatus(event.target.value); setCrosswalkPage(1); }}>{STATUS_OPTIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</StyledSelect></label>
          <button className="analysis-button analysis-button--primary" type="submit">搜索映射</button>
        </form>
        {crosswalk.isPending ? <LoadingState message="正在读取物种 crosswalk..." /> : crosswalk.data ? <>
          <div className="mag-status-summary">
            {STATUS_OPTIONS.slice(1).map(([status, label]) => <span key={status}><StatusBadge status={status} /><strong>{crosswalk.data.statusCounts[status]}</strong><small>{label === '精确匹配' ? '本批 NCBI species TaxID 精确对应' : label}</small></span>)}
          </div>
          <CrosswalkTable data={crosswalk.data} onSelect={onDetail} page={crosswalkPage} pagination={<PaginationControls page={crosswalkPage} pageCount={Math.ceil(crosswalk.data.total / PAGE_SIZE)} onPageChange={setCrosswalkPage} disabled={crosswalk.isFetching} ariaLabel="MAG 物种映射分页" />} />
        </> : null}
        <p className="mag-muted">未解析状态不会通过名称相似度自动升级为确定映射；只有“精确匹配”表示本批 Bracken 集合中存在精确 NCBI species TaxID 对应。</p>
      </section>}
    </div>
  </ChartFrame>;
}
