import { getAnalysisDataForFeatureKind } from '../../app/analysisDomains';
import { Link } from 'react-router-dom';
import DatasetSelect from '../dataset/DatasetSelect';

export default function TopBar({
  featureKind,
  summary,
  datasets = [],
  activeDataset,
  onDatasetChange,
}) {
  const currentAnalysisData = getAnalysisDataForFeatureKind(featureKind);
  const sampleScope = summary
    ? `${summary.totalSamples} 样本 · AD ${summary.adSamples} / NC ${summary.ncSamples}`
    : '样本范围加载中';

  return (
    <header className="app-topbar">
      <div className="workspace-branding">
        <Link className="app-title app-title--link" to="/">AD-Meta</Link>
        <span className="workspace-branding__divider" aria-hidden="true" />
        <div>
          <p className="workspace-kicker">分析工作区</p>
          <p className="app-subtitle">群落物种与功能分析</p>
        </div>
      </div>
      <div className="topbar-context">
        <div className="topbar-product">
          <span className="topbar-product__label">分析数据</span>
          <DatasetSelect
            datasets={datasets}
            value={activeDataset}
            onChange={onDatasetChange}
            disabled={datasets.length === 0}
            getOptionLabel={dataset => getAnalysisDataForFeatureKind(dataset.featureKind).label}
          />
        </div>
        <span className="topbar-status"><i aria-hidden="true" />结果已就绪</span>
        <span
          className="topbar-context__scope"
          title={`${currentAnalysisData.label}，${currentAnalysisData.shape}`}
        >
          {sampleScope}
        </span>
        <Link className="topbar-home-link" to="/">首页</Link>
      </div>
    </header>
  );
}
