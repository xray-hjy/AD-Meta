import OrdinationChart from './OrdinationChart';

function PCoAPlot({ data, featureKind = 'taxonomy', featureLabel = '物种' }) {
  const isKo = featureKind === 'ko';
  const permanova = data?.permanova;
  const footer = permanova
    ? `PERMANOVA: R²=${Number(permanova.r2 || 0).toFixed(4)} · F=${Number(permanova.fStat || 0).toFixed(4)} · p=${Number(permanova.pValue || 1).toFixed(4)} · permutations=${permanova.nPerm}`
    : null;

  return (
    <OrdinationChart
      data={data}
      title={isKo ? 'KO PCoA' : 'β多样性 PCoA'}
      subtitle={`Bray-Curtis · Top ${data?.featureCount || data?.speciesCount || 0} ${featureLabel} · 后端预计算`}
      footer={footer}
    />
  );
}

export default PCoAPlot;
