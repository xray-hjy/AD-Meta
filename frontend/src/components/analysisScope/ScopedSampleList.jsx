import { useEffect, useMemo, useState } from 'react';
import useScopedAnalysisSamples from '../../hooks/useScopedAnalysisSamples';
import DataTableViewport from '../data-display/DataTableViewport';
import PaginationControls from '../data-display/PaginationControls';
import ResultDisclosure from '../data-display/ResultDisclosure';

export default function ScopedSampleList({
  runKey,
  artifactKey,
  scope,
  sampleCount,
  prominent = false,
  expanded = false,
  searchable = false,
}) {
  const [open, setOpen] = useState(expanded);
  const [query, setQuery] = useState('');
  const [phenotype, setPhenotype] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 200;
  const scopeKey = JSON.stringify(scope || {});

  useEffect(() => {
    setOpen(expanded);
    setQuery('');
    setPhenotype('');
    setOffset(0);
  }, [runKey, artifactKey, scopeKey, expanded]);

  const request = useMemo(() => ({
    scope: scope || { mode: 'cohort', groups: [], sampleCodes: [] },
    query,
    ...(phenotype ? { phenotype } : {}),
    limit,
    offset,
  }), [limit, offset, scope, query, phenotype]);
  const state = useScopedAnalysisSamples(runKey, artifactKey, request, open);
  const showSourceStudy = state.availableFields.includes('sourceStudy');
  const total = state.data.length || query || phenotype || !state.loading ? state.total : Number(sampleCount) || 0;
  const pageStart = total ? offset + 1 : 0;
  const pageEnd = Math.min(offset + limit, total);

  return (
    <ResultDisclosure
      title={`查看参与样本${sampleCount ? `（${sampleCount}）` : ''}`}
      className={`projection-samples${prominent ? ' is-prominent' : ''}`}
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      {open ? (
        <div className="projection-samples__content">
          {searchable ? <div className="phylum-view-controls">
            <label>搜索参与样本<input aria-label="搜索参与样本" type="search" value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }} /></label>
            <label>参与样本分组<select aria-label="参与样本分组" value={phenotype} onChange={event => { setPhenotype(event.target.value); setOffset(0); }}><option value="">全部分组</option><option>AD</option><option>NC</option></select></label>
          </div> : null}
          <div className="projection-samples__meta">
            <span>仅列出当前图表分析范围内的样本元数据。</span>
            <span>{state.fetching ? '正在读取...' : `共 ${total} 个，显示 ${pageStart}-${pageEnd}`}</span>
          </div>
          {state.error ? (
            <div className="projection-audit__message is-error">
              <span>{state.error}</span>
              <button type="button" onClick={() => state.reload()}>重试</button>
            </div>
          ) : null}
          {!state.error && state.loading ? (
            <div className="projection-audit__message">正在读取参与样本...</div>
          ) : null}
          {!state.error && !state.loading ? (
            <DataTableViewport ariaLabel="参与样本数据，可滚动" resizable pageKey={offset}
              pagination={<PaginationControls
                page={Math.floor(offset / limit) + 1}
                pageCount={Math.max(1, Math.ceil(total / limit))}
                onPageChange={page => setOffset((page - 1) * limit)}
                disabled={state.fetching}
                ariaLabel="参与样本分页"
              />}>
                <thead>
                  <tr>
                    <th>样本编号</th>
                    <th>分组</th>
                    {showSourceStudy ? <th>来源研究</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {state.data.map(sample => (
                    <tr key={sample.sampleCode}>
                      <td>{sample.sampleCode}</td>
                      <td>{sample.phenotype}</td>
                      {showSourceStudy ? <td>{sample.sourceStudy}</td> : null}
                    </tr>
                  ))}
                  {!state.data.length ? (
                    <tr>
                      <td colSpan={showSourceStudy ? 3 : 2}>当前范围内没有样本记录。</td>
                    </tr>
                  ) : null}
                </tbody>
            </DataTableViewport>
          ) : null}
        </div>
      ) : null}
    </ResultDisclosure>
  );
}
