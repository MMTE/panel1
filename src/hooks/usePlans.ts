import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'DAILY';
  is_active: boolean;
  features: any | null;
  created_at: string;
  updated_at: string;
}

export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) {
        setError(error.message);
      } else {
        setPlans(data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return {
    plans,
    loading,
    error,
    refetch: fetchPlans,
  };
}