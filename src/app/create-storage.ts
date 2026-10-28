import seed from '../../data/seed.json';
import { ApiStorage } from '../storage/api';
import { useSession } from '../state/session';
import { SeedLocalStorage, clearStoredData, type KeyValueStore } from '../storage/seed-local';
import type { TrackerStorage } from '../storage';

// Корень приложения: единственное место, где подключается реализация хранения (ADR-001).

/** localStorage, а если браузер его не даёт (приватный режим), — хранилище в памяти. */
function keyValueStore(): KeyValueStore {
  try {
    const probe = '__team-tracker-probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

const kv = keyValueStore();

/** Режим сервера (ADR-010): данные и вход идут через API; без него — демо в браузере. */
export const SERVER_MODE = import.meta.env.VITE_STORAGE === 'api';

export function createStorage(): Promise<TrackerStorage> {
  if (SERVER_MODE) {
    const base = import.meta.env.VITE_API_URL ?? '/api';
    return Promise.resolve(new ApiStorage(base, () => useSession.getState().set(null)));
  }
  return SeedLocalStorage.open(seed, kv);
}

/** Для экрана ошибки запуска: удалить повреждённые сохранённые данные. */
export function clearSavedData(): void {
  clearStoredData(kv);
}
