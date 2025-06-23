import { trpc } from '../api/trpc';

export function usePlans() {
  const { 
    data: plansData, 
    isLoading: loading, 
    error,
    refetch
  } = trpc.plans.getAll.useQuery({ activeOnly: true });

  return {
    plans: plansData || [],
    loading,
    error: error?.message,
    refetch,
  };
}