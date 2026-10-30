import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { SERVER_MODE } from '../app/create-storage';
import { authClient } from '../app/auth-client';
import { useSession } from './session';

/** Нужен ли мастер первого запуска: только администратору при работе с сервером, пока он не пройден. */
export function useOnboarding() {
  const account = useSession((s) => s.account);
  const client = useQueryClient();
  const isAdmin = SERVER_MODE && account?.role === 'admin' && !account.mustChangePassword;
  const query = useQuery({
    queryKey: ['onboarding'],
    queryFn: () => authClient.onboarding(),
    enabled: isAdmin,
  });
  const set = useCallback(
    async (done: boolean) => {
      client.setQueryData(['onboarding'], { done });
      try {
        await authClient.setOnboarding(done);
      } finally {
        await client.invalidateQueries({ queryKey: ['onboarding'] });
      }
    },
    [client],
  );
  return { isAdmin, show: isAdmin && query.data?.done === false, set };
}
