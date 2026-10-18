import { useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { referenceHref, referenceParams, subjectHref } from './referenceNavigation';
import { getGmrepoResources } from '../../api/gmrepo';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import ResearchEvidenceDetails from './ResearchEvidenceDetails';

const groupLabels = { unresolved: '分组待核查', at_risk: '风险组', cognitively_normal_amyloid_status_unresolved: '临床前研究', other: '其他' };

function InventoryCoverage({ discovery }) {
  const inventory = discovery.coverage?.allRunInventory;
  if (!inventory) return null;
  return <details className="reference-ledger-summary"><summary>来源清点：{inventory.uniqueRuns.toLocaleString()} 个去重 Run · 已知项目编号 {inventory.unionProjects} / {inventory.sourceProjects}</summary>
    <p>实际读取 {inventory.retrievedRows.toLocaleString()} 条 Run × 表型记录；{inventory.multiLabelRuns} 个 Run 有多个标签，不能重复计样本。分页已到末页，去重 Run 总数与源端一致。</p>
    <p>项目描述返回 {inventory.descriptionProjects} 项，Run 目录含 {inventory.retrievedProjects} 个项目，两者联合取得 {inventory.unionProjects} 个编号；仍有 {inventory.unrecoveredProjectIdentities} 项编号未恢复。</p>
    <p>另找回项目：{inventory.projectsMissingFromDescriptionCatalog.join('、')}。{inventory.recoveredDescriptionStatus}</p>
    <p>最初缺失 111 项描述，本轮补齐 5 项；另 106 项身份与描述仍缺，不宣称全库 AD 研究覆盖。</p>
    {discovery.coverage.recoveredProjectScreening?.map(row => <p key={row.projectId}>{row.projectId}：{row.disposition === 'outside_scope_autism' ? '原描述为自闭症研究，不纳入 AD 候选' : '重新测序描述未命中所列 AD/认知检索词，不新增 AD 候选'}。</p>)}</details>;
}

function SourceDetails({ row }) {
  return <details><summary>核查记录</summary><p>{row.reviewNote}</p><p>{row.platformReview}</p>
    <p>来源字段：{row.libraryStrategies.join(' / ')} · {row.sourceExperimentTypes.join(' / ')}</p>
    <p>跨研究独立性待核查；旧快照获取凭证待补。</p>
    <ul>{row.evidenceFiles.map(file => <li key={file.path}>{file.path}：{file.available ? '运行包可读取' : '仅有引用，归档原件待补'}</li>)}</ul></details>;
}

export default function ReferenceRegistry({ revision, view = 'directory' }) {
  const [params, setParams] = useSearchParams();
  const query = params.get('studyQuery') || '';
  const readiness = params.get('readiness') || 'all';
  const selected = params.get('study') || '';
  const context = referenceParams(params, { revision });
  const update = changes => setParams(referenceParams(params, changes));
  const state = useQuery({ queryKey: ['gmrepo', 'resources', revision], enabled: !!revision, retry: false,
    queryFn: ({ signal }) => getGmrepoResources({ revision }, { signal }) });
  if (state.isPending) return <LoadingState message="正在读取接入登记与核查状态…" />;
  if (state.error) return <ErrorState title="接入登记暂不可用" message={state.error.message} onRetry={state.refetch} />;
  const { items, protocol, discovery, counts, researchLedger, primaryContext } = state.data;
  if (view === 'directory') {
    const availability = row => row.unadjustedStatus === 'eligible' ? 0 : row.plotReadyRuns ? 1 : 2;
    const pending = (researchLedger?.records || []).filter(row => !row.installed).map(record => ({ projectId: record.projectId, researchRecord: record,
      researchGroups: [record.fields.stages?.value || '来源表型待核查'], platform: record.fields.sourcePlatform?.value || '来源平台待核查', unadjustedStatus: 'not_loaded', plotReadyRuns: 0, metadataRuns: null, completeProfiles: null,
      originalStudyUrl: record.sourceUrl, reviewNote: record.screening?.note || '仅在来源检索中发现；尚未审查材料、疾病阶段与同研究对照，不纳入当前比较。' }));
    const candidates = readiness === 'discovered' ? pending : items;
    const filtered = candidates.filter(row => (readiness === 'plot' ? row.plotReadyRuns > 0 : readiness === 'eligible' ? row.unadjustedStatus === 'eligible' : readiness === 'metadata' ? !row.plotReadyRuns : true)
      && `${row.projectId} ${row.researchGroups.join(' ')} ${row.researchGroups.map(group => groupLabels[group] || group).join(' ')} ${row.platform} ${Object.values(row.researchRecord?.fields || {}).map(field => Array.isArray(field.value) ? field.value.join(' ') : field.value || '').join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => availability(a) - availability(b) || a.projectId.localeCompare(b.projectId));
    return <section className="evaluation-registry" aria-labelledby="reference-registry-title">
      <div className="gmrepo-panel-heading evaluation-section-heading"><div><h2 id="reference-registry-title">研究目录</h2><p>选择研究查看分组依据，继续核查质量或进入菌属分布。</p></div>
        <span>{counts.installedProjects} 项研究项目 · {counts.metadataRuns?.toLocaleString() ?? '—'} Run · {counts.completeProfiles?.toLocaleString() ?? '—'} 完整 profile</span></div>
      <InventoryCoverage discovery={discovery} />
      <div className="reference-directory-toolbar"><div className="reference-readiness" aria-label="按可用范围筛选">{[
        ['all', '已接入项目', counts.installedProjects], ['plot', '分布可用', counts.plotCohorts], ['eligible', '队列内可检验', counts.testableCohorts], ['metadata', '元数据与阶段参考', counts.installedProjects - counts.plotCohorts], ['discovered', '补充发现', pending.length],
      ].map(([key, label, count]) => <button key={key} type="button" aria-pressed={readiness === key} onClick={() => update({ readiness: key === 'all' ? null : key })}>{label}<span>{count}</span></button>)}</div>
        <label className="reference-study-search"><span className="sr-only">检索研究项目</span><input type="search" value={query} onChange={event => update({ studyQuery: event.target.value })} placeholder="搜索项目编号 / 分组 / 平台" /></label></div>
      <div className="gmrepo-table-scroll" role="region" tabIndex={0} aria-label="研究接入与检验资格"><table className="evaluation-directory-table"><thead><tr>
        <th>研究项目 / 分组</th><th>数据可用性<small>完整 profile / 元数据 Run</small></th><th className="evaluation-numeric">AD / NC<small>图表可用 Run</small></th><th>使用范围</th><th>继续查看</th>
      </tr></thead><tbody>{filtered.map(row => <Fragment key={row.projectId}><tr aria-selected={selected === row.projectId}>
        <th scope="row"><button type="button" className="gmrepo-text-button" aria-label={row.projectId} aria-expanded={selected === row.projectId} aria-controls={`study-${row.projectId}`} onClick={() => update({ study: selected === row.projectId ? null : row.projectId })}>{row.projectId}</button>
          {row.researchRecord?.fields.studyTitle?.value || row.researchRecord?.fields.projectTitle?.value ? <small className="reference-study-title">{row.researchRecord.fields.studyTitle?.value || row.researchRecord.fields.projectTitle.value}</small> : null}<small className="reference-study-groups">{row.researchGroups.map(group => groupLabels[group] || group).join(' / ')}</small></th>
        <td>{row.metadataRuns == null ? <span className="reference-muted">未接入，尚无本地分母</span> : <><span className="reference-profile-count">{row.completeProfiles} <span>/ {row.metadataRuns}</span></span><div className="reference-profile-track" aria-hidden="true"><span style={{ width: `${row.metadataRuns ? Math.min(100, row.completeProfiles / row.metadataRuns * 100) : 0}%` }} /></div></>}</td>
        <td className="evaluation-numeric">{row.plotReadyRuns ? `${row.adRuns} / ${row.ncRuns}` : <span className="reference-muted">暂不可用</span>}</td>
        <td><span className={`reference-use-label${row.unadjustedStatus === 'eligible' ? ' is-eligible' : ''}`}>{row.unadjustedStatus === 'eligible' ? '队列内可检验' : row.plotReadyRuns ? '仅分布 · 暂缓检验' : row.metadataRuns == null ? ({ outside_scope: '已排除 · 范围不符', awaiting_acquisition: '相关项目 · 待取得数据', stage_reference: '相关阶段 · 未接入', insufficient_information: '已核查来源 · 条件不足' })[row.researchRecord?.screening?.status] || '来源候选 · 资料不足' : '元数据 / 阶段参考'}</span><small>{row.platform}</small></td>
        <td>{row.metadataRuns == null ? <button type="button" className="gmrepo-text-button" onClick={() => update({ study: row.projectId })}>查看接入缺项</button> : <Link className="reference-row-action" to={referenceHref(context, { section: 'quality', cohort: row.projectId, group: null, scope: null, page: null, study: row.projectId })}>质量与样本 →</Link>}</td></tr>
        {selected === row.projectId ? <tr className="reference-study-expanded"><td colSpan={5} id={`study-${row.projectId}`}>
          <div className="reference-study-detail"><div className="reference-study-detail-heading"><h3>{row.projectId} · 队列详情</h3><button type="button" className="gmrepo-text-button" onClick={() => update({ study: null })}>收起详情</button></div>
            <p>{row.reviewNote}</p>{row.metadataRuns != null ? <div className="reference-study-detail-facts"><span>元数据 <strong>{row.metadataRuns} Run</strong></span><span>完整丰度 <strong>{row.completeProfiles} profile</strong></span><span>可用分布 <strong>{row.plotReadyRuns} Run</strong></span><span>待解析比例中位数 <strong>{row.unresolvedMedianPercent == null ? '—' : `${Number(row.unresolvedMedianPercent).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}%`}</strong></span></div> : null}
            <div className="reference-study-detail-actions">{row.plotReadyRuns ? <Link className="analysis-button" to={params.has('subjectId') || params.has('analysisGenus') ? subjectHref(context, { cohort: row.projectId }) : referenceHref(context, { section: 'genera', cohort: row.projectId })}>{params.has('subjectId') || params.has('analysisGenus') ? '查看当前对象的队列证据' : '选择菌属查看分布'} →</Link> : <span className="gmrepo-note">{row.metadataRuns == null ? '来源发现不等于已接入；当前没有本地丰度、分组或比较集合。' : '当前无 AD/NC 图表子集；保留元数据，不补造对照或检验。'}</span>}
              {row.originalStudyUrl ? <a href={row.originalStudyUrl} target="_blank" rel="noreferrer">原研究 ↗</a> : <span className="gmrepo-note">原研究待关联</span>}</div>
            <ResearchEvidenceDetails record={row.researchRecord} />{row.metadataRuns != null ? <SourceDetails row={row} /> : null}</div>
        </td></tr> : null}</Fragment>)}</tbody></table>
        {!filtered.length ? <p className="gmrepo-empty">没有匹配的研究项目。</p> : null}</div>
      <p className="gmrepo-note">当前显示 {filtered.length} / {candidates.length} 个项目，按可用范围排列，不按显著性排序。可用 AD/NC 仅计属级图表子集；研究项目不等于独立研究或独立参与者。检索仅筛选目录，不改变检验族。</p>
      <div className="reference-directory-next"><span>从分类特征出发？可检索版本内菌属，再比较外部队列。</span><Link to={referenceHref(context, { section: 'genera' })}>浏览菌属目录 →</Link><Link to={referenceHref(context, { section: 'methods' })}>{discovery.status === 'partial' ? '检索范围部分完成 · 查看来源' : '查看来源与接入范围'} →</Link></div>
    </section>;
  }
  return <section className="gmrepo-panel evaluation-registry" aria-labelledby="reference-registry-title">
    <div className="gmrepo-panel-heading"><h2 id="reference-registry-title">来源范围与接入方法</h2>
      <p>GMrepo 是来源；样本分组、比较资格与用途由本项目另行核查。</p></div>
    <p className="evaluation-scope-note">{discovery.note}</p>
    {researchLedger ? <div className="reference-ledger-summary"><p>研究来源登记 {researchLedger.counts.registeredProjects} 项 · 已接入 {researchLedger.counts.installedProjects} 项 · 补充发现 {researchLedger.counts.discoveredNotInstalled} 项（含有依据的排除记录）。研究间及主外参与者关系尚未充分明确，不报告独立验证数量。</p><details><summary>登记版本、实际检索与剩余范围</summary><p>按已取得来源回顾性整理，不是预注册，也不代表全库覆盖。</p><p>登记版本：{researchLedger.version}</p><p className="reference-fingerprint">登记指纹：{researchLedger.registryFingerprint}<br />来源清单指纹：{researchLedger.discoveryFingerprint || '不可读取'}</p><p>计划范围：{researchLedger.scope.planned.join('；')}</p><p>未覆盖范围：{researchLedger.scope.remaining.join('；')}</p></details></div> : null}
    {discovery.retrievedAt ? <p className="gmrepo-note">源库查询时间：{discovery.retrievedAt} · 检索状态：{discovery.status === 'partial' ? discovery.coverage?.keywordScope ? '已核对列明表型与返回项目；未覆盖范围见说明' : '已完成部分范围，阶段/关键词仍待补' : discovery.status}</p> : null}
    <InventoryCoverage discovery={discovery} />
    {discovery.scopes?.length ? <div className="gmrepo-table-scroll" role="region" tabIndex={0} aria-label="官方检索范围与分页核对">
      <table><thead><tr><th>查询表型</th><th>源端 Run / 实取 Run</th><th>源端项目</th><th>平台标注</th><th>完整性</th></tr></thead>
        <tbody>{discovery.scopes.map(scope => <tr key={scope.phenotype}><th>{scope.term}<small>{scope.phenotype}</small></th><td>{scope.expectedRuns} / {scope.retrievedRuns}</td><td>{scope.apiProjects}</td>
          <td>{Object.keys(scope.platformTypes).join(' / ')}</td><td>{scope.paginationComplete ? '此表型分页已核对' : '此表型分页待补'}</td></tr>)}</tbody></table>
    </div> : null}
    {discovery.coverage ? <div className="reference-ledger-summary" aria-label="来源目录覆盖说明"><p>列明表型：{discovery.coverage.status === 'complete_for_listed_phenotypes' ? '分页核对完成' : '分页尚未完整'} · 表型 Run 去重后 {discovery.coverage.uniqueRuns} 条 · 综合目录 {discovery.coverage.uniqueProjects} 个项目。各表型 Run 数可能重叠，不直接相加。</p><p>{discovery.coverage.scope}</p>{discovery.coverage.keywordScope ? <p>项目描述检索 {discovery.coverage.keywordScope.projectsScreened} / 源端总计 {discovery.coverage.keywordScope.sourceTotalProjects} 项，关键词命中 {discovery.coverage.keywordScope.matches} 项；未返回 {discovery.coverage.keywordScope.notReturnedProjects} 项。关键词命中须继续核对研究对象，不能直接作为 AD 队列。</p> : null}{discovery.coverage.globalSearchChecks?.length ? <details><summary>项目目录各渠道的查询结果</summary><ul>{discovery.coverage.globalSearchChecks.map(row => <li key={row.url}><a href={row.url} target="_blank" rel="noreferrer">官方目录来源 ↗</a> · {row.validation === 'valid' ? '响应格式已核验' : '本次响应不可用于清点'}<small>{row.retrievedAt}{row.error ? ` · ${row.error}` : ''}</small></li>)}</ul></details> : null}</div> : null}
    {discovery.exportDiscrepancy ? <p className="gmrepo-note">AD 静态 TSV {discovery.exportDiscrepancy.adTsvProjects} 项 / API {discovery.exportDiscrepancy.adApiProjects} 项；差异保留核查，不以静态导出代替完整 API 清点。本次列明表型的 Run 为扩增子标注；作者直接来源的 WGS 阶段参考另列来源，不计入 GMrepo 队列。</p> : null}
    {primaryContext?.status === 'source_bound' ? <details className="gmrepo-evidence"><summary>本项目主队列的纳入与受试者依据</summary><p>{primaryContext.selection}</p><p>{primaryContext.participantNote}</p><p>{primaryContext.crossCohortNote}</p><p>{primaryContext.pipelineNote}</p><p>公开受试者 ID 覆盖：{primaryContext.participantIdsAvailable} / {primaryContext.sampleCount}。已有样本信息支持分组与协变量核对，未作逐人重复采样验证。</p><ul>{primaryContext.sources.filter(s => ['primary-paper-record', 'primary-author-description', 'primary-ngdc-project'].includes(s.sourceId)).map(source => <li key={source.sourceId}><a href={source.url} target="_blank" rel="noreferrer">{({ 'primary-paper-record': '原论文题录与摘要', 'primary-author-description': '作者研究说明', 'primary-ngdc-project': 'NGDC 项目登记' })[source.sourceId]} ↗</a></li>)}</ul></details> : null}
    {discovery.projects?.length ? <details className="gmrepo-evidence"><summary>查看源库发现清单与本地差异（{discovery.projects.length} 项）</summary>
      <div className="gmrepo-table-scroll"><table><thead><tr><th>项目</th><th>发现范围</th><th>本地接入</th><th>平台核查</th></tr></thead>
        <tbody>{discovery.projects.map(row => <tr key={row.projectId}><th>{row.projectId}</th><td>{row.phenotype || '关键词补充'}</td><td>{row.installed ? '当前快照已接入' : '发现，尚未接入'}</td><td>{row.platform || '待核查'}</td></tr>)}</tbody></table></div>
      <ul>{discovery.queries?.map((q, index) => <li key={`${q.url}-${index}`}><a href={q.url} target="_blank" rel="noreferrer">{q.label || q.url}</a> · {q.status}</li>)}</ul>
    </details> : null}
    {researchLedger?.acquisitions.length ? <details className="gmrepo-evidence"><summary>来源获取回执与本地读回校验（{researchLedger.acquisitions.length}）</summary><ul className="reference-acquisition-list">{researchLedger.acquisitions.map((row, index) => <li key={`${row.file}-${index}`}><p><a href={row.url} target="_blank" rel="noreferrer">{row.method} · {row.file}</a> · {({ verified: '本地原件哈希一致', unavailable: '本地原件不可读取', integrity_error: '原件校验不一致，待核查' })[row.availability]}</p><p>获取：{row.retrievedAt} · {row.bytes} bytes · 请求范围：{JSON.stringify(row.body)}</p><small>{row.archivePath}/{row.file}<br />SHA256 {row.sha256}</small></li>)}</ul></details> : null}
    <details className="gmrepo-evidence"><summary>接入与评估方法</summary>
      <ol className="evaluation-pipeline">{protocol.steps.filter(step => step.key !== 'release').map(step => <li key={step.key}><span>{step.label}</span><small>{({ defined_pending_review: '已定义纳排规则', pending: '尚未建立', partial: '部分范围可用', reference_genus_only: '参考属级已处理', exploratory: '队列内探索性方法', implemented_with_gates: '按适用条件开放' })[step.status] || step.status}</small></li>)}</ol>
      <p>{protocol.selection}</p><p>{protocol.counting}</p><p className="gmrepo-note">规则版本 {protocol.version}。流程记录不等于临床验证或第三方认证。</p>
    </details>
  </section>;
}
