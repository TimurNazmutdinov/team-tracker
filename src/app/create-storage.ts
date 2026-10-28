import seed from '../../data/seed.json';
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

export function createStorage(): Promise<TrackerStorage> {
  return SeedLocalStorage.open(seed, kv);
}

/** Для экрана ошибки запуска: удалить повреждённые сохранённые данные. */
export function clearSavedData(): void {
  clearStoredData(kv);
}
