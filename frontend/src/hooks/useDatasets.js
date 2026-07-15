import { useQuery } from '@tanstack/react-query';
import { listDatasets } from '../api/datasets';

export default function useDatasets() {
  const query = useQuery({
    queryKey: ['datasets'],
    queryFn: ({ signal }) => listDatasets({ signal }),
  });
  return {
    data: Array.isArray(query.data) ? query.data : [],
    loading: query.isPending,
    error: query.error?.message || null,
    reload: query.refetch,
  };
}
