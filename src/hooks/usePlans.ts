import { trpc } from '../api/trpc';

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  interval: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'DAILY';
  isActive: boolean;
  features: any | null;
  createdAt: Date;
  updatedAt: Date;
}

export function usePlans() {
  const { data: plans = [], isLoading: loading, error, refetch } = trpc.plans.getAll.useQuery({
    activeOnly: true,
  });

  return {
    plans,
    loading,
    error: error?.message || null,
    refetch,
  };
}