import { useQuery } from '@tanstack/react-query';
import { listScopedAnalysisSamples } from '../api/analysisRuns';

export default function useScopedAnalysisSamples(
  runKey,
  artifactKey,
  request,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ['scoped-analysis-samples', runKey, artifactKey, request],
    queryFn: ({ signal }) => listScopedAnalysisSamples(
      runKey,
      artifactKey,
      request,
      { signal },
    ),
    enabled: Boolean(enabled && runKey && artifactKey),
    staleTime: 5 * 60_000,
  });
  return {
    data: query.data?.items || [],
    total: query.data?.total || 0,
    groupCounts: query.data?.groupCounts || {},
    availableFields: query.data?.availableFields || [],
    loading: Boolean(enabled && runKey && artifactKey) && query.isPending,
    fetching: query.isFetching,
    error: query.error?.message || null,
    reload: query.refetch,
  };
}
