import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGmrepoAudit, getGmrepoDistribution, getGmrepoStatistics, getGmrepoEvidence } from '../../api/gmrepo';
import StyledSelect from '../../components/ui/StyledSelect';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import PaginationControls from '../../components/data-display/PaginationControls';

const GenusDistributionChart = lazy(() => import('./GenusDistributionChart'));
const num = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumSignificantDigits: 5 });
const probability = value => value == null ? '—' : value === 0 ? '< 机器精度' : value < .001 ? Number(value).toExponential(2) : Number(value).toFixed(4);
const labels = { concordant_exploratory: '调整前后同向且均通过 FDR', direction_conflict: '调整前后方向不一致', unadjusted_only: '仅未调整通过 FDR', adjusted_only: '仅调整后通过 FDR', not_fdr_supported: '未获 FDR 支持' };
const eligible = value => value === 'eligible' ? '可做探索性检验' : '暂缓检验';

function AuditTable({ items, choose, active }) {
  return <div className="gmrepo-table-scroll" tabIndex={0} role="region" aria-label="推断前核查表"><table>
    <thead><tr><th>队列</th><th>可画图 AD / NC</th><th>已知参与者 / 元数据 Run</th><th>重复编号</th><th>未调整检验</th><th>年龄/性别调整</th></tr></thead>
    <tbody>{items.map(item => <tr key={item.projectId} aria-selected={active === item.projectId}>
      <th scope="row"><button type="button" className="gmrepo-text-button" onClick={() => choose(item.projectId)}>{item.projectId}</button></th>
      <td>{item.groupCounts.AD || 0} / {item.groupCounts.NC || 0}</td><td>{item.uniqueKnownParticipants} / {item.metadataRuns}</td>
      <td>{item.knownParticipantRuns === item.metadataRuns ? item.repeatedParticipantIds : '关系待核对'}</td>
      <td><span className={`gmrepo-status gmrepo-status--${item.unadjustedStatus === 'eligible' ? 'plot_ready' : 'pending'}`}>{eligible(item.unadjustedStatus)}</span></td>
      <td>{eligible(item.adjustedStatus)}{item.adjustedStatus === 'eligible' ? <small>{item.adjustedCount} 人完整协变量</small> : null}</td>
    </tr>)}</tbody>
  </table></div>;
}

function AuditDetails({ audit }) {
  return <div className="gmrepo-audit-details">
    <p>{audit.reviewNote}</p>
    <p>分组已核对 AD/NC {audit.groupConfirmedRuns} Run；其中 {audit.excludedNoGenusRuns} 条完全没有可确认目标属信息，分布图与检验保留 {audit.plotReadyRuns} 条。</p>
    {audit.unadjustedReasons.length ? <div className="gmrepo-inference-pending"><strong>差异检验暂缓</strong><ul>{audit.unadjustedReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div> : null}
    {audit.unadjustedStatus === 'eligible' && audit.adjustedReasons.length ? <p className="gmrepo-inference-pending">调整模型暂缓：{audit.adjustedReasons.join(' ')}</p> : null}
    <div className="gmrepo-table-scroll" tabIndex={0} role="region" aria-label="所选队列协变量核查表"><table>
      <thead><tr><th>组别</th><th>图表 Run</th><th>精确年龄 / 中位数</th><th>性别类别可用</th><th>完整协变量</th></tr></thead>
      <tbody>{audit.covariates.map(row => <tr key={row.group}><th scope="row">{row.group}</th><td>{row.count}</td>
        <td>{row.ageKnown} / {num(row.ageMedian)} 岁{row.ageIntervalCount ? <small>{row.ageIntervalCount} 条年龄区间保留，未代入精确年龄</small> : null}</td>
        <td>{row.sexKnown} / {row.count}<small>{Object.entries(row.sexCategories).map(([key, value]) => `${{ female: '女', male: '男', unknown: '未知' }[key] || `原码 ${key}`}: ${value}`).join(' · ')}</small></td>
        <td>{row.adjustedCount}</td></tr>)}</tbody>
    </table></div>
    <details className="gmrepo-evidence"><summary>身份与协变量核查依据</summary>
      <p>全部队列记录的参与者编号用于排查重复，再固定属级图表可用 AD/NC 子集。缺少协变量排除 {audit.excludedMissingCovariates} 条；没有用数值猜测年龄或填补性别。</p>
      {audit.sexMode === 'author_code' ? <p>原性别代码作为类别因子；1/2 的男女含义仍未解码。</p> : null}
      {audit.design.rank != null ? <p>设计矩阵秩 {audit.design.rank} · 残差自由度 {audit.design.residualDf} · 条件数 {num(audit.design.conditionNumber)} · 最大杠杆值 {num(audit.design.maxLeverage)}。</p> : null}
      {audit.sourceUrl ? <p><a href={audit.sourceUrl} target="_blank" rel="noreferrer">原研究 ↗</a></p> : null}
      <ul>{audit.evidenceFiles.map(file => <li key={file}>{file}</li>)}</ul>
    </details>
  </div>;
}

function PointTable({ data }) {
  return <details className="gmrepo-evidence"><summary>查看全部 {data.points.length} 个散点的样本与质量记录</summary>
    <div className="gmrepo-table-scroll gmrepo-point-table" tabIndex={0} role="region" aria-label="菌属分布样本表"><table>
      <thead><tr><th>Run / 参与者</th><th>分组</th><th>原丰度（%）</th><th>待解析（%）</th><th>年龄</th><th>性别</th><th>来源 QC / 读取数</th></tr></thead>
      <tbody>{data.points.map(p => <tr key={p.runId}><th scope="row"><a href={`https://www.ebi.ac.uk/ena/browser/view/${encodeURIComponent(p.runId)}`} target="_blank" rel="noreferrer">{p.runId} ↗</a><small>{p.participantId || '参与者待核对'}</small></th>
        <td>{p.group}</td><td>{num(p.value)}</td><td>{num(p.unresolvedPercent)}</td><td>{p.ageYears ?? p.ageRaw ?? '—'}</td>
        <td>{{ female: '女', male: '男', unknown: '未知' }[p.sex]}{p.sourceSexCode ? <small>原码 {p.sourceSexCode}</small> : null}</td><td>{p.qcStatus || '—'} / {num(p.readCount)}</td></tr>)}</tbody>
    </table></div>
  </details>;
}

function SelectedStatistic({ data }) {
  const row = data.statistic;
  if (!row) return <p className="gmrepo-note">本队列仍可查看分布，受试者或协变量前提不足时不展示 p/q。</p>;
  const adjusted = row.adjusted;
  return <div className="gmrepo-selected-statistic">
    <div><span>未调整 · 秩二列相关</span><strong>{num(row.rankBiserial)}</strong>
      <p>95% CI {data.rankBiserialCi ? data.rankBiserialCi.map(num).join(' ～ ') : '—'}<br />p = {probability(row.pValue)} · q = {probability(row.qValue)}</p></div>
    <div><span>年龄 / 性别调整 · 百分位秩点差</span><strong>{num(adjusted?.effect)}</strong>
      <p>95% CI {adjusted?.ciLow != null ? `${num(adjusted.ciLow)} ～ ${num(adjusted.ciHigh)}` : '—'}<br />p = {probability(adjusted?.pValue)} · q = {probability(adjusted?.qValue)}</p></div>
    <p className="gmrepo-signal-label">{labels[row.signalStatus]}。正效应表示 AD 倾向更高；结果仅供提出研究线索。</p>
    <details className="gmrepo-evidence"><summary>效应区间和解释</summary><p>{data.ciMethod}</p><p>未调整检验使用完整图表子集；调整检验使用年龄和性别均可用的子集。调整系数是百分位秩位置差，不能读作原丰度百分点差。</p></details>
  </div>;
}

function EvidenceComparison({ data }) {
  const primary = data.primary;
  return <section className="gmrepo-panel" aria-labelledby="gmrepo-comparison-title">
    <div className="gmrepo-panel-heading"><h2 id="gmrepo-comparison-title">证据对照 · {data.genus.name}</h2><p>核对本次队列内结果、GMrepo 来源 marker 和项目当前物种版本的对应关系。</p></div>
    <div className="gmrepo-comparison-grid">
      <article><h3>GMrepo 来源证据</h3>{data.sourceMarkers.length ? data.sourceMarkers.map(marker => <div className="gmrepo-marker" key={`${marker.sourceTaxonId}:${marker.sourceFile}`}>
        <p><strong>{marker.sourceName}</strong> · 来源 LDA {num(marker.lda)} · 来源倾向 {marker.direction}</p>
        <p>{marker.pureAdNc ? '来源标记为 AD/Health 比较；本次独立重算另列。' : '来源比较包含混合阶段，不能当作纯 AD/NC 证据。'} p/q：未提供。</p>
        <details className="gmrepo-evidence"><summary>来源记录</summary><p>{marker.comparisonStatus}</p><p>{marker.sourceFile}</p></details>
      </div>) : <p>来源接口未返回该属的 marker；不能解释为没有差异。</p>}
      <p className="gmrepo-note">{data.sourceNote}</p></article>
      <article><h3>项目当前数据 · 分类覆盖</h3>{primary.status === 'available' ? <>
        <p>{primary.cohortId || '来源待核查'} · {primary.sampleCount} 条样本（AD {primary.groupCounts.AD || 0} / NC {primary.groupCounts.NC || 0}）</p>
        <p>主物种矩阵精确属名对应 <strong>{primary.matchedFeatureCount}</strong> 个物种特征。丰度单位：{primary.abundanceScale === 'unknown' ? '待核对' : primary.abundanceScale}；标准化：{primary.normalization === 'unknown' ? '待核对' : primary.normalization}。</p>
        {primary.cohortEvidence?.status === 'source_bound' ? <details className="gmrepo-evidence"><summary>主队列来源与样本纳入</summary><p>{primary.cohortEvidence.selection}</p><p>{primary.cohortEvidence.participantNote}</p><p>{primary.cohortEvidence.crossCohortNote}</p></details> : null}
        <details className="gmrepo-evidence"><summary>物种对应与数据版本</summary><p>{primary.matchMethod}</p>
          <p>当前版本 {primary.datasetRevision}</p><p className="gmrepo-fingerprint">源数据 SHA-256：{primary.sourceSha256}</p>
          <ul>{primary.speciesPreview.map(species => <li key={species.featureId}>{species.name}（源属名 {species.sourceGenus}）</li>)}</ul>
          {primary.matchedFeatureCount > primary.speciesPreview.length ? <p>仅列前 {primary.speciesPreview.length} 个；数量为完整匹配集合。</p> : null}</details>
      </> : <p>项目主数据当前不可读取，参考队列功能仍可使用。</p>}
        <div className="gmrepo-inference-pending"><strong>{primary.genusComparison?.statistic ? '同属探索性比较已计算 · 独立复现未认证' : '数值复现对照待核查'}</strong><ul>{primary.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>
        <p className="gmrepo-note">{primary.comparisonNote}</p>
      </article>
    </div>
  </section>;
}

function StatisticsTable({ data, query, onQuery, page, onPage, onGenus }) {
  return <section className="gmrepo-panel" aria-labelledby="gmrepo-statistics-title">
    <div className="gmrepo-panel-heading"><h2 id="gmrepo-statistics-title">完整菌属目录 · 探索性检验</h2><p>检验族固定 {data.familySize} 个属；每个队列分别校正。点击菌属可查看它的分布和证据。</p></div>
    {data.audit.unadjustedStatus === 'blocked' ? <p className="gmrepo-inference-pending">{data.audit.unadjustedReasons.join(' ')}</p> : <>
      <div className="gmrepo-statistic-summary"><span>未调整 q &lt; 0.05：{data.summary.unadjustedFdrCount}</span><span>调整后 q &lt; 0.05：{data.summary.adjustedFdrCount}</span><span>调整前后同向且均通过：{data.summary.concordantFdrCount}</span></div>
      <label className="gmrepo-statistic-search" htmlFor="gmrepo-statistic-search">检索菌属 / 旧名 / TaxID<input id="gmrepo-statistic-search" type="search" value={query} onChange={e => onQuery(e.target.value)} placeholder="例如 Bacteroides 或 816" /></label>
      <div className="gmrepo-table-scroll" tabIndex={0} role="region" aria-label="菌属探索性检验表"><table>
        <thead><tr><th>菌属</th><th>AD / NC 中位数（%）</th><th>AD / NC 检出（%）</th><th>秩二列相关</th><th>未调整 p / q</th><th>调整效应 [95% CI]</th><th>调整 p / q</th><th>研究线索状态</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.genus.featureId}><th scope="row"><button type="button" className="gmrepo-text-button" onClick={() => onGenus(row.genus.featureId)}>{row.genus.name}</button><small>{row.genus.featureId}</small></th>
          <td>{num(row.adMedianPercent)} / {num(row.ncMedianPercent)}</td><td>{num(row.adDetectedPercent)} / {num(row.ncDetectedPercent)}</td><td>{num(row.rankBiserial)}</td>
          <td>{probability(row.pValue)} / {probability(row.qValue)}</td><td>{num(row.adjusted?.effect)}<small>{row.adjusted?.ciLow != null ? `[${num(row.adjusted.ciLow)}, ${num(row.adjusted.ciHigh)}]` : row.adjusted?.status === 'constant' ? '常量属，无效应区间' : '无法估计区间'}</small></td>
          <td>{probability(row.adjusted?.pValue)} / {probability(row.adjusted?.qValue)}</td><td>{labels[row.signalStatus]}</td></tr>)}</tbody>
      </table>{!data.items.length ? <p className="gmrepo-empty">目录没有匹配项；检索不改变原 {data.familySize} 属检验族的 q 值。</p> : null}</div>
      <p className="gmrepo-note">当前匹配 {data.total} 个属 · 未调整 AD {data.audit.groupCounts.AD} / NC {data.audit.groupCounts.NC} · 调整模型 {data.audit.adjustedCount} 人。检出指丰度大于 0。</p>
      <PaginationControls page={page} pageCount={Math.max(1, Math.ceil(data.total / 25))} onPageChange={onPage} ariaLabel="菌属统计分页" />
    </>}
    <details className="gmrepo-evidence"><summary>统计方法、假设与限制</summary><p>{data.methods.unadjusted}</p><p>{data.methods.adjusted}</p><p>{data.methods.fdr}</p>
      <ul>{data.methods.limits.map(text => <li key={text}>{text}</li>)}</ul>
      <ul>{data.methods.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a></li>)}</ul>
    </details>
  </section>;
}

function exportEvidence(distribution, evidence, methods) {
  const record = { exportedAt: new Date().toISOString(), distribution, evidence, methods };
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `gmrepo-${distribution.cohort}-${distribution.genus.featureId.replace(':', '-')}-evidence.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function GenusWorkspace({ revision, genera, params, update, hideAudit = false, sourceRevision = '', datasetSlug = 'ad-nc-species' }) {
  const [transform, setTransform] = useState('raw');
  const audit = useQuery({ queryKey: ['gmrepo', 'audit', revision], retry: false,
    queryFn: ({ signal }) => getGmrepoAudit({ revision }, { signal }) });
  const cohort = params.get('analysisCohort') || audit.data?.items.find(item => item.unadjustedStatus === 'eligible')?.projectId || audit.data?.items[0]?.projectId || '';
  const genus = params.get('analysisGenus') || genera.find(item => item.featureId === 'NCBI:816')?.featureId || genera[0]?.featureId || '';
  const query = params.get('analysisQuery') || '';
  const requestedPage = Number(params.get('analysisPage') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const enabled = !!cohort && !!genus;
  const distribution = useQuery({ queryKey: ['gmrepo', 'distribution', revision, cohort, genus], enabled, retry: false,
    queryFn: ({ signal }) => getGmrepoDistribution({ revision, cohort, genus }, { signal }) });
  const statistics = useQuery({ queryKey: ['gmrepo', 'statistics', revision, cohort, query, page], enabled: !!cohort, retry: false,
    queryFn: ({ signal }) => getGmrepoStatistics({ revision, cohort, query, limit: 25, offset: (page - 1) * 25 }, { signal }) });
  const evidence = useQuery({ queryKey: ['gmrepo', 'evidence', revision, cohort, genus, sourceRevision, datasetSlug], enabled, retry: false,
    queryFn: ({ signal }) => getGmrepoEvidence({ revision, cohort, genus, ...(sourceRevision ? { sourceRevision, datasetSlug } : {}) }, { signal }) });
  const change = (key, value) => update(key, value);
  if (audit.isPending) return <LoadingState />;
  if (audit.error) return <ErrorState message={audit.error.message} onRetry={audit.refetch} />;
  if (!audit.data.items.length) return <p className="gmrepo-empty">当前版本没有可画图的 AD/NC 队列。</p>;
  return <div className="gmrepo-genus-workspace">
    {!hideAudit ? <section className="gmrepo-panel" aria-labelledby="gmrepo-audit-title">
      <div className="gmrepo-panel-heading"><h2 id="gmrepo-audit-title">推断前核查 · 受试者、重复采样与协变量</h2><p>分布图可覆盖 {audit.data.items.length} 个可用队列；检验只在身份审查和模型前提通过后开放。点击队列查看对应分布。</p></div>
      <AuditTable items={audit.data.items} choose={value => change('analysisCohort', value)} active={cohort} />
    </section> : null}
    <section className="gmrepo-panel" aria-labelledby="gmrepo-distribution-title">
      <div className="gmrepo-panel-heading evaluation-section-heading"><h2 id="gmrepo-distribution-title">菌属分布 · 同一队列 AD / NC</h2>{hideAudit ? <span>{cohort} · {genera.find(item => item.featureId === genus)?.name}</span> : null}</div>
      <div className={`gmrepo-analysis-filters${hideAudit ? ' evaluation-distribution-controls' : ''}`}>
        <label htmlFor="gmrepo-analysis-cohort">分布与检验队列<StyledSelect id="gmrepo-analysis-cohort" value={cohort} onChange={e => change('analysisCohort', e.target.value)}>{audit.data.items.map(item => <option key={item.projectId} value={item.projectId}>{item.projectId}</option>)}</StyledSelect></label>
        {!hideAudit ? <label htmlFor="gmrepo-analysis-genus">研究菌属<StyledSelect id="gmrepo-analysis-genus" value={genus} onChange={e => change('analysisGenus', e.target.value)}>{genera.map(item => <option key={item.featureId} value={item.featureId}>{item.name} · {item.featureId}</option>)}</StyledSelect></label> : null}
        <label htmlFor="gmrepo-analysis-transform">图表尺度<StyledSelect id="gmrepo-analysis-transform" value={transform} onChange={e => setTransform(e.target.value)}><option value="raw">原始相对丰度（%）</option><option value="log">log10(丰度 % + 1)</option></StyledSelect></label>
      </div>
      {distribution.error ? <ErrorState message={distribution.error.message} onRetry={distribution.refetch} /> : distribution.isPending ? <LoadingState /> : distribution.data ? <>
        <div className="gmrepo-distribution-heading"><h3>{hideAudit ? cohort : distribution.data.genus.name} <small>{hideAudit ? `${distribution.data.genus.name} · ${distribution.data.genus.featureId}` : `${distribution.data.genus.featureId} · ${cohort}`}</small></h3>
          <button type="button" className="analysis-button" disabled={!evidence.data} onClick={() => exportEvidence(distribution.data, evidence.data, audit.data.methods)}>下载所选菌属证据 JSON</button></div>
        <Suspense fallback={<LoadingState />}><GenusDistributionChart data={distribution.data} transform={transform} /></Suspense>
        <p className="gmrepo-note">{distribution.data.note} 变换只改变展示，检验始终使用原相对丰度的秩。</p>
        <div className="gmrepo-distribution-summary">{distribution.data.boxes.map(box => <span key={box.group}>{box.group}：{box.count} Run · 中位数 {num(box.box?.[2])}% · 检出 {box.detectedCount}/{box.count}</span>)}</div>
        <PointTable data={distribution.data} />
        {hideAudit && distribution.data.audit.unadjustedReasons.length ? <p className="gmrepo-inference-pending">检验暂缓：{distribution.data.audit.unadjustedReasons.join(' ')}</p> : null}
        {hideAudit ? <details className="evaluation-audit-disclosure"><summary>参与者、协变量与检验资格</summary><AuditDetails audit={distribution.data.audit} /></details> : <AuditDetails audit={distribution.data.audit} />}
        {evidence.error ? <ErrorState title="证据读取失败" message={evidence.error.message} onRetry={evidence.refetch} /> : evidence.isPending ? <LoadingState /> : evidence.data ? <SelectedStatistic data={evidence.data} /> : null}
      </> : null}
    </section>
    <details className="gmrepo-evidence" open={!hideAudit}><summary>完整菌属统计目录与方法（检索不改变检验族）</summary>
      {statistics.error ? <ErrorState message={statistics.error.message} onRetry={statistics.refetch} /> : statistics.isPending ? <LoadingState /> : statistics.data ?
        <StatisticsTable data={statistics.data} query={query} onQuery={value => change('analysisQuery', value)} page={page} onPage={value => change('analysisPage', value)} onGenus={value => change('analysisGenus', value)} /> : null}
    </details>
    {evidence.data ? hideAudit ? <details className="evaluation-source-disclosure"><summary>来源 marker 与主数据分类对照</summary><EvidenceComparison data={evidence.data} /></details> : <EvidenceComparison data={evidence.data} /> : null}
  </div>;
}
