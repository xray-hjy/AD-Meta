import { useCallback, useMemo, useState } from 'react';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import LoadingState from '../ui/LoadingState';
import ChartFrameActionGroup from './ChartFrameActionGroup';
import { ChartFrameActionsProvider } from './ChartFrameActionsContext';

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
  disclosure = null,
  audit = null,
  loadingState = null,
  children,
}) {
  const [actionRegistry, setActionRegistry] = useState(() => new Map());
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

  return (
    <ChartFrameActionsProvider registerActions={registerActions}>
      <section className={`chart-frame chart-frame--${layout}`} data-chart-layout={layout}>
      <header className="chart-frame__header">
        <div>
          <h2 className="chart-frame__title">{title}</h2>
          {subtitle ? <p className="chart-frame__subtitle">{subtitle}</p> : null}
        </div>
      </header>
      {controls ? <div className="chart-frame__controls">{controls}</div> : null}
      {disclosure || frameActions.length ? (
        <div className="chart-frame__context-bar">
          <div className="chart-frame__disclosure">{disclosure}</div>
          <ChartFrameActionGroup actions={frameActions} />
        </div>
      ) : null}
      <div className="chart-frame__body">
        <div className="chart-frame__content">
          {body}
          {refreshing ? (
            <div className="chart-frame__refreshing" role="status" aria-live="polite">
              <span className="chart-frame__refreshing-spinner" aria-hidden="true" />
              <span>正在计算新选择，当前仍显示上一版本结果</span>
            </div>
          ) : null}
          {!refreshing && refreshError ? (
            <div className="chart-frame__refresh-error" role="alert">
              <span>新选择计算失败，当前仍显示上一版本结果</span>
              {onRetry ? (
                <button type="button" onClick={onRetry}>重试</button>
              ) : null}
            </div>
          ) : null}
        </div>
        {audit ? <div className="chart-frame__audit">{audit}</div> : null}
      </div>
      </section>
    </ChartFrameActionsProvider>
  );
}
