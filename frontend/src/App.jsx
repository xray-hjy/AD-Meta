import { useEffect, useState } from 'react';
import './App.css';
import { fetchJson } from './api/client';
import StatsCards from './components/StatsCards';
import BarChart from './components/Charts/BarChart';
import PhylumChart from './components/Charts/PhylumChart';
import BoxPlot from './components/Charts/BoxPlot';
import Heatmap from './components/Charts/Heatmap';
import SunburstChart from './components/Charts/SunburstChart';
import PCAPlot from './components/Charts/PCAPlot';
import PCoAPlot from './components/Charts/PCoAPlot';

const TABS = [
  { key: 'species',  label: '丰度对比',   subtitle: 'Top N 物种 AD vs NC' },
  { key: 'phylum',   label: '门级组成',   subtitle: '各门相对丰度占比' },
  { key: 'boxplot',  label: '丰度箱线图', subtitle: '目标物种分布与离散度' },
  { key: 'heatmap',  label: '丰度热图',   subtitle: '差异物种聚类分析' },
  { key: 'sunburst', label: '分类旭日图', subtitle: '门→纲→属层级占比' },
  { key: 'pca',      label: 'β多样性 PCA', subtitle: '样本聚类趋势' },
  { key: 'pcoa',     label: 'β多样性 PCoA', subtitle: '主坐标分析距离矩阵' },
];

function App() {
  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState('');
  const [activeTab, setActiveTab] = useState('species');
  const [summary, setSummary] = useState(null);
  const [chartPayload, setChartPayload] = useState({
    datasetSlug: null,
    chartType: null,
    data: null,
  });
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartError, setChartError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDatasets() {
      setDatasetsLoading(true);
      setError(null);
      try {
        const result = await fetchJson('/api/datasets');
        if (cancelled) return;
        setDatasets(result);
        if (result.length > 0) {
          setActiveDataset(result[0].slug);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setDatasetsLoading(false);
      }
    }

    loadDatasets();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeDataset) return;
    let cancelled = false;

    async function loadSummary() {
      setSummaryLoading(true);
      setError(null);
      try {
        const result = await fetchJson(`/api/datasets/${activeDataset}/summary`);
        if (!cancelled) setSummary(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }

    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [activeDataset]);

  useEffect(() => {
    if (!activeDataset) return;
    let cancelled = false;
    const requestedDataset = activeDataset;
    const requestedTab = activeTab;

    async function loadChart() {
      setChartLoading(true);
      setChartError(null);
      setChartPayload({
        datasetSlug: requestedDataset,
        chartType: requestedTab,
        data: null,
      });
      try {
        const result = await fetchJson(`/api/datasets/${requestedDataset}/charts/${requestedTab}`);
        if (!cancelled) {
          setChartPayload({
            datasetSlug: requestedDataset,
            chartType: requestedTab,
            data: result,
          });
        }
      } catch (err) {
        if (!cancelled) setChartError(err.message);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }

    loadChart();
    return () => {
      cancelled = true;
    };
  }, [activeDataset, activeTab]);

  const renderChart = () => {
    if (datasetsLoading || summaryLoading || chartLoading) {
      return (
        <div className="placeholder">
          <div className="spinner" />
          <p>正在读取后端图表缓存，请稍候...</p>
        </div>
      );
    }
    if (error || chartError) {
      return (
        <div className="placeholder placeholder--error">
          <span className="placeholder-icon">&#9888;</span>
          <p>数据读取失败</p>
          <small>{error || chartError}</small>
        </div>
      );
    }
    if (!activeDataset || datasets.length === 0) {
      return <div className="placeholder"><p>暂无已发布数据集</p></div>;
    }

    const chartData =
      chartPayload.datasetSlug === activeDataset && chartPayload.chartType === activeTab
        ? chartPayload.data
        : null;

    if (chartData === null) {
      return (
        <div className="placeholder">
          <div className="spinner" />
          <p>正在读取后端图表缓存，请稍候...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'species':
        return <BarChart data={chartData} />;
      case 'phylum':
        return <PhylumChart data={chartData} />;
      case 'boxplot':
        return <BoxPlot data={chartData} />;
      case 'heatmap':
        return <Heatmap data={chartData} />;
      case 'sunburst':
        return <SunburstChart data={chartData} title={summary?.datasetName} />;
      case 'pca':
        return <PCAPlot data={chartData} />;
      case 'pcoa':
        return <PCoAPlot data={chartData} />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">AD-Meta</h1>
        <span className="app-subtitle">肠道菌群宏基因组可视化分析平台</span>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-heading">数据集</h3>
            <select
              className="dataset-select"
              value={activeDataset}
              onChange={event => {
                setActiveDataset(event.target.value);
                setActiveTab('species');
              }}
              disabled={datasets.length === 0}
            >
              {datasets.map(dataset => (
                <option key={dataset.slug} value={dataset.slug}>
                  {dataset.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-heading">仪表盘</h3>
            <StatsCards stats={summary} />
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-heading">可视化图表</h3>
            <nav className="nav-list">
              {TABS.map(t => (
                <button
                  key={t.key}
                  className={`nav-item ${activeTab === t.key ? 'nav-item--active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  <span className="nav-item-label">{t.label}</span>
                  <span className="nav-item-hint">{t.subtitle}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="main-content" key={activeTab}>
          {renderChart()}
        </main>
      </div>

      <footer className="app-footer">
        AD-Meta v0.1.0 &middot; 后端预计算只读可视化平台
      </footer>
    </div>
  );
}

export default App;
