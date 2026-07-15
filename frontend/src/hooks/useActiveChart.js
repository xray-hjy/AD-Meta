import { useEffect, useMemo } from 'react';
import { getAvailableCharts } from '../app/chartRegistry';

export default function useActiveChart(summary, requestedChart, onChartChange) {
  const featureKind = summary?.featureKind || 'taxonomy';
  const featureLabel = summary?.featureLabel || '物种';
  const charts = useMemo(
    () => getAvailableCharts(featureKind, featureLabel, summary?.availableArtifacts),
    [featureKind, featureLabel, summary?.availableArtifacts]
  );
  const fallback = charts[0]?.key || 'species';
  const activeChart = charts.some(chart => chart.key === requestedChart)
    ? requestedChart
    : summary ? fallback : (requestedChart || fallback);

  useEffect(() => {
    if (summary && activeChart !== requestedChart) {
      onChartChange(activeChart, { replace: true });
    }
  }, [activeChart, onChartChange, requestedChart, summary]);

  return { activeChart, setActiveChart: onChartChange, charts };
}
