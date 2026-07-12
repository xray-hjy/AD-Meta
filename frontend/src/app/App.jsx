import { useEffect, useMemo, useState } from 'react';
import { getChartDefinition, resolveChartMeta } from './chartRegistry';
import AppShell from '../components/layout/AppShell';
import ChartFrame from '../components/Charts/ChartFrame';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import MainWorkspace from '../components/layout/MainWorkspace';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import useActiveChart from '../hooks/useActiveChart';
import useChartData from '../hooks/useChartData';
import useDatasets from '../hooks/useDatasets';
import useDatasetSummary from '../hooks/useDatasetSummary';

function renderChartComponent(chartType, chartData, summary) {
  const definition = getChartDefinition(chartType);
  if (!definition || !chartData) return null;

  const ChartComponent = definition.component;
  const featureKind = summary?.featureKind || 'taxonomy';
  const featureLabel = summary?.featureLabel || '物种';

  switch (chartType) {
    case 'phylum':
      return <ChartComponent data={chartData} featureKind={featureKind} featureLabel={featureLabel} />;
    case 'sunburst':
    case 'treemap':
    case 'sankey':
    case 'radialtree':
      return (
        <ChartComponent
          data={chartData}
          title={summary?.datasetName}
          featureKind={featureKind}
          mode={definition.mode}
        />
      );
    case 'pca':
    case 'pcoa':
      return <ChartComponent data={chartData} featureKind={featureKind} featureLabel={featureLabel} />;
    case 'species':
    case 'boxplot':
    case 'heatmap':
      return <ChartComponent data={chartData} featureLabel={featureLabel} />;
    default:
      return <ChartComponent data={chartData} />;
  }
}

function App() {
  const datasetsState = useDatasets();
  const [activeDataset, setActiveDataset] = useState('');

  useEffect(() => {
    if (!activeDataset && datasetsState.data.length > 0) {
      setActiveDataset(datasetsState.data[0].slug);
    }
  }, [activeDataset, datasetsState.data]);

  const summaryState = useDatasetSummary(activeDataset);
  const { activeChart, setActiveChart, charts } = useActiveChart(summaryState.data);
  const activeChartDefinition = getChartDefinition(activeChart);
  const chartDataKey = activeChartDefinition?.dataKey || activeChart;
  const chartState = useChartData(activeDataset, chartDataKey);

  const loading = datasetsState.loading || summaryState.loading || chartState.loading;
  const error = datasetsState.error || summaryState.error || chartState.error;
  const chartBody = renderChartComponent(activeChart, chartState.data, summaryState.data);
  const activeChartMeta = useMemo(
    () => resolveChartMeta(activeChart, {
      featureKind: summaryState.data?.featureKind,
      featureLabel: summaryState.data?.featureLabel,
      summary: summaryState.data,
      chartData: chartState.data,
    }) || charts.find(chart => chart.key === activeChart) || charts[0],
    [activeChart, chartState.data, charts, summaryState.data]
  );

  let mainContent = null;
  if (!activeDataset && !datasetsState.loading && datasetsState.data.length === 0) {
    mainContent = <EmptyState message="暂无已发布数据集" />;
  } else if (error && !loading) {
    mainContent = <ErrorState message={error} />;
  } else {
    mainContent = (
      <ChartFrame
        title={activeChartMeta?.title || activeChartMeta?.label || '图表'}
        subtitle={activeChartMeta?.frameSubtitle || activeChartMeta?.subtitle}
        loading={loading}
        error={error}
        empty={!loading && !error && !chartBody}
        layout={activeChartMeta?.layout || 'fit'}
      >
        {chartBody}
      </ChartFrame>
    );
  }

  return (
    <AppShell
      topbar={
        <TopBar
          datasetName={summaryState.data?.datasetName}
          featureKind={summaryState.data?.featureKind}
          datasets={datasetsState.data}
          activeDataset={activeDataset}
          onDatasetChange={slug => {
            setActiveDataset(slug);
            setActiveChart('species');
          }}
        />
      }
      sidebar={
        <Sidebar
          summary={summaryState.data}
          charts={charts}
          activeChart={activeChart}
          onChartChange={setActiveChart}
        />
      }
      main={<MainWorkspace chartKey={activeChart}>{mainContent}</MainWorkspace>}
    />
  );
}

export default App;
