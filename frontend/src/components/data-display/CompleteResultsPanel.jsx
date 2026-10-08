import StyledSelect from '../ui/StyledSelect';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCompleteResults, completeResultsDownloadUrl } from '../../api/completeResults';
import DataTableViewport, { QUERY_TABLE_PAGE_SIZE } from './DataTableViewport';
import PaginationControls from './PaginationControls';
import LoadingState from '../ui/LoadingState';
import ErrorState from '../ui/ErrorState';
import ResultDisclosure from './ResultDisclosure';

export default function CompleteResultsPanel({ runKey, artifactKey }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sortBy, setSortBy] = useState('sampleCode');
  const [sortDirection, setSortDirection] = useState('asc');
  const filters = { query, sortBy, sortDirection, limit: QUERY_TABLE_PAGE_SIZE, offset: (page - 1) * QUERY_TABLE_PAGE_SIZE };
  const results = useQuery({ queryKey: ['complete-results', runKey, artifactKey, filters],
    queryFn: ({ signal }) => getCompleteResults(runKey, artifactKey, filters, { signal }), enabled: open,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === runKey && previousQuery?.queryKey[2] === artifactKey ? previous : undefined });
  const data = results.data;
  return <ResultDisclosure title="完整结果查询与下载（独立于当前图表）" summary="完整记录查询与 CSV 导出" className="complete-results" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    {open ? <>
      <p>查询当前分析产物的完整已存储丰度记录，不沿用图表的样本筛选、Top N、聚合或显著性阈值。稀疏存储未记录的样本×特征组合不会补零。</p>
      <div className="analysis-controls">
        <form className="analysis-filter-form" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setPage(1); }}>
          <label>完整结果搜索<input value={draft} onChange={e => setDraft(e.target.value)} placeholder="样本、分组、特征 ID 或注释" /></label>
          <button type="submit" className="analysis-button">查询完整结果</button>
          <label>结果排序<StyledSelect value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}>
            <option value="sampleCode">样本 ID</option><option value="featureId">特征 ID</option><option value="featureName">特征名称</option><option value="phenotype">分组</option><option value="abundance">丰度</option>
          </StyledSelect></label>
          <label>结果方向<StyledSelect value={sortDirection} onChange={e => { setSortDirection(e.target.value); setPage(1); }}><option value="asc">升序</option><option value="desc">降序</option></StyledSelect></label>
          {data && !results.isError ? <a className="analysis-button" href={completeResultsDownloadUrl(runKey, artifactKey, filters)} download>下载全部匹配结果 CSV</a> : null}
        </form>
      </div>
      {results.isPending ? <LoadingState message="正在查询完整结果，请稍候..." /> : results.error ? <ErrorState message={results.error.message} onRetry={results.refetch} /> : <>
        {results.isFetching ? <p role="status">正在查询，当前暂时显示上一页结果。</p> : null}
        <p>共 {data.total.toLocaleString()} 条 · 第 {page} / {Math.max(1, Math.ceil(data.total / QUERY_TABLE_PAGE_SIZE))} 页 · 数据版本 {data.datasetRevision} · 丰度口径 {data.abundanceScale} / {data.normalization}</p>
        {data.total ? <DataTableViewport ariaLabel="完整分析结果" resizable pageKey={page} pagination={<PaginationControls page={page} pageCount={Math.ceil(data.total / QUERY_TABLE_PAGE_SIZE)} onPageChange={setPage} disabled={results.isFetching} ariaLabel="完整结果分页" />}>
          <thead><tr>{data.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{data.items.map((row, index) => <tr key={`${row.sampleCode}-${row.featureId}-${index}`}>{data.columns.map(column => <td key={column}>{row[column] == null ? '—' : String(row[column])}</td>)}</tr>)}</tbody>
        </DataTableViewport> : <p role="status">没有匹配的完整结果。</p>}
      </>}
    </> : null}
  </ResultDisclosure>;
}
