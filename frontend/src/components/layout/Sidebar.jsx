import ChartNav from '../dataset/ChartNav';
import DatasetSummary from '../dataset/DatasetSummary';

export default function Sidebar({
  summary,
  charts,
  activeChart,
  onChartChange,
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

      <section className="sidebar-section sidebar-section--navigation">
        <h3 className="sidebar-heading">分析导航</h3>
        <ChartNav charts={charts} activeChart={activeChart} onChange={onChartChange} />
      </section>
    </aside>
  );
}
