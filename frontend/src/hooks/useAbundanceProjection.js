import { useQuery } from '@tanstack/react-query';
import { projectAbundance } from '../api/analysisRuns';

export default function useAbundanceProjection(
  runKey,
  artifactKey,
  request,
  enabled = true
) {
  const query = useQuery({
    queryKey: ['abundance-projection', runKey, artifactKey, request],
    queryFn: ({ signal }) => projectAbundance(runKey, artifactKey, request, { signal }),
    enabled: Boolean(enabled && runKey && artifactKey),
    staleTime: 60_000,
  });
  return {
    data: query.data || null,
    loading: Boolean(enabled && runKey && artifactKey) && query.isPending,
    fetching: query.isFetching,
    error: query.error?.message || null,
    reload: query.refetch,
  };
}
