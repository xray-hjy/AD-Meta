import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagCatalog, getMagDistribution, getMagLineage } from '../../api/mag';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import { MagPlanCard, MAG_RESEARCH_PLANS } from './MagResearchPlans';

const TABS = [['abundance', '丰度与差异'], ['taxonomy', '分类证据'], ['quality', '质量与组装'], ['lineage', '来源与去冗余'], ['function', '功能潜力']];
const RANKS = [['domain', '域'], ['phylum', '门'], ['class', '纲'], ['order', '目'], ['family', '科'], ['genus', '属'], ['species', '种']];
const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 5 });
const integer = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
const percent = value => value == null ? '—' : `${number(value * 100)}%`;
function EvidenceList({ items }) { return <dl className="mag-detail-facts">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '未提供'}</dd></div>)}</dl>; }

export default function MagDetailDrawer({ magId, overview, scope, onClose, onNavigate }) {
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const [tab, setTab] = useState('abundance');
  const revision = overview.provenance.dataFingerprint;
  const evidence = useQuery({ queryKey: ['mag', 'lineage-evidence', magId, revision], queryFn: ({ signal }) => getMagLineage(magId, { revision }, { signal }), enabled: Boolean(overview.capabilities.lineage) });
  const catalog = useQuery({ queryKey: ['mag', 'catalog', revision], queryFn: ({ signal }) => getMagCatalog({ revision }, { signal }), staleTime: Infinity });
  const representative = evidence.data?.member?.representativeMag || magId;
  const isMember = representative !== magId;
  const distribution = useQuery({ queryKey: ['mag', 'distribution', { ...scope, revision }, representative],
    queryFn: ({ signal }) => getMagDistribution(representative, { ...scope, revision }, { signal }),
    enabled: tab === 'abundance' && (!overview.capabilities.lineage || evidence.isSuccess) });
  const record = catalog.data?.items.find(row => row.magId === representative);
  const taxonomy = record?.taxonomy;
  const quality = record?.quality;
  const member = evidence.data?.member;
  const canNavigate = !overview.capabilities.lineage || evidence.isSuccess;
  const crosswalk = evidence.data?.crosswalk;
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    if (element.showModal) element.showModal();
    else element.setAttribute('open', '');
    closeButton.current?.focus();
    return () => { element.close?.(); if (previous?.isConnected) previous.focus?.(); };
  }, []);
  const error = catalog.error || evidence.error || (tab === 'abundance' && distribution.error);
  return <dialog ref={dialog} className="mag-detail-drawer" aria-labelledby="mag-detail-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="mag-detail-drawer__surface"><header><div><span className="mag-kicker">MAG 研究证据</span><h2 id="mag-detail-title">{magId}</h2><p>{isMember ? '聚类成员 · 丰度取自对应代表 MAG' : '代表 MAG'} · {overview.provenance.version}</p></div>
      <button ref={closeButton} type="button" className="mag-detail-drawer__close" aria-label="关闭 MAG 详情" onClick={onClose}>×</button></header>
      <div className="mag-detail-tabs" role="tablist" aria-label="MAG 证据类型">{TABS.map(([key, label], index) => <button key={key} id={`mag-tab-${key}`} role="tab" type="button" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} aria-controls="mag-detail-panel" onClick={() => setTab(key)}
        onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
          if (next != null) { event.preventDefault(); setTab(TABS[next][0]); dialog.current.querySelector(`#mag-tab-${TABS[next][0]}`).focus(); } }}>{label}</button>)}</div>
      <section id="mag-detail-panel" role="tabpanel" aria-labelledby={`mag-tab-${tab}`} className="mag-detail-drawer__body">
        {error ? <ErrorState message={error.message} onRetry={() => { catalog.refetch(); evidence.refetch(); distribution.refetch(); }} /> : null}
        {(catalog.isPending || (overview.capabilities.lineage && evidence.isPending)) && <LoadingState message="正在关联分类、质量与来源证据…" />}
        {tab === 'abundance' && <>
          <h3>当前样本范围</h3><p>AD {overview.provenance.groupCounts.AD} / NC {overview.provenance.groupCounts.NC} · 阈值 {scope.abundanceThresholdPercent}%</p>
          {isMember && <p className="mag-inline-notice">当前成员未单独进入代表 MAG 丰度矩阵。下列结果属于 {representative}，不能解释为成员自身的丰度。</p>}
          {distribution.isPending && !error ? <LoadingState /> : distribution.data && <EvidenceList items={[
            ['AD / NC 平均相对丰度', `${number(distribution.data.feature.adMeanPercent)} / ${number(distribution.data.feature.ncMeanPercent)}%`],
            ['AD / NC 中位数', `${number(distribution.data.feature.adMedianPercent)} / ${number(distribution.data.feature.ncMedianPercent)}%`],
            ['AD / NC 超过阈值的样本比例', `${number(distribution.data.feature.adAboveThresholdPercent)} / ${number(distribution.data.feature.ncAboveThresholdPercent)}%`],
            ['秩效应量（正值为 AD 较高）', number(distribution.data.feature.rankBiserial)],
            ['p 值 / BH-FDR q', `${number(distribution.data.feature.pValue)} / ${number(distribution.data.feature.qValue)}`],
            ['多重检验族', `${distribution.data.provenance.testedFeatureCount} 个 MAG`],
          ]} />}
          <p className="mag-muted">相对丰度保留上游百分比；阈值为严格大于，非检出判据。组间检验未做协变量校正；这些结果用于生成研究线索。</p>
        </>}
        {tab === 'taxonomy' && <><h3>代表 MAG 分类与参考</h3>{taxonomy ? <EvidenceList items={[...RANKS.map(([key, label]) => [label, taxonomy[key] || '未解析']),
          ['分类方法', taxonomy.classificationMethod], ['最近参考', taxonomy.closestReference], ['参考 ANI', taxonomy.closestAni == null ? '未提供' : `${number(taxonomy.closestAni)}%`],
          ['参考比对比例 AF', percent(taxonomy.closestAf)], ['MSA 比例', taxonomy.msaPercent == null ? '未提供' : `${number(taxonomy.msaPercent)}%`]]} /> : <p>该版本未提供完整分类证据。</p>}
          {crosswalk && <><h3>分类标识符对应</h3><EvidenceList items={[
            ['GTDB 参考 accession', crosswalk.gtdbReferenceAccession], ['NCBI species TaxID', crosswalk.ncbiSpeciesTaxid], ['NCBI 名称', crosswalk.ncbiOrganismName],
            ['Kraken / Bracken 物种', crosswalk.krakenSpeciesName], ['匹配状态', crosswalk.mappingStatus === 'matched_exact_ncbi_species_taxid' ? '精确 TaxID 对应' : crosswalk.mappingStatus === 'ncbi_species_taxid_not_observed_in_reads' ? 'TaxID 有效，本批未观察到' : '未解析'],
          ]} /></>}<p className="mag-muted">分类标识符对应不证明 reads 直接比对到具体 MAG；未解析结果不按名称相似度补成确定匹配。</p></>}
        {tab === 'quality' && <><h3>{isMember ? '成员质量与代表组装信息' : '质量与组装'}</h3>
          {isMember && member && <EvidenceList items={[
            ['成员完整度', `${number(member.memberCompletenessPercent)}%`], ['成员污染率', `${number(member.memberContaminationPercent)}%`],
          ]} />}
          {quality ? <><p className="mag-muted">以下组装指标属于代表 MAG：{representative}</p><EvidenceList items={[
            ['完整度 / 污染率', `${number(quality.completenessPercent)}% / ${number(quality.contaminationPercent)}%`], ['CheckM2 模型', quality.completenessModel],
            ['N50', `${integer(quality.contigN50Bp)} bp`], ['基因组长度', `${integer(quality.genomeSizeBp)} bp`], ['Contigs', integer(quality.totalContigs)],
            ['最长 Contig', `${integer(quality.maxContigLengthBp)} bp`], ['GC', percent(quality.gcContent)], ['编码密度', percent(quality.codingDensity)], ['预测编码序列', integer(quality.totalCodingSequences)],
          ]} /></> : <p>该版本未提供代表 MAG 组装指标。</p>}
          <p className="mag-inline-notice">完整度≥90% 且污染率≤5% 为参考区间；rRNA / tRNA 证据尚缺，不据此宣称完整 MIMAG 高质量判定。</p></>}
        {tab === 'lineage' && <><h3>成员到代表 MAG 的证据</h3>{member ? <EvidenceList items={[
          ['聚类 / 成员数', `${member.clusterId} / ${member.clusterMemberCount}`], ['代表 MAG', member.representativeMag], ['来源样本', member.memberSourceSampleId],
          ['疾病 / 来源组 / 批次', `${member.memberDisease} / ${member.memberGroup} / ${member.memberHpcBatch}`], ['实际 ANI', percent(member.memberToRepAni)],
          ['成员→代表基因组比对比例', percent(member.memberToRepAlignmentCoverage)], ['算法 / 聚类方法', `${member.comparisonAlgorithm} / ${member.clusterMethod}`],
          ['比对方向', '代表为 reference，成员为 query'],
        ]} /> : <p>来源与去冗余证据尚未接入。</p>}
          {member?.memberToRepAni < 0.95 && <p className="mag-inline-notice">实际 ANI 低于 95%，保留原值；average linkage 不保证每位成员都达到名义阈值。</p>}
          <p className="mag-muted">来源成员数不等于样本丰度或检出率；CHN / CHN2 是来源组，非已完成的外部验证。完整 dRep 版本、命令和代表选择权重待补。</p></>}
        {tab === 'function' && <MagPlanCard plan={MAG_RESEARCH_PLANS[0]} />}
      </section>
      <footer><button type="button" disabled={!canNavigate} className="analysis-button analysis-button--primary" onClick={() => onNavigate('distribution', representative)}>查看分布图</button>
        <button type="button" disabled={!canNavigate} className="analysis-button" onClick={() => onNavigate('heatmap', representative)}>加入热图候选</button>
        {overview.capabilities.lineage && <button type="button" disabled={!canNavigate} className="analysis-button" onClick={() => onNavigate('lineage', representative)}>查看所在聚类</button>}</footer>
    </div>
  </dialog>;
}
