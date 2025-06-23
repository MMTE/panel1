import { createTRPCReact, httpBatchLink, loggerLink } from '@trpc/react-query';
import { inferRouterOutputs, inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../../../apps/api/src/routers/index.js';
import { QueryClient } from '@tanstack/react-query';

export const trpc = createTRPCReact<AppRouter>();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
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
        process.env.NODE_ENV === 'development' || 
        (opts.direction === 'down' && opts.result instanceof Error),
    }),
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/trpc`,
      async headers() {
        const token = getAuthToken();
        
        return {
          Authorization: token ? `Bearer ${token}` : '',
        };
      },
    }),
  ],
});

// Types for inputs and outputs of the router
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;