import OrdinationChart from './OrdinationChart';

function PCoAPlot({ data }) {
  const permanova = data?.permanova;
  const footer = permanova
    ? `PERMANOVA: R²=${Number(permanova.r2 || 0).toFixed(4)} · F=${Number(permanova.fStat || 0).toFixed(4)} · p=${Number(permanova.pValue || 1).toFixed(4)} · permutations=${permanova.nPerm}`
    : null;

  return (
    <OrdinationChart
      data={data}
      title="β多样性 PCoA"
      subtitle={`Bray-Curtis · Top ${data?.speciesCount || 0} 物种 · 后端预计算`}
      footer={footer}
    />
  );
}

export default PCoAPlot;
