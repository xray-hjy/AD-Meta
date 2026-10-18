import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getGmrepoComparisonCatalog, createGmrepoComparison, getGmrepoEvaluationPackage, gmrepoCandidateReportUrl, gmrepoReplayUrl } from '../../api/gmrepo';
import EvidenceHeader from './EvidenceHeader';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';
import PaginationControls from '../../components/data-display/PaginationControls';

const EvidenceEffectChart = lazy(() => import('./EvidenceEffectChart'));
const PAGE = 20;
const fmt = n => n == null ? '—' : Number(n).toLocaleString('zh-CN', { maximumSignificantDigits: 4 });
const labels = { mapped: '主外唯一对应', unmapped: '仅主队列', ambiguous: '对应歧义', reference_only: '仅外部参考' };

export default function CandidateComparisonPage() {
  const [params, setParams] = useSearchParams(), navigate = useNavigate();
  const fixedId = params.get('evaluationId') || '';
  const query = params.get('query') || '', page = Math.max(1, Number(params.get('page')) || 1);
  const [selected, setSelected] = useState(() => params.getAll('candidateId'));
  const [freezing, setFreezing] = useState(false), [failure, setFailure] = useState('');
  const fixed = useQuery({ queryKey: ['gmrepo', 'candidate-fixed', fixedId], enabled: !!fixedId, retry: false,
    queryFn: ({ signal }) => getGmrepoEvaluationPackage(fixedId, { signal }) });
  const request = { revision: params.get('revision') || '', sourceRevision: params.get('sourceRevision') || '', datasetSlug: params.get('datasetSlug') || 'ad-nc-species', speciesIds: params.get('speciesIds') || '', query, offset: (page - 1) * PAGE, limit: PAGE };
  const live = useQuery({ queryKey: ['gmrepo', 'candidate-catalog', request], enabled: !fixedId, retry: false,
    queryFn: ({ signal }) => getGmrepoComparisonCatalog(request, { signal }) });
  useEffect(() => { document.title = '多候选对照 — 外部证据评估'; }, []);
  const archived = fixed.data?.payload?.evaluation;
  const wrongKind = fixedId && archived && archived.kind !== 'candidate_comparison';
  const data = fixedId ? archived : live.data;
  const allFrozen = archived?.items?.filter(r => `${r.name} ${r.candidateId}`.toLowerCase().includes(query.toLowerCase())) || [];
  const rows = fixedId ? allFrozen.slice((page - 1) * PAGE, page * PAGE) : live.data?.items || [];
  const total = fixedId ? allFrozen.length : live.data?.total || 0;
  const error = fixed.error || live.error;
  const change = (key, value) => setParams(current => { const next = new URLSearchParams(current); if (value) next.set(key, String(value)); else next.delete(key); if (key !== 'page') next.delete('page'); return next; }, { replace: true });
  const toggle = id => setSelected(current => current.includes(id) ? current.filter(v => v !== id) : [...current, id]);
  const freeze = async () => {
    setFreezing(true); setFailure('');
    try {
      const result = await createGmrepoComparison({ revision: data.provenance.fingerprint }, { candidateIds: selected, sourceRevision: data.primaryDerivative.provenance.sourceRevision, datasetSlug: data.primaryDerivative.provenance.datasetSlug });
      navigate(`/reference/gmrepo/comparison?evaluationId=${result.evaluationId}`);
    } catch (e) { setFailure(e.message); } finally { setFreezing(false); }
  };
  const inspect = datum => {
    const candidate = rows.find(r => r.candidateId === datum?.entityId);
    if (!candidate?.referenceGenus) return;
    const next = new URLSearchParams({ subjectType: 'genus', subjectId: candidate.referenceGenus.featureId, revision: data.provenance.fingerprint,
      sourceRevision: data.primaryDerivative.provenance.sourceRevision, datasetSlug: data.primaryDerivative.provenance.datasetSlug, returnTo: `/reference/gmrepo/comparison?${params}` });
    navigate(`/reference/gmrepo/evidence?${next}`);
  };
  return <div className="gmrepo-page evaluation-page"><EvidenceHeader /><main className="gmrepo-main evaluation-main">
    <div className="evaluation-wayfinding"><Link to="/reference/gmrepo">GMrepo 参考资源</Link><span>/</span><span>多候选对照</span></div>
    <section className="gmrepo-panel"><div className="gmrepo-panel-heading"><h1>主队列与外部证据 · 多候选对照</h1><p>分类对应 → 队列内效应 → 主外并列核对。保留未对应、歧义及不能检验的结果。</p></div>
      {data && !wrongKind && <><p>主队列完整检验族 {data.primaryFamilySize} 属 · 各外部队列 {data.externalFamilySize} 属 · {fixedId ? `固定选择 ${archived.selection.length} 项` : `完整目录 ${data.catalogTotal} 项`}</p>
        <p className="gmrepo-note">{data.note}</p>
        {request.speciesIds && !fixedId && <p>当前目录限定为主分析所选物种对应的属；多物种属于同一属时只形成一个候选。{data.unresolvedSpeciesIds?.length ? `未能对应 ${data.unresolvedSpeciesIds.length} 个物种：${data.unresolvedSpeciesIds.join(', ')}` : '所选物种均在当前发布矩阵内找到属级归属。'}</p>}
        {fixedId ? <><p className="reference-fingerprint">评估 ID：{fixedId}</p><div className="evaluation-actions">
          <a className="analysis-button" href={gmrepoCandidateReportUrl(fixedId)} download>导出对照报告</a>
          <a className="analysis-button" href={`/api/references/gmrepo/evaluation-package?evaluationId=${fixedId}`} download>完整证据 JSON</a>
          {fixed.data.currentStatus?.status === 'current' && <a className="analysis-button" href={gmrepoReplayUrl(fixedId)} download>主外离线复算包</a>}
          <Link className="analysis-button" to="/reference/gmrepo/comparison">建立新选择</Link></div>
          {fixed.data.currentStatus?.status !== 'current' && <div className="gmrepo-inference-pending" role="alert">历史评估：原结果保留，当前用途已变化。{fixed.data.currentStatus?.reasons.map(t => <p key={t}>{t}</p>)}</div>}
        </> : <div className="evaluation-actions"><span aria-live="polite">已选 {selected.length} 项；翻页和搜索不清除选择</span>
          <button type="button" className="analysis-button" onClick={() => setSelected(current => [...new Set([...current, ...rows.map(r => r.candidateId)])])}>选择本页</button>
          <button type="button" className="analysis-button" onClick={() => setSelected([])}>清空选择</button>
          <button type="button" className="analysis-button" disabled={!selected.length || freezing} onClick={freeze}>{freezing ? '正在固定完整依据…' : '固定已选候选并导出'}</button></div>}
        <label className="gmrepo-search">检索候选<input value={query} placeholder="属名或分类 ID（不改变 FDR 检验族）" onChange={e => change('query', e.target.value)} /></label>
      </>}
      {failure && <p role="alert">{failure}；未改用其他候选或版本。</p>}
    </section>
    {error || wrongKind ? <ErrorState message={wrongKind ? '该 ID 是对象评估，不是多候选对照；未混用记录。' : error.message} /> : !data ? <LoadingState message="正在读取完整主外检验族…" /> : <>
      <Suspense fallback={<LoadingState />}><EvidenceEffectChart record={{ ...data, evaluationId: fixedId }} candidates={rows} onSelect={inspect} /></Suspense>
      <section className="gmrepo-panel"><div className="gmrepo-panel-heading"><h2>{fixedId ? '固定候选结果' : '完整候选目录'}</h2><p>图表与下表同步显示当前页；报告与复算包保留全部固定选择。点击唯一对应的图格可继续查看单属区间和样本分布。</p></div>
        <div className="gmrepo-table-scroll" tabIndex={0}><table><thead><tr>{!fixedId && <th>选择</th>}<th>候选 / 分类对应</th><th>主队列秩效应 / q</th>{data.cohorts.map(c => <th key={c.projectId}>{c.projectId}<small>秩效应 / q</small></th>)}<th>解释</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.candidateId}>{!fixedId && <td><input type="checkbox" aria-label={`选择 ${r.name}`} checked={selected.includes(r.candidateId)} onChange={() => toggle(r.candidateId)} /></td>}
            <th scope="row">{r.referenceGenus ? <button type="button" className="gmrepo-text-button" onClick={() => inspect({ entityId: r.candidateId })}>{r.name}</button> : r.name}<small>{labels[r.mappingStatus]} · {r.candidateId}</small></th>
            <td>{r.primaryStatistic ? `${fmt(r.primaryStatistic.rankBiserial)} / ${fmt(r.primaryStatistic.qValue)}` : '—'}</td>
            {data.cohorts.map(c => { const s = r.cohorts.find(v => v.projectId === c.projectId)?.statistic; return <td key={c.projectId}>{s ? `${fmt(s.rankBiserial)} / ${fmt(s.qValue)}` : '—'}</td>; })}<td>{r.interpretation}</td>
          </tr>)}</tbody></table>{!rows.length && <p className="gmrepo-empty">当前检索没有结果；未改用默认候选。</p>}</div>
        <PaginationControls page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} onPageChange={p => change('page', p)} /><p className="gmrepo-note">当前检索 {total} 项。空白表示没有统计量，不是丰度为零或效应为零。</p>
      </section>
      <section className="gmrepo-panel"><details><summary>数据口径与适用范围</summary><p>{data.primaryDerivative.provenance.normalization}</p><p>{data.primaryDerivative.provenance.identityBasis}</p><p>主队列百分比丰度按已发布种级矩阵聚合；外部各研究保留来源处理与分组，不合并为联合队列。候选筛选不重新计算 q 值。不把未知属改名为已知属，也不以同向数量替代证据强度。</p><p className="reference-fingerprint">主属级指纹：{data.primaryDerivative.fingerprint}</p></details></section>
    </>}
  </main></div>;
}
