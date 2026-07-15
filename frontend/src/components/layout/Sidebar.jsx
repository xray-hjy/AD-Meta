import ChartNav from '../dataset/ChartNav';
import AnalysisDomainNav from '../dataset/AnalysisDomainNav';
import DatasetSummary from '../dataset/DatasetSummary';

export default function Sidebar({
  summary,
  datasets,
  charts,
  activeChart,
  onDatasetChange,
  onChartChange,
  onChartPrefetch,
}) {
  return (
    <aside className="sidebar" data-scroll-region="sidebar">
      <section className="sidebar-section">
        <div className="sidebar-section__header">
          <h3 className="sidebar-heading">数据概览</h3>
          <span className="sidebar-section__status">当前队列</span>
        </div>
        <DatasetSummary summary={summary} />
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section__header">
          <h3 className="sidebar-heading">分析模块</h3>
          <span className="sidebar-section__status">稳定入口</span>
        </div>
        <AnalysisDomainNav
          datasets={datasets}
          featureKind={summary?.featureKind}
          onDatasetChange={onDatasetChange}
        />
      </section>

      <section className="sidebar-section sidebar-section--navigation">
        <h3 className="sidebar-heading">分析导航</h3>
        <ChartNav
          charts={charts}
          activeChart={activeChart}
          featureKind={summary?.featureKind}
          onChange={onChartChange}
          onPrefetch={onChartPrefetch}
        />
      </section>
    </aside>
  );
}
