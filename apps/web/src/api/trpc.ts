import { createTRPCReact, httpBatchLink, loggerLink } from '@trpc/react-query';
import { inferRouterOutputs, inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../../../api/src/routers/index.js';
import { QueryClient } from '@tanstack/react-query';

export const trpc = createTRPCReact<AppRouter>();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on 404s or auth errors
        if (error?.data?.code === 'NOT_FOUND' || 
            error?.data?.code === 'UNAUTHORIZED' || 
            error?.data?.code === 'FORBIDDEN') {
          return false;
        }
        // Only retry 3 times for other errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false, // Don't retry mutations by default
      onError: (error: any) => {
        console.error('Mutation error:', error);
      }
    },
  },
});

// Get token from localStorage
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

export const trpcClient = trpc.createClient({
  links: [
    loggerLink({
      enabled: (opts) => 
        import.meta.env.DEV || 
        (opts.direction === 'down' && opts.result instanceof Error),
    }),
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/trpc`,
      async headers() {
        const token = getAuthToken();
        return {
          Authorization: token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        };
      },
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include'
        });
      }
    }),
  ],
});

// Types for inputs and outputs of the router
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;