import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import LoadingState from '../ui/LoadingState';

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
  let body = children;
  if (loading) body = loadingState || <LoadingState />;
  else if (error) body = <ErrorState message={error} onRetry={onRetry} />;
  else if (empty) body = <EmptyState message="当前图表暂无可展示数据" />;

  return (
    <section className={`chart-frame chart-frame--${layout}`} data-chart-layout={layout}>
      <header className="chart-frame__header">
        <div>
          <h2 className="chart-frame__title">{title}</h2>
          {subtitle ? <p className="chart-frame__subtitle">{subtitle}</p> : null}
        </div>
      </header>
      {controls ? <div className="chart-frame__controls">{controls}</div> : null}
      {disclosure ? <div className="chart-frame__disclosure">{disclosure}</div> : null}
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
  );
}
