import StyledSelect from '../ui/StyledSelect';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCompleteResults, completeResultsDownloadUrl } from '../../api/completeResults';
import DataTableViewport, { QUERY_TABLE_PAGE_SIZE } from './DataTableViewport';
import PaginationControls from './PaginationControls';
import LoadingState from '../ui/LoadingState';
import ErrorState from '../ui/ErrorState';
import ResultDisclosure from './ResultDisclosure';
import EvidenceLink from '../evidence/EvidenceLink';
import EvidenceBatchLink from '../evidence/EvidenceBatchLink';
import './complete-results.css';

const SPECIES_COLUMNS = {
  sampleCode: '样本 ID', phenotype: '分组', featureId: '特征 ID', taxonRank: '分类层级',
  kingdom: '域', phylum: '门', class: '纲', order: '目', family: '科', genus: '属',
  species: '种', fullTaxonomy: '完整分类', abundance: '丰度',
};

function restoredResults(runKey, artifactKey) {
  try { return JSON.parse(sessionStorage.getItem(`admeta:evidence:results:${runKey}:${artifactKey}`) || 'null') || {}; } catch { return {}; }
}

export default function CompleteResultsPanel({ runKey, artifactKey, contextNote = null }) {
  const [restored] = useState(() => restoredResults(runKey, artifactKey));
  const [open, setOpen] = useState(restored.open || false);
  const [page, setPage] = useState(restored.page || 1);
  const [query, setQuery] = useState(restored.query || '');
  const [draft, setDraft] = useState(restored.query || '');
  const [sortBy, setSortBy] = useState(restored.sortBy || 'sampleCode');
  const [sortDirection, setSortDirection] = useState(restored.sortDirection || 'asc');
  const [selections, setSelections] = useState(() => ({ [`${runKey}:${artifactKey}`]: [...new Set((restored.selectedSpecies || []).map(String))] }));
  const selectionKey = `${runKey}:${artifactKey}`;
  const selected = selections[selectionKey] || [];
  const toggle = id => setSelections(current => { const values = current[selectionKey] || []; return { ...current, [selectionKey]: values.includes(id) ? values.filter(v => v !== id) : [...values, id] }; });
  const filters = { query, sortBy, sortDirection, limit: QUERY_TABLE_PAGE_SIZE, offset: (page - 1) * QUERY_TABLE_PAGE_SIZE };
  const results = useQuery({ queryKey: ['complete-results', runKey, artifactKey, filters],
    queryFn: ({ signal }) => getCompleteResults(runKey, artifactKey, filters, { signal }), enabled: open,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === runKey && previousQuery?.queryKey[2] === artifactKey ? previous : undefined });
  const data = results.data;
  const speciesResults = data && ['species', 'taxonomy'].includes(data.featureKind);
  const columns = speciesResults ? data.columns.filter(column => column !== 'featureName') : data?.columns || [];
  const checkedIds = new Set(selected);
  const rememberView = () => {
    try {
      sessionStorage.setItem(`admeta:evidence:results:${runKey}:${artifactKey}`, JSON.stringify({ open: true, page, query, sortBy, sortDirection, selectedSpecies: selected }));
    } catch { /* Navigation still works without storage. */ }
  };
  return <ResultDisclosure title="完整结果查询与下载（独立于当前图表）" summary="完整记录查询与 CSV 导出" className="complete-results" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    {open ? <>
      {contextNote ? <p>{contextNote}</p> : null}
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
        {speciesResults && <div className="complete-species-actions">
          <strong aria-live="polite">已选 {selected.length} 个物种</strong>
          <EvidenceBatchLink selected={selected} data={data} onOpen={rememberView} />
          <button type="button" className="analysis-button" disabled={!selected.length} onClick={() => setSelections(current => ({ ...current, [selectionKey]: [] }))}>清空</button>
          <small>{selected.length ? '同属物种合并为一个属级候选。' : '勾选物种后可查看属级对照。'}</small>
        </div>}
        {data.total ? <DataTableViewport ariaLabel="完整分析结果" className={speciesResults ? 'complete-species-table' : ''} resizable pageKey={page} pagination={<PaginationControls page={page} pageCount={Math.ceil(data.total / QUERY_TABLE_PAGE_SIZE)} onPageChange={setPage} disabled={results.isFetching} ariaLabel="完整结果分页" />}>
          <thead><tr>
            {speciesResults && <><th scope="col" className="complete-species-check">加入对照</th><th scope="col" className="complete-species-name">物种名称</th></>}
            {columns.map(column => <th key={column} scope="col">{speciesResults ? SPECIES_COLUMNS[column] || column : column}</th>)}
            {speciesResults && <th scope="col" className="complete-species-evidence">特征证据</th>}
          </tr></thead>
          <tbody>{data.items.map((row, index) => {
            const id = String(row.featureId);
            const checked = speciesResults && checkedIds.has(id);
            const name = row.featureName || row.species || id;
            const link = { subjectId: id, sourceRevision: data.datasetRevision, datasetSlug: data.datasetSlug, runKey, artifactKey,
              context: { query, page, sortBy, sortDirection, source: '完整丰度记录；单行不代表总体差异' }, onOpen: rememberView };
            return <tr key={`${row.sampleCode}-${id}-${index}`} data-selected={checked || undefined}>
              {speciesResults && <>
                <td className="complete-species-check"><label className="complete-species-check-target"><input type="checkbox" aria-label={`加入属级对照 ${name}（${id}，${row.sampleCode}）`} checked={checked} onChange={() => toggle(id)} /></label></td>
                <th scope="row" className="complete-species-name"><span>{name}</span><EvidenceLink {...link} className="complete-species-compact-link" /></th>
              </>}
              {columns.map(column => <td key={column}>{row[column] == null ? '—' : String(row[column])}</td>)}
              {speciesResults && <td className="complete-species-evidence"><EvidenceLink {...link} /></td>}
            </tr>;
          })}</tbody>
        </DataTableViewport> : <p role="status">没有匹配的完整结果。</p>}
      </>}
    </> : null}
  </ResultDisclosure>;
}
