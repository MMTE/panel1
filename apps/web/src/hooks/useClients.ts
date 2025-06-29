import { trpc } from '../api/trpc';

export function useClients() {
  const {
    data: clientsData,
    isLoading,
    error,
    refetch
  } = trpc.clients.getAll.useQuery({ limit: 100, offset: 0 });

  return {
    clients: clientsData?.clients || [],
    totalClients: clientsData?.total || 0,
    loading: isLoading,
    error: error?.message,
    refetch
  };
}