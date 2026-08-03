import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getProjectionAuditMetadata,
  getProjectionAuditRows,
} from '../api/analysisRuns';

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

export default function useProjectionAudit(
  runKey,
  artifactKey,
  projectionKind,
  request,
  enabled = true,
) {
  const active = Boolean(
    enabled && runKey && artifactKey && projectionKind && request?.projectionKey,
  );
  const identity = useMemo(() => identityRequest(request), [request]);
  const metadataQuery = useQuery({
    queryKey: ['projection-audit-metadata', runKey, artifactKey, projectionKind, identity],
    queryFn: ({ signal }) => getProjectionAuditMetadata(
      runKey,
      artifactKey,
      projectionKind,
      identity,
      { signal },
    ),
    enabled: active,
    staleTime: Infinity,
    retry: 1,
  });
  const artifactReady = active && metadataQuery.data?.artifact?.status === 'ready';
  const rowsQuery = useQuery({
    queryKey: ['projection-audit-rows', runKey, artifactKey, projectionKind, request],
    queryFn: ({ signal }) => getProjectionAuditRows(
      runKey,
      artifactKey,
      projectionKind,
      request,
      { signal },
    ),
    enabled: artifactReady,
    staleTime: 5 * 60_000,
    placeholderData: previous => previous,
    retry: 1,
  });
  const data = metadataQuery.data && rowsQuery.data
    ? {
        ...metadataQuery.data,
        ...rowsQuery.data,
      }
    : null;
  const error = metadataQuery.error || rowsQuery.error;
  const fetching = metadataQuery.isFetching || rowsQuery.isFetching;

  return {
    data,
    loading: metadataQuery.isLoading || (artifactReady && rowsQuery.isLoading),
    fetching,
    error: error?.message || null,
    reload: async () => {
      await metadataQuery.refetch();
      await rowsQuery.refetch();
    },
  };
}
