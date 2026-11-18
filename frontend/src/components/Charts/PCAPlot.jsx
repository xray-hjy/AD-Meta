import OrdinationChart from './OrdinationChart';

function PCAPlot({ data, projection }) {
  return <OrdinationChart data={data} projection={projection} />;
}

export default PCAPlot;
