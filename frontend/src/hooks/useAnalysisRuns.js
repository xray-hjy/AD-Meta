import { useQuery } from '@tanstack/react-query';
import { listAnalysisRuns } from '../api/analysisRuns';

export default function useAnalysisRuns() {
  const query = useQuery({
    queryKey: ['analysis-runs'],
    queryFn: ({ signal }) => listAnalysisRuns({ signal }),
  });
  return {
    data: Array.isArray(query.data) ? query.data : [],
    loading: query.isPending,
    error: query.error?.message || null,
    reload: query.refetch,
  };
}
