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
      <td className={row.memberToRepAni < 0.95 ? 'mag-low-ani' : ''}>{number(row.memberToRepAni)}</td>
      <td>{percent(row.memberToRepAlignmentCoverage)}</td><td>{number(row.memberCompletenessPercent)}% / {number(row.memberContaminationPercent)}%</td>
      <td>{row.isRepresentative ? '代表自身' : '成员'}</td>
    </tr>)}</tbody>
  </DataTableViewport>;
}

function CrosswalkTable({ data, pagination, page, onSelect }) {
  return <DataTableViewport ariaLabel="MAG 物种 crosswalk，可横向滚动" resizable pagination={pagination} pageKey={page}>
    <thead><tr>{['代表 MAG', 'GTDB R232 物种', 'GTDB 参考', 'NCBI species TaxID', 'NCBI 名称', 'Kraken2 / Bracken 物种', '状态'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{data.items.map(row => <tr key={row.magId}>
      <td><button type="button" className="analysis-text-button" onClick={() => onSelect?.(row.magId)}>{row.magId}</button></td><td>{row.gtdbSpecies || '未解析'}</td><td>{row.gtdbReferenceAccession || '—'}</td>
      <td>{row.ncbiSpeciesTaxid || '—'}</td><td>{row.ncbiOrganismName || '—'}</td><td>{row.krakenSpeciesName || '本批未观察到'}</td>
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
  const [selectedMag, setSelectedMag] = useState(initialMagId);
  const [crosswalkPage, setCrosswalkPage] = useState(1);
  const [crosswalkDraft, setCrosswalkDraft] = useState(initialMagId);
  const [crosswalkQuery, setCrosswalkQuery] = useState(initialMagId);
  const [crosswalkStatus, setCrosswalkStatus] = useState('');
  const [brush, setBrush] = useState({ source: null, ids: [] });
  const clusterParams = { revision, query: clusterQuery, mappingStatus, lowAniOnly, sortBy: 'memberCount', direction: 'desc', limit: PAGE_SIZE, offset: (clusterPage - 1) * PAGE_SIZE };
  const clusters = useQuery({ queryKey: ['mag', 'lineage-clusters', clusterParams], queryFn: ({ signal }) => getMagLineageClusters(clusterParams, { signal }), placeholderData: previous => previous });
  const clusterId = selectedCluster || clusters.data?.items[0]?.clusterId || '';
  const memberParams = { revision, limit: PAGE_SIZE, offset: (memberPage - 1) * PAGE_SIZE, sortBy: 'memberToRepAni', direction: 'asc' };
  const cluster = useQuery({ queryKey: ['mag', 'lineage-cluster', clusterId, memberParams], queryFn: ({ signal }) => getMagLineageCluster(clusterId, memberParams, { signal }), enabled: Boolean(clusterId), placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === clusterId ? previous : undefined });
  const selectedIds = brush.source === cluster.data ? brush.ids : [];
  const evidenceMag = selectedMag || cluster.data?.items[0]?.memberMag || '';
  const evidence = useQuery({ queryKey: ['mag', 'lineage-evidence', evidenceMag, revision], queryFn: ({ signal }) => getMagLineage(evidenceMag, { revision }, { signal }), enabled: Boolean(evidenceMag) });
  const crosswalkParams = { revision, query: crosswalkQuery, mappingStatus: crosswalkStatus, limit: PAGE_SIZE, offset: (crosswalkPage - 1) * PAGE_SIZE };
  const crosswalk = useQuery({ queryKey: ['mag', 'crosswalk', crosswalkParams], queryFn: ({ signal }) => getMagCrosswalk(crosswalkParams, { signal }), placeholderData: previous => previous, enabled: Boolean(overview.capabilities.crosswalk) });

  useEffect(() => { setMemberPage(1); }, [clusterId]);

  const activeError = clusters.error || cluster.error || evidence.error || crosswalk.error;
  const retry = () => { clusters.refetch(); cluster.refetch(); evidence.refetch(); crosswalk.refetch(); };
  const controls = <div className="analysis-downloads">
    <a className="analysis-button" href={magDownloadUrl('lineage', { revision })} download>下载去冗余关系 CSV</a>
    {overview.capabilities.crosswalk && <a className="analysis-button" href={magDownloadUrl('crosswalk', { revision })} download>下载分类对应 CSV</a>}
  </div>;

  return <ChartFrame title="来源与去冗余" subtitle="查看来源样本、成员—代表关系、实际 ANI 与质量。跨分类体系对应作为独立可选结果。" layout="document" controls={controls}>
    <div className="mag-lineage-stack">
      <p className="mag-inline-notice">disease 是 AD/NC 疾病分组；Group 是元数据中的来源组。这里展示跨样本去冗余，不是独立外部队列验证。</p>
      <form className="analysis-filter-form" aria-label="筛选 dRep 聚类" onSubmit={event => { event.preventDefault(); setClusterQuery(clusterDraft.trim()); setClusterPage(1); setSelectedCluster(''); }}>
        <label>聚类 / 代表 MAG / GTDB 物种<MagSearchInput revision={revision} context="lineage" label="聚类 / 代表 MAG / GTDB 物种" value={clusterDraft} onChange={setClusterDraft}
          onSelect={value => { setClusterQuery(value); setClusterPage(1); setSelectedCluster(''); }} /></label>
        {overview.capabilities.crosswalk && <label>物种映射状态<StyledSelect value={mappingStatus} onChange={event => { setMappingStatus(event.target.value); setClusterPage(1); }}>{STATUS_OPTIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</StyledSelect></label>}
        <label className="mag-check"><input type="checkbox" checked={lowAniOnly} onChange={event => { setLowAniOnly(event.target.checked); setClusterPage(1); }} />仅看含 ANI＜0.95 记录的聚类</label>
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
        <p className="analysis-result-count">筛选后 {clusters.data.total} 个聚类。</p>
        <ClusterTable data={clusters.data} onSelect={row => { setSelectedCluster(row.clusterId); setSelectedMag(row.representativeMag); }} page={clusterPage} pagination={<PaginationControls page={clusterPage} pageCount={Math.ceil(clusters.data.total / PAGE_SIZE)} onPageChange={setClusterPage} disabled={clusters.isFetching} ariaLabel="dRep 聚类分页" />} />
      </> : null}

      {cluster.isPending && clusterId ? <LoadingState message="正在读取当前聚类成员..." /> : cluster.data ? <section className="mag-detail-section">
        <div className="mag-section-heading"><div><span className="mag-kicker">局部关系</span><h3>{cluster.data.cluster.clusterId} · {cluster.data.cluster.representativeMag}</h3></div><span>{cluster.data.total} 个成员</span></div>
        <p className="mag-muted">仅呈现当前聚类，不绘制全部成员的全局网络。ANI 方向固定为代表 MAG 作 reference、成员 MAG 作 query。</p>
        <CollapsibleResultSection title="成员与代表的比对证据" storageKey="admeta:mag:lineage-scatter:fold"
          summary={`当前页 ${cluster.data.items.length} / ${cluster.data.total} 成员 · 菱形为代表自身`}
          actions={<button type="button" className="analysis-button" onClick={() => onDetail?.(cluster.data.cluster.representativeMag)}>查看代表 MAG 详情</button>}>
          <MagResearchChart kind="lineage" data={cluster.data} buildOption={lineageResearchOption} selected={selectedIds}
            onSelect={id => { setSelectedMag(id); onDetail?.(id); }}
            onBrush={ids => setBrush(previous => previous.source === cluster.data && previous.ids.join('|') === ids.join('|') ? previous : { source: cluster.data, ids })}
            exportConfig={{ fileName: `ADMeta-lineage-${clusterId}-page${memberPage}-${revision.slice(0, 12)}`, format: 'svg', minWidth: 1100, minHeight: 640, title: '导出比对证据 SVG' }} />
          <p className="mag-muted">纵轴是成员与代表的基因组比对比例，不是样本测序覆盖广度。成员数量与 AD / NC 来源组成不等于丰度或流行率。</p>
          {cluster.data.total > cluster.data.items.length && <p className="mag-inline-notice">图中仅包含当前成员页；翻页查看更多，不将本页视为完整聚类。</p>}
          {selectedIds.length > 0 && <div className="mag-brush-results" aria-label="框选的聚类成员"><strong>框选 {selectedIds.length} 个成员</strong>{selectedIds.map(id => <button key={id} type="button" className="analysis-text-button" onClick={() => onDetail?.(id)}>{id}</button>)}</div>}
        </CollapsibleResultSection>
        <MemberTable data={cluster.data} onSelect={id => { setSelectedMag(id); onDetail?.(id); }} page={memberPage} pagination={<PaginationControls page={memberPage} pageCount={Math.ceil(cluster.data.total / PAGE_SIZE)} onPageChange={setMemberPage} disabled={cluster.isFetching} ariaLabel="聚类成员分页" />} />
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
