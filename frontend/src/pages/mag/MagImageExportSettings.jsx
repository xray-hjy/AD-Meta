import ChartImageExportSettings from '../../components/Charts/ChartImageExportSettings';
import '../../components/Charts/chart-export-menu.css';

export default function MagImageExportSettings(props) {
  return <ChartImageExportSettings {...props} storageKey="admeta:mag:bar-export-defaults:v1" />;
}
