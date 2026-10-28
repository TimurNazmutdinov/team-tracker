import { StorageError } from '../storage';
import type { Account } from '../state/session';

// Запросы входа к серверу (ADR-010). Данные трекера идут через TrackerStorage, а вход — отдельно.

const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new StorageError('network', 'Нет связи с сервером');
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string; details?: string[] };
  } | null;
  if (!res.ok) {
    throw new StorageError(
      res.status === 401 ? 'unauthorized' : 'invalid_data',
      json?.error?.message ?? 'Ошибка сервера',
      json?.error?.details ?? [],
    );
  }
  return json as T;
}

export const authClient = {
  me: () => call<Account>('GET', '/auth/me'),
  login: (email: string, password: string) =>
    call<Account>('POST', '/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    call<Account>('POST', '/auth/register', { email, password, name }),
  logout: () => call<undefined>('POST', '/auth/logout'),
  users: () =>
    call<{ id: string; name: string; email: string | null; role: Account['role'] }[]>(
      'GET',
      '/users',
    ),
  setRole: (id: string, role: Account['role']) =>
    call<undefined>('PATCH', `/users/${id}`, { role }),
};
