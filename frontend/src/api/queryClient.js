import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        return failureCount < 1
          && error instanceof ApiError
          && ['network', 'timeout', 'server'].includes(error.kind);
      },
    },
  },
});
