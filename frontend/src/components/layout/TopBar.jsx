import { getAnalysisDataForFeatureKind } from '../../app/analysisDomains';
import { useColorVision } from '../../context/ColorVisionContext';
import { Link } from 'react-router-dom';
import AnalysisRunSelect from '../analysisRun/AnalysisRunSelect';

export default function TopBar({
  featureKind,
  summary,
  runs = [],
  runsLoading = false,
  runsError = null,
  activeRun,
  activeArtifact,
  onRunChange,
}) {
  const { colorBlindFriendly, setColorBlindFriendly } = useColorVision();
  const currentAnalysisData = getAnalysisDataForFeatureKind(featureKind);
  let sampleScope = '样本范围加载中';
  let resultStatus = '正在加载';
  if (runsError) {
    sampleScope = '样本范围加载失败';
    resultStatus = '加载失败';
  } else if (!runsLoading && !activeRun) {
    sampleScope = '尚未登记分析运行';
    resultStatus = '配置未完成';
  } else if (activeRun && !summary) {
    sampleScope = '数据摘要加载中';
  } else if (activeRun && summary) {
    sampleScope = `运行 ${activeRun.sampleCount} 样本 · 当前结果覆盖 ${activeArtifact?.sampleCount ?? summary.totalSamples}`;
    resultStatus = '结果已就绪';
  }

  return (
    <header className="app-topbar">
      <div className="workspace-branding">
        <Link className="app-title app-title--link" to="/">AD-Meta</Link>
        <span className="workspace-branding__divider" aria-hidden="true" />
        <div className="workspace-branding__context">
          <span className="workspace-kicker">分析工作区</span>
          <span className="app-subtitle">群落物种与功能分析</span>
        </div>
      </div>
      <div className="topbar-context">
        <div className="topbar-product">
          <span className="topbar-product__label">分析运行</span>
          <AnalysisRunSelect
            runs={runs}
            value={activeRun?.key || ''}
            onChange={onRunChange}
            disabled={runs.length === 0}
          />
        </div>
        <span className="topbar-status"><i aria-hidden="true" />{resultStatus}</span>
        <span
          className="topbar-context__scope"
          title={`${currentAnalysisData.label}，${currentAnalysisData.shape}`}
        >
          {sampleScope}
        </span>
        <label
          className={`colorblind-toggle ${colorBlindFriendly ? 'colorblind-toggle--active' : ''}`}
          title="为所有图表开启斜纹、点阵等辅助纹理"
        >
          <input
            type="checkbox"
            checked={colorBlindFriendly}
            onChange={event => setColorBlindFriendly(event.target.checked)}
          />
          <span className="colorblind-toggle__track" aria-hidden="true">
            <span className="colorblind-toggle__thumb" />
          </span>
          <span className="colorblind-toggle__label">色盲友好</span>
        </label>
        <Link className="topbar-home-link" to="/">首页</Link>
      </div>
    </header>
  );
}
