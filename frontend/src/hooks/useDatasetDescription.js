import { useQuery } from '@tanstack/react-query';
import { getDatasetDescription } from '../api/datasets';

export default function useDatasetDescription(slug, revision, enabled) {
  const query = useQuery({
    queryKey: ['dataset-description', slug, revision],
    queryFn: ({ signal }) => getDatasetDescription(slug, revision, { signal }),
    enabled: Boolean(enabled && slug && revision),
  });
  return {
    data: query.data?.datasetSlug === slug && query.data?.datasetRevision === revision
      ? query.data
      : null,
    loading: query.isPending && query.isFetching,
    error: query.error?.message || null,
    reload: query.refetch,
  };
}
