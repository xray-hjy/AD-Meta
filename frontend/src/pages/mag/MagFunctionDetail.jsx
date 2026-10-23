import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagFunctions, magFunctionDownloadUrl } from '../../api/mag';
import StyledSelect from '../../components/ui/StyledSelect';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import DataTableViewport from '../../components/data-display/DataTableViewport';
import PaginationControls from '../../components/data-display/PaginationControls';
import MagGeneEvidence from './MagGeneEvidence';
import MagFunctionalChart from './MagFunctionalChart';
import { coverageOption, coverageSensitivityOption } from './magFunctionOptions';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';
import './mag-functional.css';

export default function MagFunctionDetail({ revision, magId, initialNamespace = 'kofam_ko', initialFeatureId = '' }) {
  const [namespace, setNamespace] = useState(initialNamespace), [feature, setFeature] = useState(initialFeatureId);
  const [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const params = { revision, magId, namespace, query, limit: 25, offset: (page - 1) * 25 };
  const result = useQuery({ queryKey: ['mag', 'single-functional', params], queryFn: ({ signal }) => getMagFunctions('features', params, { signal }) });
  const names = { kofam_ko: 'KO', kofam_ec: 'EC', dbcan_family: 'CAZyme 家族', dbcan_subfamily: 'CAZyme 亚家族', dbcan_substrate: '底物预测', merops_family: 'MEROPS 家族', merops_id: 'MEROPS 命中', dram_db: 'DRAM HMM' };
  return <section><h3>代表 MAG 功能注释</h3>
    {feature ? <><button className="analysis-button" type="button" onClick={() => setFeature('')}>← 返回此 MAG 的功能列表</button><MagGeneEvidence key={`${namespace}:${feature}`} revision={revision} magId={magId} namespace={namespace} featureId={feature} /></>
      : <><div className="analysis-filter-form"><label>功能库<StyledSelect value={namespace} onChange={e => { setNamespace(e.target.value); setPage(1); }}>{Object.entries(names).map(([k, v]) => <option value={k} key={k}>{v}</option>)}</StyledSelect></label>
        <label>功能检索<input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><a className="analysis-button" href={magFunctionDownloadUrl('features', { revision, magId, namespace, query })}>功能 CSV</a></div>
        {result.error ? <ErrorState message={result.error.message} onRetry={result.refetch} /> : result.isPending ? <LoadingState /> : <>
          <p className="mag-muted">此 MAG 携带 {result.data.total} 种匹配功能；计数为本次注释命中基因数。</p>
          <DataTableViewport ariaLabel="单 MAG 功能列表" pagination={<PaginationControls page={page} pageCount={Math.ceil(result.data.total / 25)} onPageChange={setPage} ariaLabel="单 MAG 功能分页" />}>
            <thead><tr><th>功能</th><th>来源描述</th><th>基因计数</th></tr></thead><tbody>{result.data.items.map(r => <tr key={r.featureId}><td><button className="mag-functional-link" type="button" onClick={() => setFeature(r.featureId)}>{r.featureId}</button></td><td>{r.description || '未提供描述'}</td><td>{r.geneCount}</td></tr>)}</tbody>
          </DataTableViewport></>}
        <details className="mag-heatmap-methods"><summary>查看全部基因记录</summary><MagGeneEvidence revision={revision} magId={magId} /></details>
      </>}
  </section>;
}

export function MagCoverageEvidence({ revision, magId, scope }) {
  const [metric, setMetric] = useState('coveredFraction'), [threshold, setThreshold] = useState(0), [sample, setSample] = useState(null);
  const params = { revision, magId, ...scope };
  const query = useQuery({ queryKey: ['mag', 'functional-coverage', params], queryFn: ({ signal }) => getMagFunctions('coverage', params, { signal }) });
  const build = (data, style) => coverageOption(data, style, metric);
  return <section><h3>丰度与覆盖证据</h3><label className="mag-inline-field">纵轴<StyledSelect value={metric} onChange={e => setMetric(e.target.value)}><option value="coveredFraction">覆盖广度</option><option value="meanCoverage">平均深度</option></StyledSelect></label>
    {query.error ? <ErrorState message={query.error.message} onRetry={query.refetch} /> : query.isPending ? <LoadingState /> : <>
      <CollapsibleResultSection title="丰度与覆盖分布" storageKey="admeta:mag:coverage-scatter:fold"><MagFunctionalChart kind="coverage" data={query.data} buildOption={build} height={420} onSelect={setSample} /></CollapsibleResultSection>
      <label className="mag-functional-threshold">覆盖广度参考阈值 {threshold}%<input type="range" min="0" max="100" value={threshold} onChange={e => setThreshold(Number(e.target.value))} /></label>
      <p className="mag-muted">{query.data.items.filter(r => r.coveredFraction * 100 >= threshold).length} / {query.data.items.length} 个当前样本覆盖广度 ≥{threshold}%。这是探索性参考，不修改丰度或定义生物学检出。</p>
      <CollapsibleResultSection title="覆盖阈值敏感性" summary="各组满足参考阈值的样本数" storageKey="admeta:mag:coverage-sensitivity:fold"><MagFunctionalChart kind="coverage-sensitivity" data={query.data} buildOption={coverageSensitivityOption} height={320} /></CollapsibleResultSection>
      {sample && <dl className="mag-detail-facts">{[['样本', sample.sampleId], ['分组', sample.disease], ['MAG 丰度 %', sample.abundancePercent], ['覆盖广度 %', sample.coveredFraction * 100], ['平均深度 ×', sample.meanCoverage], ['Reads 数', sample.readCount]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    </>}
  </section>;
}
