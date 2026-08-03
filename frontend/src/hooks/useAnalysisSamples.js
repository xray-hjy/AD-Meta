import { useQuery } from '@tanstack/react-query';
import { listAnalysisSamples } from '../api/analysisRuns';

export default function useAnalysisSamples(runKey, artifactKey, enabled = true) {
  const query = useQuery({
    queryKey: ['analysis-samples', runKey, artifactKey],
    queryFn: ({ signal }) => listAnalysisSamples(runKey, { artifactKey, signal }),
    enabled: Boolean(enabled && runKey && artifactKey),
    staleTime: 5 * 60_000,
  });
  return {
    data: query.data?.items || [],
    total: query.data?.total || 0,
    loading: Boolean(enabled && runKey && artifactKey) && query.isPending,
    error: query.error?.message || null,
    reload: query.refetch,
  };
}
