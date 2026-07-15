import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getChart } from '../api/datasets';
import { queryClient } from '../api/queryClient';
import { getChartDefinition, resolveChartMeta } from './chartRegistry';
import AppShell from '../components/layout/AppShell';
import ChartFrame from '../components/Charts/ChartFrame';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import LoadingState from '../components/ui/LoadingState';
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
  let chart;
  switch (chartType) {
    case 'phylum':
      chart = <ChartComponent data={chartData} featureKind={featureKind} featureLabel={featureLabel} />;
      break;
    case 'sunburst':
    case 'treemap':
    case 'sankey':
    case 'radialtree':
      chart = (
        <ChartComponent
          data={chartData}
          title={summary?.datasetName}
          featureKind={featureKind}
          mode={definition.mode}
        />
      );
      break;
    case 'pca':
    case 'pcoa':
      chart = <ChartComponent data={chartData} featureKind={featureKind} featureLabel={featureLabel} />;
      break;
    case 'species':
    case 'boxplot':
    case 'heatmap':
      chart = <ChartComponent data={chartData} featureLabel={featureLabel} />;
      break;
    default:
      chart = <ChartComponent data={chartData} />;
  }
  return <Suspense fallback={<LoadingState />}>{chart}</Suspense>;
}

function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetsState = useDatasets();
  const requestedDataset = searchParams.get('dataset') || '';
  const requestedChart = searchParams.get('chart') || 'species';
  const activeDataset = requestedDataset || datasetsState.data[0]?.slug || '';

  const updateSelection = useCallback((updates, options = {}) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => next.set(key, value));
      return next;
    }, options);
  }, [setSearchParams]);

  const changeDataset = useCallback(slug => {
    updateSelection({ dataset: slug, chart: 'species' });
  }, [updateSelection]);

  const changeChart = useCallback((chart, options = {}) => {
    updateSelection({ chart }, options);
  }, [updateSelection]);

  useEffect(() => {
    if (!datasetsState.data.length) return;
    const exists = datasetsState.data.some(dataset => dataset.slug === activeDataset);
    if (!exists || !requestedDataset) {
      updateSelection({ dataset: datasetsState.data[0].slug }, { replace: true });
    }
  }, [activeDataset, datasetsState.data, requestedDataset, updateSelection]);

  const summaryState = useDatasetSummary(activeDataset);
  const { activeChart, setActiveChart, charts } = useActiveChart(
    summaryState.data,
    requestedChart,
    changeChart
  );
  const activeChartDefinition = getChartDefinition(activeChart);
  const chartDataKey = activeChartDefinition?.dataKey || activeChart;
  const chartState = useChartData(activeDataset, chartDataKey);

  const prefetchChart = useCallback(chartKey => {
    const definition = getChartDefinition(chartKey);
    const dataKey = definition?.dataKey || chartKey;
    if (!activeDataset || !dataKey) return;
    queryClient.prefetchQuery({
      queryKey: ['chart', activeDataset, dataKey],
      queryFn: ({ signal }) => getChart(activeDataset, dataKey, { signal }),
      staleTime: 60_000,
    });
  }, [activeDataset]);

  const loading = datasetsState.loading || summaryState.loading || chartState.loading;
  const error = datasetsState.error || summaryState.error || chartState.error;
  const retry = datasetsState.error
    ? datasetsState.reload
    : summaryState.error ? summaryState.reload : chartState.reload;
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

  let mainContent;
  if (!activeDataset && !datasetsState.loading && datasetsState.data.length === 0) {
    mainContent = <EmptyState message="暂无已发布分析数据" />;
  } else if (error && !loading) {
    mainContent = <ErrorState message={error} onRetry={retry} />;
  } else {
    mainContent = (
      <ChartFrame
        title={activeChartMeta?.title || activeChartMeta?.label || '图表'}
        subtitle={activeChartMeta?.frameSubtitle || activeChartMeta?.subtitle}
        loading={loading}
        error={error}
        onRetry={retry}
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
          featureKind={summaryState.data?.featureKind}
          summary={summaryState.data}
          datasets={datasetsState.data}
          activeDataset={activeDataset}
          onDatasetChange={changeDataset}
        />
      }
      sidebar={
        <Sidebar
          summary={summaryState.data}
          datasets={datasetsState.data}
          charts={charts}
          activeChart={activeChart}
          onDatasetChange={changeDataset}
          onChartChange={setActiveChart}
          onChartPrefetch={prefetchChart}
        />
      }
      main={<MainWorkspace chartKey={activeChart}>{mainContent}</MainWorkspace>}
    />
  );
}

export default App;
