import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getProjectionAuditOptions } from '../api/analysisRuns';
import useDebouncedValue from './useDebouncedValue';

const OPTION_FIELDS = ['feature', 'sample', 'status', 'reason'];
const OPTION_LIMITS = {
  feature: 50,
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
  const debouncedSearches = useDebouncedValue(searches);
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
        debouncedSearches[field] || '',
      ],
      queryFn: ({ signal }) => getProjectionAuditOptions(
        runKey,
        artifactKey,
        projectionKind,
        field,
        identity,
        {
          query: debouncedSearches[field] || '',
          // The unopened feature selector is a compact recommendation list,
          // not a disguised copy of every source feature.
          limit: field === 'feature' && !(debouncedSearches[field] || '').trim()
            ? 30
            : OPTION_LIMITS[field],
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
    mode: queries[index]?.data?.mode || 'options',
    total: queries[index]?.data?.total || 0,
    hasMore: queries[index]?.data?.hasMore || false,
    query: queries[index]?.data?.query || '',
    initialOrder: queries[index]?.data?.initialOrder || '',
    sourceFeatureCount: queries[index]?.data?.sourceFeatureCount ?? null,
    loading: queries[index]?.isLoading || false,
    fetching: queries[index]?.isFetching || false,
    // Keep the raw input separate from the debounced request. The selector can
    // then avoid presenting a previous query's values as current results.
    searchPending: String(searches?.[field] || '').trim()
      !== String(debouncedSearches?.[field] || '').trim(),
    error: queries[index]?.error?.message || null,
  }]));
}
