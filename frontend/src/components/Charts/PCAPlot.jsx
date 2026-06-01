import OrdinationChart from './OrdinationChart';

function PCAPlot({ data }) {
  return (
    <OrdinationChart
      data={data}
      title="β多样性 PCA"
      subtitle={`Top ${data?.speciesCount || 0} 物种 · 后端预计算`}
    />
  );
}

export default PCAPlot;
