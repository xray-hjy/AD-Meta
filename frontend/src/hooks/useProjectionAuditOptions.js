import { useDeferredValue, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getProjectionAuditOptions } from '../api/analysisRuns';

const OPTION_FIELDS = ['feature', 'sample', 'status', 'reason'];
const OPTION_LIMITS = {
  feature: 100,
  sample: 200,
  status: 50,
  reason: 100,
};

function identityRequest(request) {
  return {
    ...request,
    filters: {},
    sortBy: '',
    sortDirection: 'asc',
    query: '',
    limit: 100,
    offset: 0,
  };
}

export default function useProjectionAuditOptions(
  runKey,
  artifactKey,
  projectionKind,
  request,
  searches,
  enabledFields,
  enabled = true,
) {
  const identity = useMemo(() => identityRequest(request), [request]);
  const deferredSearches = useDeferredValue(searches);
  const active = Boolean(
    enabled && runKey && artifactKey && projectionKind && request?.projectionKey,
  );
  const queries = useQueries({
    queries: OPTION_FIELDS.map(field => ({
      queryKey: [
        'projection-audit-options',
        runKey,
        artifactKey,
        projectionKind,
        identity,
        field,
        deferredSearches[field] || '',
      ],
      queryFn: ({ signal }) => getProjectionAuditOptions(
        runKey,
        artifactKey,
        projectionKind,
        field,
        identity,
        {
          query: deferredSearches[field] || '',
          limit: OPTION_LIMITS[field],
          signal,
        },
      ),
      enabled: active && enabledFields.includes(field),
      staleTime: Infinity,
      placeholderData: previous => previous,
      retry: 1,
    })),
  });

  return Object.fromEntries(OPTION_FIELDS.map((field, index) => [field, {
    items: queries[index]?.data?.items || [],
    loading: queries[index]?.isLoading || false,
    fetching: queries[index]?.isFetching || false,
    error: queries[index]?.error?.message || null,
  }]));
}
