export default function MetricCard({ label, value, tone = 'neutral' }) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__heading">
        <span className="metric-card__indicator" aria-hidden="true" />
        <span className="metric-card__label">{label}</span>
      </div>
      <div className="metric-card__value">{value ?? '-'}</div>
    </div>
  );
}
