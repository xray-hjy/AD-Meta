import OrdinationChart from './OrdinationChart';

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function PCAPlot({ data }) {
  const variance = Array.isArray(data?.variance) ? data.variance : [];
  const featureCount = Number(data?.featureCount || data?.speciesCount || 0);
  const totalVariance = Number(variance[0] || 0) + Number(variance[1] || 0);
  const selection = data?.featureSelection;
  const preprocessing = data?.preprocessing;
  const footer = variance.length >= 2
    ? `PCA · 按总丰度选取 ${selection?.selectedCount || featureCount} 个特征 · 逐特征 Z-score 标准化 · PC1=${formatPercent(variance[0])} · PC2=${formatPercent(variance[1])} · 合计=${formatPercent(totalVariance)}${preprocessing?.transformation === 'none' ? '' : ` · ${preprocessing?.transformation}`}`
    : null;

  return <OrdinationChart data={data} footer={footer} />;
}

export default PCAPlot;
