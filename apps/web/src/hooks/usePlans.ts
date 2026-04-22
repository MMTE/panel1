import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { catalogApi, type LegacyPlanRow } from '../api/catalogApi';

export type Plan = LegacyPlanRow;

export function usePlans() {
  const { user } = useAuth();
  const { data: plans = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: ['catalog', 'legacy-plans'],
    queryFn: () => catalogApi.listLegacyPlans(true),
    enabled: !!user,
  });

  return {
    plans,
    loading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}