import { DATASET_KIND_LABELS } from '../../app/labels';
import { Link } from 'react-router-dom';
import DatasetSelect from '../dataset/DatasetSelect';

export default function TopBar({
  datasetName,
  featureKind,
  datasets = [],
  activeDataset,
  onDatasetChange,
}) {
  return (
    <header className="app-topbar">
      <div className="workspace-branding">
        <Link className="app-title app-title--link" to="/">AD-Meta</Link>
        <span className="workspace-branding__divider" aria-hidden="true" />
        <div>
          <p className="workspace-kicker">分析工作区</p>
          <p className="app-subtitle">物种与 KO 丰度分析</p>
        </div>
      </div>
      <div className="topbar-context">
        <div className="topbar-dataset">
          <span className="topbar-dataset__label">数据集</span>
          <DatasetSelect
            datasets={datasets}
            value={activeDataset}
            onChange={onDatasetChange}
            disabled={datasets.length === 0}
          />
        </div>
        <span className="topbar-status"><i aria-hidden="true" />预计算数据</span>
        <span className="topbar-context__badge">{DATASET_KIND_LABELS[featureKind] || '数据集'}</span>
        <Link className="topbar-home-link" to="/">首页</Link>
      </div>
    </header>
  );
}
