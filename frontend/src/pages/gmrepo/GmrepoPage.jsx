import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getGmrepoCatalog, getGmrepoGenera, getGmrepoOverview, getGmrepoSamples } from '../../api/gmrepo';
import StyledSelect from '../../components/ui/StyledSelect';
import SegmentedControl from '../../components/ui/SegmentedControl';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import PaginationControls from '../../components/data-display/PaginationControls';
import EvidenceHeader from './EvidenceHeader';
import ReferenceRegistry from './ReferenceRegistry';
import ReferenceGenusBrowser from './ReferenceGenusBrowser';
import ReferenceSubjectContext from './ReferenceSubjectContext';
import { referenceHref, referenceParams, subjectHref } from './referenceNavigation';
import { DECISION_CHART_HEIGHT } from './referenceChartOptions';
import './gmrepo.css';

const ReferenceChart = lazy(() => import('./ReferenceChart'));
const WgsReferencePanel = lazy(() => import('./WgsReferencePanel'));
const PAGE_SIZE = 25;
const number = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const percent = value => value == null ? '—' : `${number(value)}%`;
const abundance = value => value == null ? '—' : value === 0 ? '0'
  : value < 0.01 ? Number(value).toExponential(2) : Number(value).toLocaleString('zh-CN', { maximumSignificantDigits: 5 });
const groups = { AD: 'AD', NC: 'NC', MCI: 'MCI', at_risk: '风险组', unresolved: '待核查', other: '其他', cognitively_normal_amyloid_status_unresolved: '临床前研究' };
const sexLabels = { male: '男', female: '女', unknown: '未知' };

function Summary({ data }) {
  const counts = data.counts;
  return <div className="gmrepo-summary" aria-label="当前筛选摘要">
    {[['当前元数据', counts.selectedRuns, '测序 Run'], ['完整丰度', counts.completeProfiles, '来源 profile'],
      ['属级图表可用', counts.plotReadyRuns, `AD ${number(counts.adRuns)} / NC ${number(counts.ncRuns)}`],
      ['待核查分组', counts.pendingRuns, '有丰度，分组或身份待核对']].map(([label, value, detail]) =>
      <article key={label}><span>{label}</span><strong>{number(value)}</strong><small>{detail}</small></article>)}
  </div>;
}

function QualityCard({ title, subtitle, tools, children }) {
  return <section className="gmrepo-panel" aria-label={title}>
    <div className="gmrepo-panel-heading">
      <div className="gmrepo-quality-heading"><h2>{title}</h2>{tools}</div>
      <p>{subtitle}</p>
    </div>
    <div className="gmrepo-quality-content">{children}</div>
  </section>;
}

function QualityChart({ kind, data, title }) {
  return <Suspense fallback={<LoadingState />}><ReferenceChart kind={kind} data={data} title={title} /></Suspense>;
}

function QualityStatus({ data, view, onViewChange }) {
  const title = '纳入与核查状态';
  return <QualityCard title={title} subtitle={`六种状态互不重叠，合计 ${number(data.counts.selectedRuns)} 个 Run。`}
    tools={<SegmentedControl role="group" aria-label="纳入与核查状态显示方式">
      {[['chart', '图表'], ['table', '明细']].map(([value, label]) => <button key={value} type="button"
        aria-pressed={view === value} aria-controls="gmrepo-quality-status" onClick={() => onViewChange(value)}>{label}</button>)}
    </SegmentedControl>}>
    <div id="gmrepo-quality-status" className="gmrepo-quality-status" style={{ blockSize: DECISION_CHART_HEIGHT }}>
      {view === 'chart' ? <QualityChart kind="decisions" data={data} title={title} /> :
        <table aria-label="纳入与核查状态明细"><thead><tr><th scope="col">状态</th><th scope="col">Run 数</th></tr></thead>
          <tbody>{data.decisions.map(row => <tr key={row.key}><th scope="row">{row.label}</th><td>{number(row.count)}</td></tr>)}</tbody>
        </table>}
    </div>
    <p className="gmrepo-note">“阶段参考”包括 MCI、风险组和临床前研究。“属级信息不足”单列分组已核对的 AD/NC，其他阶段记录仍计入对应阶段。</p>
  </QualityCard>;
}

function MetadataAvailability({ data }) {
  return <QualityCard title="年龄与性别可用情况" subtitle={`以当前范围的 ${number(data.counts.completeProfiles)} 个完整 profile 为分母。`}>
    <ul className="gmrepo-quality-availability">{data.missingness.map(row => {
      const field = row.field === 'age' ? '年龄' : '性别';
      const knownPercent = row.denominator ? row.knownCount / row.denominator * 100 : null;
      return <li key={row.field}>
        <div className="gmrepo-quality-availability-label">
          <strong>{field}</strong>
          {row.denominator ? <><span>可标准化 <b>{percent(knownPercent)}</b></span><span>缺失或未标准化 <b>{percent(row.unavailablePercent)}</b></span></> :
            <span>暂无完整 profile，比例不可用</span>}
        </div>
        {row.denominator ? <div className="gmrepo-quality-meter" aria-hidden="true"><span style={{ width: `${knownPercent}%` }} /></div> : null}
        <p className="gmrepo-note">{row.label} {number(row.unavailableCount)} / {number(row.denominator)}
          {row.intervalCount ? `，其中 ${number(row.intervalCount)} 条为年龄区间` : ''}
          {row.unmappedCodeCount ? `，其中 ${number(row.unmappedCodeCount)} 条为未解码原码` : ''}。</p>
      </li>;
    })}</ul>
  </QualityCard>;
}

function CohortTable({ data, onChoose }) {
  return <section className="gmrepo-panel" aria-labelledby="gmrepo-cohort-table">
    <div className="gmrepo-panel-heading"><h2 id="gmrepo-cohort-table">队列覆盖与来源</h2><p>数量按当前筛选范围统计；AD/NC 列仅统计属级图表可用记录。</p></div>
    <div className="gmrepo-table-scroll" tabIndex={0} role="region" aria-label="队列覆盖表格">
      <table><thead><tr><th>队列</th><th>元数据</th><th>完整丰度</th><th>可用 AD</th><th>可用 NC</th><th>阶段参考</th><th>待核查</th><th>没有丰度</th><th>待解析中位数</th><th>原研究</th></tr></thead>
        <tbody>{data.cohorts.map(c => <tr key={c.projectId}>
          <th scope="row"><button type="button" className="gmrepo-text-button" onClick={() => onChoose(c.projectId)}>{c.projectId}</button></th>
          {[c.metadataRuns, c.completeProfiles, c.adRuns, c.ncRuns, c.stageReferenceRuns, c.pendingRuns, c.noProfileRuns].map((v, i) => <td key={i}>{number(v)}</td>)}
          <td>{percent(c.unresolvedMedianPercent)}</td><td>{c.originalStudyUrl ? <a href={c.originalStudyUrl} target="_blank" rel="noreferrer">论文 ↗</a> : '待关联'}</td>
        </tr>)}</tbody></table>
      {!data.cohorts.length ? <p className="gmrepo-empty">当前筛选没有对应队列。</p> : null}
    </div>
  </section>;
}

function SampleTable({ result, pending, error, onRetry, page, onPageChange }) {
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (pending) return <LoadingState />;
  if (!result) return null;
  return <>
    <p className="gmrepo-table-meta" aria-live="polite">共 {number(result.total)} 条记录 · 第 {page} / {Math.max(1, Math.ceil(result.total / PAGE_SIZE))} 页
      {result.genus ? ` · ${result.genus.name}（${result.genus.featureId}）` : ''}</p>
    {result.genus ? <p className="gmrepo-note">0 仅表示完整稀疏 profile 未列出该属；缺少 profile 或无有效属级信息时显示“—”。</p> : null}
    <div className="gmrepo-table-scroll" tabIndex={0} role="region" aria-label="参考样本表格"><table>
      <thead><tr><th>Run / 队列</th><th>研究分组</th><th>来源标签</th><th>纳入状态</th><th>年龄</th><th>性别</th><th>待解析比例</th>{result.genus ? <th>菌属丰度（%）</th> : null}<th>核查依据</th></tr></thead>
      <tbody>{result.items.map(row => <tr key={`${row.projectId}:${row.runId}`}>
        <th scope="row"><a href={`https://www.ebi.ac.uk/ena/browser/view/${encodeURIComponent(row.runId)}`} target="_blank" rel="noreferrer">{row.runId} ↗</a><small>{row.projectId}</small></th>
        <td>{groups[row.researchGroup] || row.researchGroup}</td><td>{row.sourceGroup || '—'}</td>
        <td><span className={`gmrepo-status gmrepo-status--${row.decisionKey}`}>{row.decisionLabel}</span></td>
        <td>{row.ageYears != null ? number(row.ageYears) : row.ageRaw || '—'}</td>
        <td>{sexLabels[row.sex] || '未知'}{row.sourceSexCode ? <small>原码 {row.sourceSexCode}，未解码</small> : null}</td>
        <td>{percent(row.unresolvedPercent)}</td>{result.genus ? <td>{abundance(row.genusAbundancePercent)}</td> : null}
        <td><details className="gmrepo-row-evidence"><summary>查看依据</summary><p>{row.reason}</p><p>{row.identityNote}</p>
          <p>来源样本编号：{row.specimenId || '未提供'}</p><p>BioSample：{row.biosampleAccession || '未提供'}</p>
          {row.originalStudyUrl ? <a href={row.originalStudyUrl} target="_blank" rel="noreferrer">原研究论文 ↗</a> : null}
          {row.evidenceFiles.length ? <ul>{row.evidenceFiles.map(file => <li key={file}>{file}</li>)}</ul> : null}
        </details></td>
      </tr>)}</tbody>
    </table>{!result.items.length ? <p className="gmrepo-empty">当前筛选没有样本记录，请调整队列、分组或记录范围。</p> : null}</div>
    <PaginationControls page={page} pageCount={Math.max(1, Math.ceil(result.total / PAGE_SIZE))} onPageChange={onPageChange} ariaLabel="参考样本分页" />
  </>;
}

export default function GmrepoPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = '外部证据评估 · 参考资源 — 微脑智库';
    return () => { document.title = previous; };
  }, []);
  const [params, setParams] = useSearchParams();
  const [statusView, setStatusView] = useState('chart');
  const cohort = params.get('cohort') || '';
  const group = params.get('group') || '';
  const scope = params.get('scope') || 'all';
  const genus = params.get('genus') || '';
  const view = params.get('view') === 'genus' ? 'genus' : 'overview';
  const resourceView = ['directory', 'genera', 'quality', 'methods', 'wgs'].includes(params.get('section')) ? params.get('section')
    : ['cohort', 'group', 'scope', 'genus', 'page'].some(key => params.has(key)) ? 'quality' : 'directory';
  const requestedPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const selection = useMemo(() => ({ cohort, group, scope }), [cohort, group, scope]);
  const catalog = useQuery({ queryKey: ['gmrepo', 'catalog'], queryFn: ({ signal }) => getGmrepoCatalog({ signal }), retry: false });
  const revision = params.get('revision') || catalog.data?.provenance.fingerprint || '';
  useEffect(() => {
    if (revision && !params.has('revision')) setParams(current => referenceParams(current, { revision }), { replace: true });
  }, [revision, params, setParams]);
  const overview = useQuery({ queryKey: ['gmrepo', 'overview', revision, selection], enabled: !!revision && view === 'overview' && resourceView === 'quality', retry: false,
    queryFn: ({ signal }) => getGmrepoOverview({ ...selection, revision }, { signal }) });
  const genera = useQuery({ queryKey: ['gmrepo', 'genera', revision], enabled: !!revision, retry: false,
    queryFn: ({ signal }) => getGmrepoGenera({ revision }, { signal }) });
  const samples = useQuery({ queryKey: ['gmrepo', 'samples', revision, selection, genus, page], enabled: !!revision && view === 'overview' && resourceView === 'quality', retry: false,
    queryFn: ({ signal }) => getGmrepoSamples({ ...selection, revision, genus, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, { signal }) });
  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, String(value)); else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'analysisCohort' || key === 'analysisQuery') next.delete('analysisPage');
    setParams(next);
  };
  const retry = () => { catalog.refetch(); overview.refetch(); genera.refetch(); samples.refetch(); };
  const data = overview.data;
  const version = catalog.data?.provenance.version;
  if (view === 'genus') {
    const next = new URLSearchParams(params); next.delete('view');
    if (revision && !next.has('revision')) next.set('revision', revision);
    return <Navigate replace to={`/reference/gmrepo/evidence?${next}`} />;
  }
  return <div className="gmrepo-page reference-workspace">
    <a className="gmrepo-skip" href="#gmrepo-content">跳转到参考资源</a>
    <EvidenceHeader />
    <main id="gmrepo-content" className="gmrepo-main">
      <div className="gmrepo-title reference-workspace-title"><div><h1>GMrepo 参考资源</h1><p>查找研究队列，核查数据条件，继续评估候选特征的外部证据。</p></div>
        {version ? <span className="gmrepo-version">快照 {version}</span> : null}</div>
      <ReferenceSubjectContext params={params} revision={revision} />
      <nav className="evaluation-resource-tabs" aria-label="参考资源视图">{[['directory', '研究目录'], ['genera', '菌属检索'], ['wgs', 'WGS 扩展'], ['quality', '数据质量'], ['methods', '来源与方法']].map(([key, label]) => {
        return <Link key={key} to={referenceHref(params, { section: key })} aria-current={resourceView === key ? 'page' : undefined}>{label}</Link>;
      })}</nav>
      <p className="evaluation-source-note reference-boundary-line"><span>{resourceView === 'wgs' ? '原研究 WGS · 临床前阶段参考' : 'GMrepo · AD 相关研究 · 16S 属级参考'}</span><span>Run 是测序记录，不等于独立参与者；分类背景不构成数值复现或临床结论。</span></p>
      {catalog.isPending ? <LoadingState /> : catalog.error ? <ErrorState title="参考数据暂不可用" message={catalog.error.message} onRetry={retry} /> : <>
        {resourceView === 'wgs' ? <Suspense fallback={<LoadingState />}><WgsReferencePanel /></Suspense> : resourceView === 'genera' ? genera.isPending ? <LoadingState message="正在读取参考菌属目录…" /> : genera.error ? <ErrorState message={genera.error.message} onRetry={genera.refetch} /> : <ReferenceGenusBrowser items={genera.data.items} cohorts={catalog.data.cohorts} params={params} onChange={setParams} />
          : resourceView !== 'quality' ? <ReferenceRegistry revision={revision} view={resourceView} /> : <>
        {cohort ? <div className="reference-quality-scope"><span>当前核查队列 <strong>{cohort}</strong></span><Link to={referenceHref(params, { section: 'directory', study: cohort })}>返回队列详情 →</Link><Link to={referenceHref(params, { section: 'genera', cohort })}>查看该队列的菌属分布 →</Link></div> : null}
        <section className="gmrepo-filters" aria-label="参考数据筛选">
          <label htmlFor="reference-cohort">研究队列<StyledSelect id="reference-cohort" value={cohort} onChange={e => update('cohort', e.target.value)}><option value="">全部队列（{catalog.data.cohorts.length}）</option>{catalog.data.cohorts.map(c => <option value={c.projectId} key={c.projectId}>{c.projectId}</option>)}</StyledSelect></label>
          <label htmlFor="reference-group">研究分组<StyledSelect id="reference-group" value={group} onChange={e => update('group', e.target.value)}><option value="">全部研究分组</option>{catalog.data.groups.map(g => <option value={g.value} key={g.value}>{g.label}</option>)}</StyledSelect></label>
          <label htmlFor="reference-scope">记录范围<StyledSelect id="reference-scope" value={scope} onChange={e => update('scope', e.target.value)}>{catalog.data.scopes.map(s => <option value={s.value} key={s.value}>{s.label}</option>)}</StyledSelect></label>
          <button type="button" className="analysis-button" onClick={() => setParams(referenceParams(params, { section: 'quality', cohort: null, group: null, scope: null, genus: null, page: null }))}>重置筛选</button>
        </section>
        {overview.error ? <ErrorState message={overview.error.message} onRetry={retry} /> : overview.isPending ? <LoadingState /> : data ? <>
          <Summary data={data} />
          <div className="gmrepo-scope-caption" aria-live="polite">当前范围 {number(data.counts.selectedRuns)} Run / 版本总计 {number(data.provenance.metadataTotal)} Run · {data.cohorts.length} 个队列 · {number(data.provenance.genusTotal)} 个目标属</div>
          <div className="gmrepo-charts">
            <QualityCard title="各队列 AD/NC 可用记录" subtitle="统计当前范围内属级图表可用的测序 Run。">
              <QualityChart kind="cohorts" data={data} title="各队列 AD/NC 可用记录" />
            </QualityCard>
            <QualityStatus data={data} view={statusView} onViewChange={setStatusView} />
            <MetadataAvailability data={data} />
            <QualityCard title="各队列分类待解析比例" subtitle="统计完整 profile 中待解析丰度比例的中位数，横轴固定 0–100%。">
              <QualityChart kind="resolution" data={data} title="各队列分类待解析比例" />
              <p className="gmrepo-note">当前范围 {number(data.counts.noResolvedGenusRuns)} 个 profile 没有可确认目标属。待解析比例包含 Unknown、层级不符和目标类群不符，不能解释为菌不存在。</p>
            </QualityCard>
          </div>
          <details className="evaluation-sample-disclosure"><summary>各队列覆盖明细</summary><CohortTable data={data} onChoose={value => update('cohort', value)} /></details>
        </> : null}
        <section className="gmrepo-panel gmrepo-samples" aria-labelledby="gmrepo-samples-title">
          <div className="gmrepo-panel-heading"><h2 id="gmrepo-samples-title">参考样本与核查依据</h2><p>保留来源标签和核对后的研究分组，可逐条查看纳入原因、身份关系及原研究。</p></div>
          <div className="gmrepo-genus-filter"><label htmlFor="reference-genus">菌属丰度列<StyledSelect id="reference-genus" value={genus} onChange={e => update('genus', e.target.value)} disabled={!genera.data}><option value="">不显示菌属丰度</option>{(genera.data?.items || []).map(g => <option key={g.featureId} value={g.featureId}>{g.name} · {g.featureId}</option>)}</StyledSelect></label>
            <p>选择菌属只增加丰度列，保留零值记录和当前样本范围。{genus ? <Link to={subjectHref(params, { genus, cohort })}>评估该菌属的外部证据 →</Link> : null}</p></div>
          {genera.error ? <ErrorState title="菌属目录读取失败" message={genera.error.message} onRetry={retry} /> : null}
          <SampleTable result={samples.data} pending={samples.isPending} error={samples.error} onRetry={retry} page={page} onPageChange={value => update('page', value)} />
        </section></>}
        {resourceView === 'methods' ? <details className="gmrepo-panel gmrepo-evidence"><summary>数据版本与来源</summary>
          <dl><div><dt>处理版本</dt><dd>{version}</dd></div><div><dt>输入快照</dt><dd>{catalog.data.provenance.inputSnapshot}</dd></div>
            <div><dt>处理时间</dt><dd>{catalog.data.provenance.processedAt}</dd></div><div><dt>版本校验编号</dt><dd className="gmrepo-fingerprint">{revision}</dd></div></dl>
          <ul>{catalog.data.provenance.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a></li>)}</ul>
          <p>来源标签不自动等于确诊结论。队列分组按样本记录、原研究和作者公开资料核对；分组、协变量或独立受试者关系不足的记录保留相应标记。</p>
        </details> : null}
      </>}
    </main>
  </div>;
}
