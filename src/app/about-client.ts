import { zipSync, strToU8 } from 'fflate';
import { SERVER_MODE } from './create-storage';
import { API_BASE, call } from './auth-client';
import { errorRing, type ClientError } from './error-log';
import { StorageError } from '../storage';

// Сведения о программе, журнал ошибок и диагностика (ADR-015).

export interface ServerAbout {
  version: string;
  buildDate: string | null;
  node: string;
  platform: string;
  database: 'pglite' | 'postgres';
  startedAt: string;
}

export interface LogRecord {
  at: string;
  source: 'server' | 'client';
  message: string;
  stack?: string;
  where?: string;
}

export const clientBuild = { version: __APP_VERSION__, buildDate: __BUILD_DATE__ };

export const aboutClient = {
  about: () => call<ServerAbout | null>('GET', '/about'),
  log: () => call<LogRecord[]>('GET', '/admin/log?limit=20'),
  /** Отправка ошибки клиента в журнал сервера; сбой отправки игнорируется. */
  sendError(entry: ClientError): void {
    void fetch(`${API_BASE}/client-errors`, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: entry.message, stack: entry.stack, where: entry.where }),
    }).catch(() => undefined);
  },
};

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Диагностика: с сервера — архив сервера, в демо-режиме — собирается в браузере. */
export async function downloadDiagnostics(): Promise<void> {
  if (SERVER_MODE) {
    const res = await fetch(`${API_BASE}/admin/diagnostics`, { credentials: 'same-origin' });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new StorageError(
        'write_failed',
        json?.error?.message ?? 'Не удалось собрать диагностику',
      );
    }
    const day = new Date().toISOString().slice(0, 10);
    save(await res.blob(), `diagnostics-${day}.zip`);
    return;
  }
  const json = (value: unknown) => strToU8(`${JSON.stringify(value, null, 2)}\n`);
  const errors = errorRing.list();
  const zip = zipSync({
    'version.json': json({
      ...clientBuild,
      mode: 'demo',
      userAgent: navigator.userAgent,
      language: navigator.language,
      collectedAt: new Date().toISOString(),
    }),
    'errors.log': strToU8(
      errors.length === 0
        ? 'Записей нет.\n'
        : `${errors
            .map((e) => `${e.at} [client] ${e.message}${e.where ? `\n  где: ${e.where}` : ''}`)
            .join('\n')}\n`,
    ),
  });
  save(
    new Blob([new Uint8Array(zip)], { type: 'application/zip' }),
    `diagnostics-${new Date().toISOString().slice(0, 10)}.zip`,
  );
}
