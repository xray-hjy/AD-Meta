import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        return failureCount < 1 && ['network', 'timeout', 'server'].includes(error?.kind);
      },
    },
  },
});
