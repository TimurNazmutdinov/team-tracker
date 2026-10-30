// Журнал ошибок клиента (часть 2 доработок, ADR-015): последние ошибки хранятся в браузере (для
// диагностики в демо-режиме), а с сервером ещё и отправляются на него в DATA_DIR/logs/client.log.

/** Минимальное хранилище ключ-значение (подходит localStorage). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ClientError {
  at: string;
  message: string;
  stack?: string | undefined;
  where?: string | undefined;
}

const KEY = 'team-tracker:errors';
export const RING_SIZE = 50;

/** Приводит что угодно, что можно бросить, к сообщению и стеку. */
export function describeError(error: unknown): { message: string; stack?: string | undefined } {
  if (error instanceof Error)
    return { message: `${error.name}: ${error.message}`, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

/** Последние ошибки в хранилище ключ-значение; хранилище может быть недоступно — тогда в памяти. */
export class ErrorRing {
  private memory: ClientError[] = [];

  constructor(private readonly store: KeyValueStore | null) {}

  list(): ClientError[] {
    if (!this.store) return [...this.memory];
    try {
      const raw = this.store.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as ClientError[]) : [];
    } catch {
      return [...this.memory];
    }
  }

  add(entry: ClientError): void {
    const next = [...this.list(), entry].slice(-RING_SIZE);
    this.memory = next;
    try {
      this.store?.setItem(KEY, JSON.stringify(next));
    } catch {
      // хранилище переполнено или закрыто — остаётся копия в памяти
    }
  }

  clear(): void {
    this.memory = [];
    try {
      this.store?.removeItem(KEY);
    } catch {
      // нечего очищать
    }
  }
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const errorRing = new ErrorRing(browserStore());

let sendToServer: ((entry: ClientError) => void) | null = null;
const recent = new Map<string, number>();
/** Одинаковую ошибку чаще, чем раз в 10 секунд, не повторяем (цикл перерисовки не забьёт журнал). */
const REPEAT_MS = 10_000;

export function reportError(error: unknown, where?: string, now = Date.now()): void {
  const { message, stack } = describeError(error);
  const last = recent.get(message);
  if (last !== undefined && now - last < REPEAT_MS) return;
  recent.set(message, now);
  const entry: ClientError = {
    at: new Date(now).toISOString(),
    message,
    stack,
    where: where ?? (typeof window === 'undefined' ? undefined : window.location.pathname),
  };
  errorRing.add(entry);
  try {
    sendToServer?.(entry);
  } catch {
    // отправка не должна сама становиться ошибкой
  }
}

/** Подписка на необработанные ошибки окна; с `send` ошибки уходят и на сервер. */
export function installErrorReporting(send: ((entry: ClientError) => void) | null): void {
  sendToServer = send;
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
