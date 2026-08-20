import { useCallback, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@shared/rbac';
import type { SessionUser } from '@shared/types';
import { ApiError, api } from '@/lib/api';
import { AuthContext, type AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: SessionUser }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: SessionUser }>('/auth/login', input),
    onSuccess: (data) => queryClient.setQueryData(['session'], data.user),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.setQueryData(['session'], null);
      queryClient.clear();
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const user = session.data ?? null;
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: session.isLoading,
      login,
      logout,
      can: (permission: Permission) => user?.permissions.includes(permission) ?? false,
    }),
    [user, session.isLoading, login, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
