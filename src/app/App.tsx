import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { TrackerStorage } from '../storage';
import { routes } from './routes';
import { StorageProvider } from './storage-context';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
});

// Базовый путь нужен для GitHub Pages (https://…github.io/team-tracker/), см. ADR-005.
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

export function App({ storage }: { storage: TrackerStorage }) {
  return (
    <StorageProvider storage={storage}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StorageProvider>
  );
}
