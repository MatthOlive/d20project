import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2 || (typeof navigator !== "undefined" && !navigator.onLine)) return false;
  const value = error as { status?: number; code?: string; message?: string } | null;
  if (value?.status && value.status >= 400 && value.status < 500) return false;
  if (value?.code && /^(22|23|28|42|PGRST)/.test(value.code)) return false;
  return true;
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(4_000, 500 * 2 ** attempt),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
