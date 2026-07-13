import { QueryClient } from '@tanstack/react-query';

// Estado de servidor. refetch-on-mount (FR-009b/011); sin reintentos automáticos agresivos.
// La purga total (queryClient.clear()) la dispara el SessionProvider en logout/cambio de rol (FR-005/029).
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: 'always', refetchOnWindowFocus: false },
    },
  });
}
