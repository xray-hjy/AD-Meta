import { useCallback, useId, useMemo, useState } from 'react';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import LoadingState from '../ui/LoadingState';
import ChartFrameActionGroup from './ChartFrameActionGroup';
import { ChartFrameActionsProvider } from './ChartFrameActionsContext';
import '../data-display/result-section.css';

export default function ChartFrame({
  title,
  subtitle,
  loading,
  refreshing = false,
  error,
  refreshError = null,
  onRetry,
  empty,
  layout = 'fit',
  controls = null,
  description = null,
  disclosure = null,
  audit = null,
  loadingState = null,
  collapsible = false,
  sectioned = false,
  chartControls = null,
  children,
}) {
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [actionRegistry, setActionRegistry] = useState(() => new Map());
  const [toolbarTarget, setToolbarTarget] = useState(null);
  const [supplementTarget, setSupplementTarget] = useState(null);
  const registerActions = useCallback((owner, actions) => {
    setActionRegistry(current => {
      const next = new Map(current);
      next.set(owner, Array.isArray(actions) ? actions : []);
      return next;
    });
    return () => {
      setActionRegistry(current => {
        if (!current.has(owner)) return current;
        const next = new Map(current);
        next.delete(owner);
        return next;
      });
    };
  }, []);
  const frameActions = useMemo(
    () => Array.from(actionRegistry.values()).flat(),
    [actionRegistry],
  );

  let body = children;
  if (loading) body = loadingState || <LoadingState />;
  else if (error) body = <ErrorState message={error} onRetry={onRetry} />;
  else if (empty) body = <EmptyState message="当前图表暂无可展示数据" />;

  const chartContent = <>
    {body}
    {refreshing ? <div className="chart-frame__refreshing" role="status" aria-live="polite">
      <span className="chart-frame__refreshing-spinner" aria-hidden="true" />
      <span>正在计算新选择，当前仍显示上一版本结果</span>
    </div> : null}
    {!refreshing && refreshError ? <div className="chart-frame__refresh-error" role="alert">
      <span>新选择计算失败，当前仍显示上一版本结果</span>
      {onRetry ? <button type="button" onClick={onRetry}>重试</button> : null}
    </div> : null}
  </>;

  if (sectioned) return <ChartFrameActionsProvider registerActions={registerActions}
    toolbarTarget={toolbarTarget} supplementTarget={supplementTarget}>
    {description}
    {controls ? <section className="community-scope-card" aria-label="分析范围与筛选">{controls}</section> : null}
    <section className={`chart-frame chart-frame--${layout} chart-frame--sectioned`} data-chart-layout={layout}>
      <header className="chart-frame__header">
        <div><h2 className="chart-frame__title">{title}</h2>
          {subtitle ? <p className="chart-frame__subtitle">{subtitle}</p> : null}</div>
      </header>
      <div className="chart-frame__body">
        <section className="result-section community-chart-section" aria-label={`${title}图表区域`}>
          <header className="result-section__bar">
            <h3 className="result-section__heading">
              <button type="button" className="result-section__toggle" aria-label={`${collapsed ? '展开' : '收起'}${title}`}
                aria-expanded={!collapsed} aria-controls={contentId} onClick={() => setCollapsed(value => !value)}>
                <svg className={`result-section__chevron${collapsed ? '' : ' is-open'}`} viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
                <span className="result-section__title">{title}</span>
              </button>
            </h3>
            {!collapsed && chartControls ? <div className="result-section__controls">{chartControls}</div> : null}
            <div className="result-section__actions" hidden={collapsed}>
              <div className="chart-frame__style-slot" ref={setToolbarTarget} />
              <ChartFrameActionGroup actions={frameActions} />
            </div>
          </header>
          <div id={contentId} className="result-section__body" hidden={collapsed}>
            {disclosure ? <div className="chart-frame__disclosure">{disclosure}</div> : null}
            <div className="chart-frame__content">{chartContent}</div>
          </div>
        </section>
        <div className="chart-frame__results" ref={setSupplementTarget} />
        {audit ? <div className="chart-frame__audit">{audit}</div> : null}
      </div>
    </section>
  </ChartFrameActionsProvider>;

  return (
    <ChartFrameActionsProvider registerActions={registerActions} toolbarTarget={toolbarTarget}>
      <section className={`chart-frame chart-frame--${layout}`} data-chart-layout={layout}>
      <header className="chart-frame__header">
        <div>
          <h2 className="chart-frame__title">{title}</h2>
          {subtitle ? <p className="chart-frame__subtitle">{subtitle}</p> : null}
        </div>
      </header>
      {description}
      {controls ? <div className="chart-frame__controls">{controls}</div> : null}
      {disclosure || frameActions.length || collapsible ? (
        <div className={`chart-frame__context-bar${collapsible ? ' chart-frame__context-bar--collapsible' : ''}`}>
          <div className="chart-frame__context-main">
            {collapsible ? <button type="button" className="chart-frame__fold" aria-label={`${collapsed ? '展开' : '收起'}${title}`}
              aria-expanded={!collapsed} aria-controls={contentId} onClick={() => setCollapsed(value => !value)}>
              <svg className={`result-section__chevron${collapsed ? '' : ' is-open'}`} viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
              <span className="chart-frame__context-title" title={title}>{title}</span>
            </button> : <span className="chart-frame__context-title" title={title}>{title}</span>}
            <div className="chart-frame__disclosure">{disclosure}</div>
          </div>
          <div className="chart-frame__action-strip" hidden={collapsible && collapsed}>
            <div className="chart-frame__style-slot" ref={setToolbarTarget} />
            <ChartFrameActionGroup actions={frameActions} />
          </div>
        </div>
      ) : null}
      <div className="chart-frame__body">
        <div id={contentId} className="chart-frame__content" hidden={collapsible && collapsed}>
          {chartContent}
        </div>
        {audit ? <div className="chart-frame__audit">{audit}</div> : null}
      </div>
      </section>
    </ChartFrameActionsProvider>
  );
}
