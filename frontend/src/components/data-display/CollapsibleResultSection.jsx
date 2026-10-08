import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import ChartFrameActionGroup from '../Charts/ChartFrameActionGroup';
import { ChartFrameActionsProvider } from '../Charts/ChartFrameActionsContext';
import './result-section.css';

export default function CollapsibleResultSection({ title, summary, storageKey, actions = null, controls = null, renderChartActions = null, className = '', children }) {
  const id = useId();
  const [collapsed, setCollapsed] = useState(() => {
    try { return Boolean(storageKey) && sessionStorage.getItem(storageKey) === 'collapsed'; }
    catch { return false; }
  });
  const [hasOpened, setHasOpened] = useState(!collapsed);
  const [actionRegistry, setActionRegistry] = useState(() => new Map());
  const [toolbarTarget, setToolbarTarget] = useState(null);
  const registerActions = useCallback((owner, chartActions) => {
    setActionRegistry(current => new Map(current).set(owner, chartActions));
    return () => setActionRegistry(current => {
      const next = new Map(current);
      next.delete(owner);
      return next;
    });
  }, []);
  const chartActions = useMemo(() => Array.from(actionRegistry.values()).flat(), [actionRegistry]);
  useEffect(() => {
    if (!storageKey) return;
    try { sessionStorage.setItem(storageKey, collapsed ? 'collapsed' : 'expanded'); }
    catch { /* Keep folding usable when browser storage is unavailable. */ }
  }, [storageKey, collapsed]);

  return <ChartFrameActionsProvider registerActions={registerActions} toolbarTarget={toolbarTarget}>
    <section className={`result-section ${className}`.trim()} aria-labelledby={`${id}-title`}>
      <header className="result-section__bar">
        <h3 className="result-section__heading">
          <button type="button" className="result-section__toggle" aria-label={`${collapsed ? '展开' : '收起'}${title}`}
            aria-expanded={!collapsed} aria-controls={`${id}-body`} onClick={() => { setHasOpened(true); setCollapsed(value => !value); }}>
            <svg className={`result-section__chevron${collapsed ? '' : ' is-open'}`} viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
            <span id={`${id}-title`} className="result-section__title">{title}</span>
            {summary ? <span className="result-section__summary">{summary}</span> : null}
          </button>
        </h3>
        {!collapsed && controls ? <div className="result-section__controls">{controls}</div> : null}
        <div className="result-section__actions">
          <div className="chart-frame__style-slot" ref={setToolbarTarget} hidden={collapsed} />
          {actions}
          {renderChartActions ? !collapsed && renderChartActions(chartActions) : <ChartFrameActionGroup actions={chartActions} ariaLabel={`${title}操作`} />}
        </div>
      </header>
      <div id={`${id}-body`} className="result-section__body" hidden={collapsed}>{hasOpened ? children : null}</div>
    </section>
  </ChartFrameActionsProvider>;
}
