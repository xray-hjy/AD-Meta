import { useQuery } from '@tanstack/react-query';
import { listScopedAnalysisFeatures } from '../api/analysisRuns';

export default function useScopedFeatures(runKey, artifactKey, request, enabled = true) {
  const query = useQuery({
    queryKey: ['analysis-features', runKey, artifactKey, request],
    queryFn: ({ signal }) => listScopedAnalysisFeatures(runKey, artifactKey, request, { signal }),
    enabled: Boolean(enabled && runKey && artifactKey),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: previous => previous,
  });
  return {
    data: query.data || null,
    loading: query.isPending,
    fetching: query.isFetching,
    error: query.error?.message || null,
  };
}
