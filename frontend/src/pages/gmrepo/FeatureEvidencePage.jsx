import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getGmrepoCatalog, getGmrepoGenera, getGmrepoEvaluation, getGmrepoEvaluationPackage, resolveGmrepoSubject, gmrepoReportUrl, gmrepoReplayUrl } from '../../api/gmrepo';
import { safeAnalysisReturn } from '../../components/evidence/EvidenceLink';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import EvidenceHeader from './EvidenceHeader';
import ReferenceGenusBrowser from './ReferenceGenusBrowser';
import ResearchEvidenceDetails from './ResearchEvidenceDetails';
import { FrozenWgsReference } from './WgsReferencePanel';
import { referenceHref, referenceParams } from './referenceNavigation';

const GenusWorkspace = lazy(() => import('./GenusWorkspace'));
const EvidenceEffectChart = lazy(() => import('./EvidenceEffectChart'));
const PrimaryGenusDistribution = lazy(() => import('./PrimaryGenusDistribution'));
const number = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumSignificantDigits: 4 });

async function downloadRecord(record, subject, scope) {
  const payload = record.evaluationId ? await getGmrepoEvaluationPackage(record.evaluationId) : { schemaVersion: 1, subject, sourceScope: scope, evaluation: record };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `gmrepo-${record.genus.featureId.replace(':', '-')}-evaluation.json`; link.click();
  URL.revokeObjectURL(url);
}

export default function FeatureEvidencePage() {
  const { genusId } = useParams();
  const [params, setParams] = useSearchParams();
  const fixedId = params.get('evaluationId') || '';
  const fixed = useQuery({ queryKey: ['gmrepo', 'fixed-evaluation', fixedId], enabled: !!fixedId, retry: false,
    queryFn: ({ signal }) => getGmrepoEvaluationPackage(fixedId, { signal }) });
  const fixedRecord = fixed.data?.payload?.evaluation;
  const fixedSubject = fixed.data?.payload?.subject;
  const distributionRef = useRef(null);
  const primaryRef = useRef(null);
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [exportError, setExportError] = useState('');
  const catalog = useQuery({ queryKey: ['gmrepo', 'catalog'], queryFn: ({ signal }) => getGmrepoCatalog({ signal }), retry: false });
  const revision = fixedRecord?.provenance.fingerprint || params.get('revision') || catalog.data?.provenance.fingerprint || '';
  const type = fixedSubject?.subjectType || (fixedId ? 'genus' : params.get('subjectType') || 'genus');
  const id = fixedSubject?.subjectId || fixedRecord?.genus.featureId || params.get('subjectId') || genusId || params.get('analysisGenus') || '';
  const sourceRevision = fixedSubject?.sourceRevision || params.get('sourceRevision') || '';
  const request = { subjectType: type, subjectId: id, sourceRevision, revision,
    datasetSlug: fixedSubject?.datasetSlug || fixedRecord?.primary?.datasetSlug || params.get('datasetSlug') || 'ad-nc-species', runKey: params.get('runKey') || '', artifactKey: params.get('artifactKey') || '' };
  const resolved = useQuery({ queryKey: ['gmrepo', 'subject', request], enabled: !!id && !!revision && !fixedId, retry: false,
    queryFn: ({ signal }) => resolveGmrepoSubject(request, { signal }) });
  const genus = fixedRecord?.genus.featureId || (resolved.data?.status === 'mapped' ? resolved.data.genus.featureId : '');
  const mainRevision = type === 'species' && (fixedSubject?.status === 'mapped' || resolved.data?.status === 'mapped') ? sourceRevision : '';
  const datasetSlug = resolved.data?.datasetSlug || request.datasetSlug;
  const evaluationRequest = { revision, genus, sourceRevision, datasetSlug, subjectType: type, subjectId: id, runKey: request.runKey, artifactKey: request.artifactKey,
    sourceChart: params.get('sourceChart') || '', sourceScope: params.get('sourceScope') || '{}' };
  const evaluation = useQuery({ queryKey: ['gmrepo', 'evaluation', evaluationRequest], enabled: !!genus && !fixedId, retry: false,
    queryFn: ({ signal }) => getGmrepoEvaluation(evaluationRequest, { signal }) });
  const genera = useQuery({ queryKey: ['gmrepo', 'genera', revision], enabled: !!revision && (!fixedId || fixed.data?.currentStatus?.status === 'current'), retry: false,
    queryFn: ({ signal }) => getGmrepoGenera({ revision }, { signal }) });
  const scope = useMemo(() => { if (fixedId) return fixed.data?.payload?.sourceContext?.scope || {}; try { const value = JSON.parse(params.get('sourceScope') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : { note: '原范围参数不可解析' }; } catch { return { note: '原范围参数不可解析' }; } }, [params, fixedId, fixed.data]);
  useEffect(() => {
    if (revision && !fixedId && !params.has('revision')) setParams(current => { const next = new URLSearchParams(current); next.set('revision', revision); return next; }, { replace: true });
  }, [revision, fixedId, params, setParams]);
  useEffect(() => { document.title = `${resolved.data?.subjectName || '对象评估'} — 外部证据评估`; }, [resolved.data?.subjectName]);
  const choose = value => {
    setParams(current => {
      const next = new URLSearchParams(current);
      ['evaluationId', 'sourceRevision', 'datasetSlug', 'runKey', 'artifactKey', 'analysisPage', 'analysisGenus', 'sourceScope', 'sourceChart'].forEach(key => next.delete(key));
      next.set('subjectType', 'genus'); next.set('subjectId', value); return next;
    });
  };
  const update = (key, value) => {
    if (key === 'analysisGenus') { choose(value); return; }
    setParams(current => { const next = new URLSearchParams(current); if (value) next.set(key, String(value)); else next.delete(key);
      if (key === 'analysisCohort' || key === 'analysisQuery') next.delete('analysisPage'); return next; });
  };
  const workspaceParams = new URLSearchParams(params); if (genus) workspaceParams.set('analysisGenus', genus);
  const error = fixed.error || catalog.error || (!fixedId && resolved.error);
  const record = fixedId && fixedRecord ? { ...fixedRecord, evaluationId: fixedId, snapshotStatus: fixed.data.currentStatus } : evaluation.data;
  const subject = fixedId ? fixedSubject || (fixedRecord ? { subjectName: fixedRecord.genus.name, reasons: [], status: 'mapped', mappingLevel: 'reference_genus', mappingMethod: '按固定评估 ID 读回原记录，不重新生成当前对象结果。' } : null) : resolved.data;
  const referenceVersion = record?.provenance?.version || catalog.data?.provenance.version;
  const activeCohort = params.get('analysisCohort') || record?.cohorts.find(row => row.audit.unadjustedStatus === 'eligible')?.projectId || record?.cohorts[0]?.projectId;
  const inspectCohort = projectId => {
    update('analysisCohort', projectId);
    distributionRef.current?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  };
  return <div className="gmrepo-page evaluation-page">
    <EvidenceHeader detail returnTo={safeAnalysisReturn(params.get('returnTo'))} />
    <main className="gmrepo-main evaluation-main">
      <div className="evaluation-wayfinding"><Link to={referenceHref(referenceParams(params, id ? { subjectType: type, subjectId: id } : {}))}>GMrepo 参考资源</Link><span aria-hidden="true">/</span><span>{id ? '对象评估' : '菌属检索'}</span></div>
      {catalog.isPending || (fixedId && fixed.isPending) ? <LoadingState /> : error ? <ErrorState title="评估数据暂不可用" message={error.message} onRetry={() => { catalog.refetch(); if (fixedId) fixed.refetch(); else resolved.refetch(); }} /> : <>
        <section id="evaluation-subject" className="evaluation-subject community-scope-card">
          <div className="evaluation-subject-bar"><div><h1>{subject?.subjectName || (id ? '正在读取研究对象' : '参考菌属检索')}</h1>
            <p className="evaluation-object-id">{id ? `${type === 'mag' ? 'MAG' : type === 'species' ? '主物种' : '参考菌属'} · ${id}` : '按名称、旧名或 TaxID 查找，明确选择后再查看证据。'}</p></div>
            {genus && record ? <div className="evaluation-actions"><a className="analysis-button" href={gmrepoReportUrl({ revision, genus, subjectType: type, subjectId: id, sourceRevision, datasetSlug,
              evaluationId: record.evaluationId, runKey: request.runKey, artifactKey: request.artifactKey, sourceChart: params.get('sourceChart') || '', sourceScope: params.get('sourceScope') || '{}' })} download>导出评估报告</a>
              <details className="evaluation-export"><summary>其他导出</summary><button type="button" onClick={() => { setExportError(''); downloadRecord(record, subject, scope).catch(error => setExportError(error.message)); }}>完整证据 JSON</button>{record.evaluationId && record.snapshotStatus?.status === 'current' ? <a href={gmrepoReplayUrl(record.evaluationId)} download>主外离线复算包</a> : null}<small>完整检验族与可用主属级派生；不重跑 FASTQ，不等于科研批准。</small></details></div> : null}</div>
          {exportError ? <p role="alert">导出失败：{exportError}；未改用其他版本。</p> : null}
          {record?.snapshotStatus && record.snapshotStatus.status !== 'current' ? <div className="gmrepo-inference-pending" role="alert"><p>历史评估：当前依赖已变化。下方资格和效应仅保留为当时记录，不代表当前仍可使用。</p>{record.snapshotStatus.reasons.map(text => <p key={text}>{text}</p>)}</div> : null}
          {record?.evaluationId ? <details className="evaluation-object-details"><summary>固定评估与当前用途状态</summary><p className="reference-fingerprint">评估 ID：{record.evaluationId}</p><p>页面与两种导出使用同一固定评估。生成于 {record.generatedAt}。</p><p>{record.snapshotStatus?.status === 'current' ? '当前依赖可校验；用途仍为外部参考。' : '这是历史评估，当前用途需重新核查。'}</p><Link to={`/reference/gmrepo/evidence?evaluationId=${record.evaluationId}`}>按此 ID 读取归档评估</Link>{record.snapshotStatus?.reasons?.map(text => <p key={text}>{text}</p>)}</details> : null}
          {!!id && !fixedId && resolved.isPending ? <LoadingState message="正在核对固定版本的对象分类…" /> : null}
          {subject ? <>
            {genus ? <p className="evaluation-relationship">{type !== 'genus' ? <><span aria-hidden="true">↳</span> {subject.genus.name} <span className="evaluation-inline-note">{genus} · 所属属的外部背景</span><span className="evaluation-separator" aria-hidden="true">/</span></> : null}
              <span>GMrepo · {referenceVersion}</span></p> : null}
            {subject.reasons.length ? <div className={genus ? 'evaluation-limit' : 'gmrepo-inference-pending'}>{subject.reasons.map(text => <p key={text}>{text}</p>)}</div> : null}
            <details className="evaluation-object-details"><summary>对象与版本详情{Object.keys(scope).length ? ' · 原分析范围' : ''}</summary>
              <dl className="evaluation-facts"><div><dt>{type === 'genus' ? '参考对象版本' : '主对象版本'}</dt><dd>{type === 'genus' ? referenceVersion : subject.sourceRevision || '未提供'}</dd></div><div><dt>外部参考版本</dt><dd>{referenceVersion}</dd></div>
                <div><dt>对应层级</dt><dd>{subject.mappingLevel === 'genus_background' ? '所属属的外部背景' : subject.status === 'mapped' ? '参考菌属' : '对应待核查'}</dd></div>
                {subject.representativeMag ? <div><dt>代表 MAG</dt><dd>{subject.representativeMag}</dd></div> : null}</dl><p>{subject.mappingMethod}</p>
              {Object.keys(scope).length ? <><p>原可视化范围与选择（不改变外部检验分母）</p><pre className="evaluation-context">{JSON.stringify(scope, null, 2)}</pre><p className="gmrepo-note">来源图：{params.get('sourceChart') || '对象明细'}；不合并主外样本。</p></> : null}
            </details></> : null}
          {!id ? genera.data ? <ReferenceGenusBrowser items={genera.data.items} cohorts={catalog.data.cohorts || []} params={params} onChange={setParams} /> : <LoadingState message="正在读取可检索菌属…" /> : !genus && !resolved.isPending ? <p><Link to={referenceHref(params, { section: 'genera' })}>单独浏览参考菌属</Link> · <Link to={safeAnalysisReturn(params.get('returnTo'))}>返回原分析核对</Link></p> : null}
          {genera.error ? <ErrorState message={genera.error.message} onRetry={genera.refetch} /> : null}
        </section>
        {genus ? !fixedId && evaluation.isPending ? <LoadingState message="正在汇总各队列证据…" /> : !fixedId && evaluation.error ? <ErrorState message={evaluation.error.message} onRetry={evaluation.refetch} /> : record ? <>
          <nav className="evaluation-anchors" aria-label="证据页内导航"><a href="#evaluation-cohorts">队列结果</a><a href="#evaluation-distribution">分布与核查</a><a href="#evaluation-methods">依据与方法</a></nav>
          <Suspense fallback={<LoadingState />}><EvidenceEffectChart record={record} onSelect={d => { if (d?.projectId === 'primary') { setPrimaryOpen(true); primaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else if (d?.projectId) inspectCohort(d.projectId); }} /></Suspense>
          {record.primary?.genusComparison?.statistic ? <section ref={primaryRef} className="gmrepo-panel"><div className="gmrepo-panel-heading"><h2>主队列属级结果 · 与主分析同源</h2><p>由当前发布的 MetaPhlAn 4 种级矩阵按域与属求和；不是原论文差异表，也未更换主分析数据。</p></div>
            <p>AD / NC：{record.primary.genusComparison.statistic.adCount} / {record.primary.genusComparison.statistic.ncCount} · 秩效应 {number(record.primary.genusComparison.statistic.rankBiserial)} [{record.primary.genusComparison.rankBiserialCi?.map(number).join(', ')}] · q {number(record.primary.genusComparison.statistic.qValue)}</p>
            <p>{record.primary.genusComparison.provenance.identityBasis}</p><p className="gmrepo-note">主队列完整检验族 {record.primary.genusComparison.familySize} 属；主外效应方向与显著性分别判断，不把同属结果解释为所选物种或 MAG 的独立复现。</p>
            <Link to={`/reference/gmrepo/comparison?sourceRevision=${record.primary.genusComparison.provenance.sourceRevision}&datasetSlug=${datasetSlug}&candidateId=${record.primary.genusComparison.statistic.genus.featureId}`}>将该属加入多候选对照 →</Link>
            {record.primary.genusComparison.groups && <details open={primaryOpen} onToggle={e => setPrimaryOpen(e.currentTarget.open)}><summary>查看同一固定结果的全部主队列样本分布</summary>{primaryOpen && <Suspense fallback={<LoadingState />}><PrimaryGenusDistribution main={record.primary.genusComparison} evaluationId={record.evaluationId} /></Suspense>}</details>}
          </section> : <p className="gmrepo-inference-pending">主队列属级结果：{record.primary?.genusComparison?.note || '当前版本未形成可验证的同属统计量，未用分类覆盖替代。'}</p>}
          <section id="evaluation-cohorts" className="gmrepo-panel">
            <div className="gmrepo-panel-heading evaluation-section-heading"><h2>外部队列比较</h2><span>{record.genus.name} · 属级参考</span></div>
            <div id="evaluation-summary" className="evaluation-result-note" aria-label="当前证据概述">{record.summary.observations.slice(0, 2).map(item => <p key={item.id}>{item.text}</p>)}</div>
            <p className="evaluation-table-guide">选择队列查看下方分布。跨研究及主外参与者独立性尚未确立，不报告独立验证数量。</p>
            <p className="evaluation-scroll-hint">表格可横向滚动，查看效应、q 值与来源 →</p>
            <div className="gmrepo-table-scroll" tabIndex={0} role="region" aria-label="外部队列证据比较"><table className="evaluation-cohort-table"><thead><tr><th>研究队列</th><th className="evaluation-numeric">AD / NC<small>图表可用 Run</small></th><th>检验资格</th><th className="evaluation-numeric">未调整<small>秩二列相关 / q</small></th><th className="evaluation-numeric">年龄 / 性别调整<small>百分位秩点差 [95% CI] / q</small></th><th>来源与核查</th></tr></thead>
              <tbody>{record.cohorts.map(row => <tr key={row.projectId} aria-selected={activeCohort === row.projectId}><th scope="row"><button type="button" className="gmrepo-text-button" onClick={() => inspectCohort(row.projectId)} aria-label={`查看 ${row.projectId} 分布`}>{row.projectId}</button><small>{row.platform}{activeCohort === row.projectId ? ' · 当前分布' : ''}</small></th>
                <td className="evaluation-numeric">{row.audit.groupCounts.AD || 0} / {row.audit.groupCounts.NC || 0}</td>
                <td><span className={`evaluation-eligibility${row.statistic ? '' : ' is-descriptive'}`}>{row.statistic ? '队列内可检验' : '仅描述'}</span></td>
                <td className="evaluation-numeric">{row.statistic ? `${number(row.statistic.rankBiserial)} / ${number(row.statistic.qValue)}` : '—'}</td>
                <td className="evaluation-numeric">{row.statistic?.adjusted ? <>{number(row.statistic.adjusted.effect)} [{number(row.statistic.adjusted.ciLow)}, {number(row.statistic.adjusted.ciHigh)}]<small>q {number(row.statistic.adjusted.qValue)} · {row.audit.adjustedCount} 人</small></> : '—'}</td>
                <td className="evaluation-wrap"><Link to={referenceHref(params, { section: 'directory', study: row.projectId, readiness: null, studyQuery: null })}>研究依据与适用范围 →</Link>{!row.researchRecord ? <details><summary>核查记录</summary><p>{row.audit.reviewNote}</p><ul>{row.audit.unadjustedReasons.map(text => <li key={text}>{text}</li>)}</ul><p>跨研究/主外独立性待核查。</p></details> : null}</td></tr>)}</tbody></table></div>
            <p className="gmrepo-note">两种效应单位不同，正值均表示 AD 偏高；q 值在每个队列完整 {record.familySize} 属检验族内校正。来源 marker 与调整前后模型不重复计研究数。</p>
          </section>
          {record.cohorts.find(row => row.projectId === activeCohort)?.researchRecord ? <section className="gmrepo-panel" aria-label="当前队列核查"><div className="gmrepo-panel-heading"><h2>{activeCohort} · 研究依据与适用范围</h2><p>与上表及下方分布使用同一队列、同一参考版本。</p></div>{record.claims?.filter(item => item.projectId === activeCohort).map(item => <div className="reference-object-claim" key={item.claimId}><p>{item.text}</p><details><summary>解释依据</summary><p>{item.claimId} · 规则 {item.rulesVersion}</p><p>{item.evidenceRefs.join('；')}</p><pre className="evaluation-context">{JSON.stringify(item.values, null, 2)}</pre></details></div>)}<ResearchEvidenceDetails record={record.cohorts.find(row => row.projectId === activeCohort).researchRecord} /></section> : null}
          <section id="evaluation-distribution" ref={distributionRef}>{record.snapshotStatus && record.snapshotStatus.status !== 'current' ? <p className="gmrepo-inference-pending">本评估依赖已变化，未将当前重新查询的图表混入历史记录；请重新评估后查看当前分布。</p> : <Suspense fallback={<LoadingState />}><GenusWorkspace revision={revision} genera={genera.data?.items || [record.genus]} params={workspaceParams} update={update}
            hideAudit sourceRevision={record.primary?.datasetRevision || mainRevision} datasetSlug={record.primary?.datasetSlug || datasetSlug} /></Suspense>}</section>
          <FrozenWgsReference record={record.wgsReference} />
          <section id="evaluation-methods" className="gmrepo-panel evaluation-methods"><details><summary>摘要依据与评估方法</summary>
            <dl>{record.summary.observations.map((item, index) => <div key={item.id}><dt>{index < 2 ? `概述第 ${index + 1} 项` : item.text}</dt><dd>依据：{item.evidenceIds.join(' / ') || '当前无可评价队列'}</dd></div>)}</dl>
            <p>当前用途：外部属级参考；跨平台数值复现尚未建立，不作为所选物种或 MAG 的复现结论。方法 {record.methods.version} · 规则 {record.summary.rulesVersion}</p>
            <p>{record.methods.unadjusted}</p><p>{record.methods.adjusted}</p><p>{record.methods.fdr}</p>
          </details></section>
        </> : null : null}
      </>}
    </main>
  </div>;
}
