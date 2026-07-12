import { useCallback, useEffect, useState } from 'react';
import { getChart } from '../api/datasets';

export default function useChartData(slug, chartType) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [requestKey, setRequestKey] = useState(null);

  const reload = useCallback(() => {
    if (!slug || !chartType) {
      setData(null);
      setLoading(false);
      setError(null);
      setRequestKey(null);
      return () => {};
    }

    let cancelled = false;
    const nextRequestKey = `${slug}:${chartType}`;

    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      setRequestKey(nextRequestKey);
      try {
        const result = await getChart(slug, chartType);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, chartType]);

  useEffect(() => reload(), [reload]);

  return { data, loading, error, requestKey, reload };
}
