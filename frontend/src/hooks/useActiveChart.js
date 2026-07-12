import { useEffect, useMemo, useState } from 'react';
import { getAvailableCharts } from '../app/chartRegistry';

export default function useActiveChart(summary) {
  const featureKind = summary?.featureKind || 'taxonomy';
  const featureLabel = summary?.featureLabel || '物种';
  const charts = useMemo(
    () => getAvailableCharts(featureKind, featureLabel),
    [featureKind, featureLabel]
  );
  const [activeChart, setActiveChart] = useState('species');

  useEffect(() => {
    if (!charts.some(chart => chart.key === activeChart)) {
      setActiveChart(charts[0]?.key || 'species');
    }
  }, [activeChart, charts]);

  return { activeChart, setActiveChart, charts };
}
