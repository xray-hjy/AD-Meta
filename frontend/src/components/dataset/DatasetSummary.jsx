import MetricCard from '../ui/MetricCard';

export default function DatasetSummary({ summary }) {
  if (!summary) {
    return <div className="summary-loading">加载中...</div>;
  }

  const featureLabel = summary.featureLabel || '物种';
  const cards = [
    { label: '总样本数', value: summary.totalSamples, tone: 'neutral' },
    { label: `${featureLabel}总数`, value: summary.totalFeatures ?? summary.totalSpecies, tone: 'accent' },
    { label: 'AD 组', value: summary.adSamples, tone: 'ad' },
    { label: 'NC 组', value: summary.ncSamples, tone: 'nc' },
  ];

  return (
    <div className="metric-grid">
      {cards.map(card => (
        <MetricCard key={card.label} {...card} />
      ))}
    </div>
  );
}
