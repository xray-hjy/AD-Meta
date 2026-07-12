import OrdinationChart from './OrdinationChart';

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function PCAPlot({ data }) {
  const variance = Array.isArray(data?.variance) ? data.variance : [];
  const featureCount = Number(data?.featureCount || data?.speciesCount || 0);
  const totalVariance = Number(variance[0] || 0) + Number(variance[1] || 0);
  const footer = variance.length >= 2
    ? `PCA: Top ${featureCount} 特征 · PC1=${formatPercent(variance[0])} · PC2=${formatPercent(variance[1])} · total=${formatPercent(totalVariance)}`
    : null;

  return <OrdinationChart data={data} footer={footer} />;
}

export default PCAPlot;
