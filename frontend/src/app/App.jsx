import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getChart } from '../api/datasets';
import { queryClient } from '../api/queryClient';
import { getChartDefinition, resolveChartMeta } from './chartRegistry';
import {
  defaultProjectionState,
  loadProjectionState,
  projectionSearchUpdates,
  readProjectionState,
  saveProjectionState,
} from './analysisScope';
import { normalizeAnalysisParameters, validateAnalysisScope } from './analysisPolicy';
import AppShell from '../components/layout/AppShell';
import ChartFrame from '../components/Charts/ChartFrame';
import AnalysisScopeToolbar from '../components/analysisScope/AnalysisScopeToolbar';
import BoxplotFeatureSelector from '../components/analysisScope/BoxplotFeatureSelector';
import ProjectionDisclosure from '../components/analysisScope/ProjectionDisclosure';
import ProjectionLoadingState from '../components/analysisScope/ProjectionLoadingState';
import ProjectionAuditPanel from '../components/analysisScope/ProjectionAuditPanel';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import LoadingState from '../components/ui/LoadingState';
import MainWorkspace from '../components/layout/MainWorkspace';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import CompleteResultsPanel from '../components/data-display/CompleteResultsPanel';
import useActiveChart from '../hooks/useActiveChart';
import useChartData from '../hooks/useChartData';
import useDatasetSummary from '../hooks/useDatasetSummary';
import useAnalysisRuns from '../hooks/useAnalysisRuns';
import useAnalysisSamples from '../hooks/useAnalysisSamples';
import useAnalysisProjection, {
  analysisProjectionQueryOptions,
} from '../hooks/useAnalysisProjection';
import useFeatureSelection from '../hooks/useFeatureSelection';

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
    case 'koContribution':
      chart = <ChartComponent data={chartData} />;
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
    case 'boxplot':
      chart = (
        <ChartComponent
          data={chartData}
          featureLabel={featureLabel}
          featureSelectionConfig={definition.analysisPolicy?.featureSelection}
        />
      );
      break;
    case 'species':
    case 'heatmap':
      chart = <ChartComponent data={chartData} featureLabel={featureLabel} />;
      break;
    default:
      chart = <ChartComponent data={chartData} />;
  }
  return <Suspense fallback={<LoadingState />}>{chart}</Suspense>;
}

function App({ datasetsState, onDomainChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const runsState = useAnalysisRuns();
  const requestedRun = searchParams.get('run') || '';
  const requestedDataset = searchParams.get('dataset') || '';
  const requestedChart = searchParams.get('chart') || 'species';
  const requestedChartDefinition = getChartDefinition(requestedChart);
  const projectionSelection = useMemo(
    () => readProjectionState(searchParams, requestedChartDefinition?.analysisPolicy),
    [requestedChartDefinition?.analysisPolicy, searchParams]
  );
  const activeRun = useMemo(
    () => runsState.data.find(run => run.key === requestedRun) || runsState.data[0] || null,
    [requestedRun, runsState.data]
  );
  const runDatasetSlugs = useMemo(
    () => new Set((activeRun?.artifacts || []).map(artifact => artifact.datasetSlug).filter(Boolean)),
    [activeRun]
  );
  const scopedDatasets = useMemo(
    () => activeRun
      ? datasetsState.data.filter(dataset => runDatasetSlugs.has(dataset.slug))
      : datasetsState.data,
    [activeRun, datasetsState.data, runDatasetSlugs]
  );
  const activeDataset = scopedDatasets.some(dataset => dataset.slug === requestedDataset)
    ? requestedDataset
    : scopedDatasets[0]?.slug || '';
  const activeArtifact = activeRun?.artifacts?.find(
    artifact => artifact.datasetSlug === activeDataset
  ) || null;
  const projectionStateContext = activeArtifact?.datasetRevision || activeArtifact?.key || '';

  const updateSelection = useCallback((updates, options = {}) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      });
      return next;
    }, options);
  }, [setSearchParams]);

  const changeDataset = useCallback(slug => {
    const defaultState = defaultProjectionState(getChartDefinition('species')?.analysisPolicy);
    updateSelection({
      dataset: slug,
      chart: 'species',
      ...projectionSearchUpdates(
        defaultState.scope,
        defaultState.topN,
        defaultState.parameters
      ),
    });
  }, [updateSelection]);

  const changeRun = useCallback(runKey => {
    const run = runsState.data.find(item => item.key === runKey);
    const firstDataset = run?.artifacts?.find(artifact => artifact.datasetSlug)?.datasetSlug;
    const defaultState = defaultProjectionState(getChartDefinition('species')?.analysisPolicy);
    const updates = {
      run: runKey,
      chart: 'species',
      ...projectionSearchUpdates(
        defaultState.scope,
        defaultState.topN,
        defaultState.parameters
      ),
    };
    if (firstDataset) updates.dataset = firstDataset;
    updateSelection(updates);
  }, [runsState.data, updateSelection]);

  const changeChart = useCallback((chart, options = {}) => {
    const definition = getChartDefinition(chart);
    if (requestedChartDefinition?.projection) {
      saveProjectionState(
        window.sessionStorage,
        activeRun?.key,
        projectionStateContext,
        requestedChart,
        projectionSelection
      );
    }
    const stored = definition?.projection
      ? loadProjectionState(
        window.sessionStorage,
        activeRun?.key,
        projectionStateContext,
        chart
      )
      : null;
    const initial = stored || defaultProjectionState(definition?.analysisPolicy);
    const normalized = normalizeAnalysisParameters(
      definition?.analysisPolicy,
      initial.topN,
      initial.parameters
    );
    updateSelection({
      chart,
      ...projectionSearchUpdates(
        initial.scope,
        normalized.topN,
        normalized.parameters
      ),
    }, options);
  }, [
    activeRun?.key,
    projectionSelection,
    projectionStateContext,
    requestedChart,
    requestedChartDefinition?.projection,
    updateSelection,
  ]);

  useEffect(() => {
    if (!scopedDatasets.length) return;
    const updates = {};
    if (activeRun && (!requestedRun || requestedRun !== activeRun.key)) updates.run = activeRun.key;
    if (!requestedDataset || requestedDataset !== activeDataset) updates.dataset = activeDataset;
    if (Object.keys(updates).length) updateSelection(updates, { replace: true });
  }, [activeDataset, activeRun, requestedDataset, requestedRun, scopedDatasets.length, updateSelection]);

  const summaryState = useDatasetSummary(activeDataset);
  const { activeChart, setActiveChart, charts } = useActiveChart(
    summaryState.data,
    requestedChart,
    changeChart
  );
  const activeChartDefinition = getChartDefinition(activeChart);
  const chartDataKey = activeChartDefinition?.dataKey || activeChart;
  const projectionKind = activeChartDefinition?.projection || '';
  const boxplotSelection = useFeatureSelection(
    activeRun?.key,
    activeArtifact?.key,
    'boxplot',
    projectionKind === 'boxplot'
  );
  const scopeSupported = !projectionKind
    || (activeChartDefinition?.supportedScopes || []).includes(projectionSelection.scope.mode);
  const samplesState = useAnalysisSamples(
    activeRun?.key,
    activeArtifact?.key,
    Boolean(projectionKind && activeRun?.key && activeArtifact?.key)
  );
  const scopeValidation = useMemo(() => {
    if (
      !projectionKind
      || !activeRun
      || !activeArtifact
      || samplesState.loading
      || samplesState.error
    ) {
      return { valid: true, reason: '' };
    }
    return validateAnalysisScope(
      activeChartDefinition?.analysisPolicy,
      projectionSelection.scope,
      samplesState.data
    );
  }, [activeArtifact, activeChartDefinition?.analysisPolicy, activeRun, projectionKind, projectionSelection.scope, samplesState.data, samplesState.error, samplesState.loading]);
  const projectionEnabled = Boolean(
    projectionKind
      && scopeSupported
      && scopeValidation.valid
      && !samplesState.loading
        && !samplesState.error
        && activeRun?.key
        && activeArtifact?.key
        && (projectionKind !== 'boxplot' || boxplotSelection.ready)
    );
  const projectionRequest = useMemo(() => ({
    scope: projectionSelection.scope,
    topN: projectionSelection.topN,
    ...(projectionKind === 'abundance'
      ? { ranking: 'mean_abundance' }
      : { parameters: projectionSelection.parameters }),
    ...(projectionKind === 'boxplot' ? { selection: boxplotSelection.request } : {}),
  }), [boxplotSelection.request, projectionKind, projectionSelection]);
  const chartState = useChartData(activeDataset, chartDataKey, !projectionKind);
  const projectionState = useAnalysisProjection(
    activeRun?.key,
    activeArtifact?.key,
    projectionKind,
    projectionRequest,
    projectionEnabled
  );
  const activeDataState = projectionKind ? projectionState : chartState;
  const activeChartData = projectionEnabled
    ? projectionKind === 'abundance'
      ? projectionState.data
      : projectionState.data?.payload ?? null
    : projectionKind ? null : activeDataState.data;

  const changeProjection = useCallback((scope, topN, parameters = {}) => {
    saveProjectionState(
      window.sessionStorage,
      activeRun?.key,
      projectionStateContext,
      activeChart,
      { scope, topN, parameters }
    );
    updateSelection(projectionSearchUpdates(scope, topN, parameters));
  }, [activeChart, activeRun?.key, projectionStateContext, updateSelection]);

  const prefetchChart = useCallback(chartKey => {
    const definition = getChartDefinition(chartKey);
    if (definition?.prefetchPolicy === 'on_navigation') return;
    if (definition?.projection) {
      if (!activeRun?.key || !activeArtifact?.key) return;
      const stored = loadProjectionState(
        window.sessionStorage,
        activeRun.key,
        projectionStateContext,
        chartKey
      );
      const initial = stored || defaultProjectionState(definition.analysisPolicy);
      const normalized = normalizeAnalysisParameters(
        definition.analysisPolicy,
        initial.topN,
        initial.parameters
      );
      const request = {
        scope: initial.scope,
        topN: normalized.topN,
        ...(definition.projection === 'abundance'
          ? { ranking: 'mean_abundance' }
          : { parameters: normalized.parameters }),
        ...(definition.projection === 'boxplot' ? {
          selection: {
            mode: 'ranked',
            ranking: 'mean_abundance',
            limit: definition.analysisPolicy?.featureSelection?.defaultLimit || 30,
            featureIds: [],
          },
        } : {}),
      };
      queryClient.prefetchQuery(analysisProjectionQueryOptions(
        activeRun.key,
        activeArtifact.key,
        definition.projection,
        request
      ));
      return;
    }
    const dataKey = definition?.dataKey || chartKey;
    if (!activeDataset || !dataKey) return;
    queryClient.prefetchQuery({
      queryKey: ['chart', activeDataset, dataKey],
      queryFn: ({ signal }) => getChart(activeDataset, dataKey, { signal }),
      staleTime: 60_000,
    });
  }, [activeArtifact, activeDataset, activeRun, projectionStateContext]);

  const loading = datasetsState.loading
    || runsState.loading
    || summaryState.loading
    || (Boolean(projectionKind) && samplesState.loading)
    || activeDataState.loading;
  const error = datasetsState.error
    || runsState.error
    || summaryState.error
    || (projectionKind ? samplesState.error : null)
    || activeDataState.error;
  const retry = datasetsState.error
    ? datasetsState.reload
    : runsState.error ? runsState.reload
      : summaryState.error ? summaryState.reload
        : samplesState.error ? samplesState.reload : activeDataState.reload;
  const scopeUnavailable = Boolean(projectionKind && !scopeSupported);
  const analysisRunUnavailable = Boolean(
    projectionKind
      && !runsState.loading
      && !runsState.error
      && runsState.data.length === 0
  );
  const analysisArtifactUnavailable = Boolean(
    projectionKind && activeRun && activeDataset && !activeArtifact
  );
  const scopeInvalid = Boolean(
    projectionKind
      && !analysisRunUnavailable
      && !analysisArtifactUnavailable
      && scopeSupported
      && !samplesState.loading
      && !scopeValidation.valid
  );
  const chartBody = analysisRunUnavailable
    ? <EmptyState message="尚未登记分析运行，请先同步分析运行清单。" />
    : analysisArtifactUnavailable
      ? <EmptyState message="当前分析运行未登记该数据集的分析产物。" />
      : scopeUnavailable
    ? <EmptyState message="当前图表不支持所选分析范围，请在上方选择可用范围。" />
    : scopeInvalid
      ? <EmptyState message={scopeValidation.reason} />
      : renderChartComponent(activeChart, activeChartData, summaryState.data);
  const activeChartMeta = useMemo(
    () => resolveChartMeta(activeChart, {
      featureKind: summaryState.data?.featureKind,
      featureLabel: summaryState.data?.featureLabel,
      summary: summaryState.data,
      chartData: activeChartData,
      topN: projectionSelection.topN,
      parameters: projectionSelection.parameters,
    }) || charts.find(chart => chart.key === activeChart) || charts[0],
    [activeChart, activeChartData, charts, projectionSelection.parameters, projectionSelection.topN, summaryState.data]
  );
  const projectionControls = projectionKind && activeRun && activeArtifact ? (
    <AnalysisScopeToolbar
      scope={projectionSelection.scope}
      topN={projectionSelection.topN}
      parameters={projectionSelection.parameters}
      samples={samplesState.data}
      samplesLoading={samplesState.loading}
      featureLabel={summaryState.data?.featureLabel || '物种'}
      supportedScopes={activeChartMeta?.supportedScopes}
      controls={activeChartMeta?.controls}
      scopeRequirement={activeChartMeta?.scopeRequirement}
      analysisPolicy={activeChartMeta?.analysisPolicy}
      chartControls={projectionKind === 'boxplot' ? (
        <BoxplotFeatureSelector
          runKey={activeRun.key}
          artifactKey={activeArtifact.key}
          scope={projectionSelection.scope}
          value={boxplotSelection.value}
          onChange={boxplotSelection.update}
          onApply={boxplotSelection.apply}
          onReset={boxplotSelection.reset}
          isDirty={boxplotSelection.isDirty}
          dirtyCount={boxplotSelection.dirtyCount}
          applying={projectionState.refreshing}
          featureLabel={summaryState.data?.featureLabel || '物种'}
          config={activeChartDefinition?.analysisPolicy?.featureSelection}
        />
      ) : null}
      onChange={changeProjection}
    />
  ) : null;
  const projectionDisclosure = projectionEnabled && projectionState.data ? (
    <ProjectionDisclosure data={projectionState.data} fetching={projectionState.fetching} />
  ) : null;
  const projectionAudit = projectionEnabled && projectionState.data ? (
    <ProjectionAuditPanel
      runKey={activeRun?.key}
      artifactKey={activeArtifact?.key}
      projectionKind={projectionKind}
      projectionRequest={projectionRequest}
      projectionData={projectionState.data}
    />
  ) : null;

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
          refreshing={projectionState.refreshing}
          refreshError={projectionState.refreshError}
          error={error}
        onRetry={retry}
        empty={!scopeUnavailable && !scopeInvalid && !loading && !error && !chartBody}
        layout={activeChartMeta?.layout || 'fit'}
        controls={projectionControls}
        disclosure={projectionDisclosure}
        audit={<>{projectionAudit}{activeRun && activeArtifact ? <CompleteResultsPanel key={`${activeRun.key}:${activeArtifact.key}`} runKey={activeRun.key} artifactKey={activeArtifact.key} /> : null}</>}
        loadingState={projectionKind ? <ProjectionLoadingState /> : null}
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
          runs={runsState.data}
          runsLoading={runsState.loading}
          runsError={runsState.error}
          activeRun={activeRun}
          activeArtifact={activeArtifact}
          onRunChange={changeRun}
        />
      }
      sidebar={
        <Sidebar
          summary={summaryState.data}
          datasets={scopedDatasets}
          charts={charts}
          activeChart={activeChart}
          onDatasetChange={changeDataset}
          onDomainChange={onDomainChange}
          onChartChange={setActiveChart}
          onChartPrefetch={prefetchChart}
        />
      }
      main={<MainWorkspace chartKey={activeChart}>{mainContent}</MainWorkspace>}
    />
  );
}

export default App;
