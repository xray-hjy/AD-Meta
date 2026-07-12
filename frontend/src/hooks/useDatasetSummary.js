import { useCallback, useEffect, useState } from 'react';
import { getDatasetSummary } from '../api/datasets';

export default function useDatasetSummary(slug) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    if (!slug) {
      setData(null);
      setLoading(false);
      setError(null);
      return () => {};
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const result = await getDatasetSummary(slug);
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
  }, [slug]);

  useEffect(() => reload(), [reload]);

  return { data, loading, error, reload };
}
