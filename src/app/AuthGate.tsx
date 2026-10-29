import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { ChangePasswordPage } from '../modules/auth/ChangePasswordPage';
import { LoginPage } from '../modules/auth/LoginPage';
import { usePalette } from '../state/palette';
import { useSession } from '../state/session';
import { Loading } from '../ui/Loading';
import { authClient } from './auth-client';

/** В режиме сервера пускает в приложение только вошедших (ADR-010). */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const mustChange = useSession((s) => s.account?.mustChangePassword ?? false);
  const palette = useSession((s) => s.account?.palette);
  const setPalette = usePalette((s) => s.set);
  const set = useSession((s) => s.set);
  const queryClient = useQueryClient();

  useEffect(() => {
    authClient.me().then(set, () => set(null));
  }, [set]);

  // Гамма из профиля действует на любом компьютере: после входа берём её с сервера
  useEffect(() => {
    if (palette) setPalette(palette);
  }, [palette, setPalette]);

  // Данные прошлого пользователя не должны показываться следующему
  useEffect(() => {
    if (status === 'signedOut') queryClient.clear();
  }, [status, queryClient]);

  if (status === 'unknown') return <Loading />;
  if (status === 'signedOut') return <LoginPage />;
  if (mustChange) return <ChangePasswordPage />;
  return <>{children}</>;
}
