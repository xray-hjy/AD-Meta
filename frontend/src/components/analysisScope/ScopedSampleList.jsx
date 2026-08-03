import { useEffect, useMemo, useState } from 'react';
import useScopedAnalysisSamples from '../../hooks/useScopedAnalysisSamples';

export default function ScopedSampleList({
  runKey,
  artifactKey,
  scope,
  sampleCount,
  prominent = false,
}) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const scopeKey = JSON.stringify(scope || {});

  useEffect(() => {
    setOpen(false);
    setOffset(0);
  }, [runKey, artifactKey, scopeKey]);

  const request = useMemo(() => ({
    scope: scope || { mode: 'cohort', groups: [], sampleCodes: [] },
    query: '',
    limit,
    offset,
  }), [limit, offset, scope]);
  const state = useScopedAnalysisSamples(runKey, artifactKey, request, open);
  const showSourceStudy = state.availableFields.includes('sourceStudy');
  const total = state.total || Number(sampleCount) || 0;
  const pageStart = total ? offset + 1 : 0;
  const pageEnd = Math.min(offset + limit, total);

  return (
    <details
      className={`projection-samples${prominent ? ' is-prominent' : ''}`}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary>查看参与样本{sampleCount ? `（${sampleCount}）` : ''}</summary>
      {open ? (
        <div className="projection-samples__content">
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
            <div className="projection-audit__table-scroll">
              <table>
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
              </table>
            </div>
          ) : null}
          <div className="projection-audit__pagination">
            <button type="button" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              上一页
            </button>
            <button type="button" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </details>
  );
}
