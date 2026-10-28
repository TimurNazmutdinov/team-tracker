import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { TrackerStorage } from '../storage';
import { useNotices } from '../state/notices';
import { AuthGate } from './AuthGate';
import { SERVER_MODE } from './create-storage';
import { routes } from './routes';
import { StorageProvider } from './storage-context';

// В демо данные меняются только этим же окном, поэтому кэш не устаревает. С сервером их правят и
// другие люди: данные считаются свежими 15 секунд и перечитываются при возвращении на вкладку.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: SERVER_MODE
      ? { retry: false, staleTime: 15_000, refetchOnWindowFocus: true }
      : { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
  },
});

// Базовый путь нужен для GitHub Pages (https://…github.io/team-tracker/), см. ADR-005.
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

export function App({ storage }: { storage: TrackerStorage }) {
  // Если при запуске сохранённые данные были сброшены (другая версия seed), говорим об этом.
  useEffect(() => {
    const notice = storage.takeStartupNotice?.();
    if (notice) useNotices.getState().push(notice);
  }, [storage]);

  return (
    <StorageProvider storage={storage}>
      <QueryClientProvider client={queryClient}>
        {SERVER_MODE ? (
          <AuthGate>
            <RouterProvider router={router} />
          </AuthGate>
        ) : (
          <RouterProvider router={router} />
        )}
      </QueryClientProvider>
    </StorageProvider>
  );
}
