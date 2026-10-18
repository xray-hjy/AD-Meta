import { Link } from 'react-router-dom';
import PaginationControls from '../../components/data-display/PaginationControls';
import StyledSelect from '../../components/ui/StyledSelect';
import { referenceHref, referenceParams, subjectHref } from './referenceNavigation';

const PAGE_SIZE = 24;

export default function ReferenceGenusBrowser({ items, cohorts = [], params, onChange }) {
  const query = params.get('taxaQuery') || '';
  const cohort = params.get('cohort') || params.get('analysisCohort') || '';
  const selected = cohorts.find(row => row.projectId === cohort);
  const comparable = !cohort || selected?.plotReadyRuns > 0;
  const filtered = items.filter(row => `${row.name} ${row.featureId} ${(row.sourceNames || []).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requested = Number(params.get('taxaPage') || 1);
  const page = Math.min(pageCount, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const change = changes => onChange(referenceParams(params, changes));
  return <section className="gmrepo-panel reference-genus-browser" aria-labelledby="reference-genus-title">
    <div className="gmrepo-panel-heading evaluation-section-heading"><div><h2 id="reference-genus-title">参考菌属目录</h2><p>先选择菌属，再查看跨队列证据或指定队列的分布。</p></div><span>{items.length} 个参考属</span></div>
    <div className="reference-genus-controls"><label>检索菌属、旧名或 TaxID<input type="search" value={query} onChange={event => change({ taxaQuery: event.target.value, taxaPage: null })} placeholder="例如 Bacteroides 或 816" /></label>
      <label>分布队列<StyledSelect value={cohort} onChange={event => change({ cohort: event.target.value, analysisCohort: null })}><option value="">跨队列证据（不指定队列）</option>{cohorts.map(row => <option key={row.projectId} value={row.projectId}>{row.projectId}{row.plotReadyRuns ? '' : ' · 当前无 AD/NC 分布'}</option>)}</StyledSelect></label></div>
    <p className="gmrepo-note">这里是固定版本的菌属目录，不代表在所选队列中均有检出；零值与缺失会在分布页分别核查。不默认替你选择菌属。</p>
    {params.has('subjectId') && params.get('subjectType') !== 'genus' ? <p className="gmrepo-note">点击下方菌属会明确切换为参考菌属浏览；如需保留主分析对象，请使用上方“继续对象评估”。</p> : null}
    {!comparable ? <p className="gmrepo-inference-pending">该队列当前没有可用 AD/NC 分布。可先<Link to={referenceHref(params, { section: 'quality', cohort })}>核查队列数据</Link>，或将分布队列改为跨队列证据。</p> : null}
    <div className="reference-genus-list" aria-label="参考菌属结果">{filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(row => <article key={row.featureId}>
      <div><h3>{row.name}</h3><p>{row.featureId} · {row.domain === 'Archaea' ? '古菌' : row.domain === 'Bacteria' ? '细菌' : row.domain}</p></div>
      {comparable ? <Link to={subjectHref(params, { genus: row.featureId, cohort })} aria-label={`评估 ${row.name}`}>查看证据 <span aria-hidden="true">→</span></Link> : <span className="gmrepo-note">所选队列暂无分布</span>}
    </article>)}</div>
    {!filtered.length ? <p className="gmrepo-empty">没有匹配的菌属，请尝试名称、旧名或 TaxID。</p> : null}
    <div className="reference-list-footer"><span>匹配 {filtered.length} / {items.length} 个属 · 仅筛选目录，不改变检验族</span><PaginationControls page={page} pageCount={pageCount} onPageChange={value => change({ taxaPage: value })} ariaLabel="参考菌属分页" /></div>
  </section>;
}
