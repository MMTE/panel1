import { trpc } from '../api/trpc';
import { useAuth } from './useAuth';

export function useUsers() {
  const { isDemoMode } = useAuth();
  
  // Mock user data for demo
  const mockUsers = [
    {
      id: '1',
      email: 'john.doe@example.com',
      first_name: 'John',
      last_name: 'Doe',
      role: 'CLIENT',
      is_active: true,
      created_at: '2024-01-15T10:30:00Z',
      last_login: '2024-01-20T14:22:00Z'
    },
    {
      id: '2',
      email: 'jane.smith@acme.com',
      first_name: 'Jane',
      last_name: 'Smith',
      role: 'RESELLER',
      is_active: true,
      created_at: '2024-01-10T09:15:00Z',
      last_login: '2024-01-21T11:45:00Z'
    },
    {
      id: '3',
      email: 'admin@panel1.dev',
      first_name: 'Admin',
      last_name: 'User',
      role: 'ADMIN',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      last_login: '2024-01-21T16:30:00Z'
    },
    {
      id: '4',
      email: 'inactive@example.com',
      first_name: 'Inactive',
      last_name: 'User',
      role: 'CLIENT',
      is_active: false,
      created_at: '2024-01-05T12:00:00Z',
      last_login: '2024-01-18T08:20:00Z'
    }
  ];

  const {
    data: usersData,
    isLoading,
    error,
    refetch
  } = trpc.users.getAll.useQuery(
    { limit: 100, offset: 0 },
    { enabled: !isDemoMode }
  );

  return {
    users: isDemoMode ? mockUsers : (usersData?.users || []),
    totalUsers: isDemoMode ? mockUsers.length : (usersData?.total || 0),
    loading: isLoading,
    error: error?.message,
    refetch
  };
}