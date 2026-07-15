import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import LoadingState from '../ui/LoadingState';

export default function ChartFrame({
  title,
  subtitle,
  loading,
  error,
  onRetry,
  empty,
  layout = 'fit',
  children,
}) {
  let body = children;
  if (loading) body = <LoadingState />;
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
      <div className="chart-frame__body">{body}</div>
    </section>
  );
}
