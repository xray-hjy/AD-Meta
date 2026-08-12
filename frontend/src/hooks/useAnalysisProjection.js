import { useQuery } from '@tanstack/react-query';
import { projectAbundance, projectChart } from '../api/analysisRuns';

export const ANALYSIS_PROJECTION_STALE_TIME = 15 * 60_000;
export const ANALYSIS_PROJECTION_GC_TIME = 60 * 60_000;

export function analysisProjectionQueryOptions(
  runKey,
  artifactKey,
  projectionKind,
  request
) {
  return {
    queryKey: ['analysis-projection', runKey, artifactKey, projectionKind, request],
    queryFn: ({ signal }) => projectionKind === 'abundance'
      ? projectAbundance(runKey, artifactKey, request, { signal })
      : projectChart(runKey, artifactKey, projectionKind, request, { signal }),
    staleTime: ANALYSIS_PROJECTION_STALE_TIME,
    gcTime: ANALYSIS_PROJECTION_GC_TIME,
  };
}

export default function useAnalysisProjection(
  runKey,
  artifactKey,
  projectionKind,
  request,
  enabled = true
) {
  const query = useQuery({
    ...analysisProjectionQueryOptions(runKey, artifactKey, projectionKind, request),
    enabled: Boolean(enabled && runKey && artifactKey && projectionKind),
    placeholderData: previous => previous,
  });
  const queryError = query.error?.message || null;
  const hasData = Boolean(query.data);
  return {
    data: query.data || null,
    loading: Boolean(enabled && runKey && artifactKey && projectionKind) && query.isPending && !query.data,
    fetching: query.isFetching,
    refreshing: query.isFetching && hasData,
    error: hasData ? null : queryError,
    refreshError: hasData ? queryError : null,
    reload: query.refetch,
  };
}
