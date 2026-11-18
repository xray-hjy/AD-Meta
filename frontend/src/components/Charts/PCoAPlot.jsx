import OrdinationChart from './OrdinationChart';

function PCoAPlot({ data, projection }) {
  return <OrdinationChart data={data} projection={projection} />;
}

export default PCoAPlot;
