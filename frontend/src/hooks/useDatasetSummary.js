import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getDatasetSummary } from '../api/datasets';

export default function useDatasetSummary(slug) {
  const query = useQuery({
    queryKey: ['dataset-summary', slug],
    queryFn: ({ signal }) => getDatasetSummary(slug, { signal }),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  });
  return {
    data: query.data || null,
    loading: Boolean(slug) && query.isPending,
    fetching: query.isFetching,
    error: query.error?.message || null,
    reload: query.refetch,
  };
}
