import OrdinationChart from './OrdinationChart';

function PCAPlot({ data, featureKind = 'taxonomy', featureLabel = '物种' }) {
  const isKo = featureKind === 'ko';

  return (
    <OrdinationChart
      data={data}
      title={isKo ? 'KO PCA' : 'β多样性 PCA'}
      subtitle={`Top ${data?.featureCount || data?.speciesCount || 0} ${featureLabel} · 后端预计算`}
    />
  );
}

export default PCAPlot;
