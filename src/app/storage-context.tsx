import { createContext, useContext, type ReactNode } from 'react';
import type { TrackerStorage } from '../storage';

const StorageContext = createContext<TrackerStorage | null>(null);

export function StorageProvider({
  storage,
  children,
}: {
  storage: TrackerStorage;
  children: ReactNode;
}) {
  return <StorageContext.Provider value={storage}>{children}</StorageContext.Provider>;
}

export function useStorage(): TrackerStorage {
  const storage = useContext(StorageContext);
  if (!storage) throw new Error('useStorage вызван вне StorageProvider');
  return storage;
}
