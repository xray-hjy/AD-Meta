import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getChart } from '../api/datasets';

export default function useChartData(slug, chartType, enabled = true) {
  const query = useQuery({
    queryKey: ['chart', slug, chartType],
    queryFn: ({ signal }) => getChart(slug, chartType, { signal }),
    enabled: Boolean(enabled && slug && chartType),
    placeholderData: keepPreviousData,
  });
  return {
    data: query.data || null,
    loading: Boolean(enabled && slug && chartType) && query.isPending,
    fetching: query.isFetching,
    error: query.error?.message || null,
    requestKey: slug && chartType ? `${slug}:${chartType}` : null,
    reload: query.refetch,
  };
}
