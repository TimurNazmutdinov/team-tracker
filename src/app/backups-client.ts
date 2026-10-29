import type { BackupStatus } from '../domain/backups';
import { StorageError } from '../storage';
import { API_BASE, call } from './auth-client';

// Запросы администратора к резервным копиям (ADR-012).

export interface FolderListing {
  path: string;
  parent: string | null;
  sep: string;
  roots: string[];
  folders: { name: string; path: string }[];
}

export const backupsClient = {
  status: () => call<BackupStatus>('GET', '/admin/backups'),
  runNow: () => call<BackupStatus>('POST', '/admin/backups'),
  folders: (path?: string) =>
    call<FolderListing>(
      'GET',
      `/admin/backups/folders${path === undefined ? '' : `?path=${encodeURIComponent(path)}`}`,
    ),
  setDir: (dir: string) => call<BackupStatus>('PUT', '/admin/backups/dir', { dir }),

  /** Скачивает tracker.xlsx из последней копии через браузер. */
  async downloadExcel(): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/backups/excel`, { credentials: 'same-origin' });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new StorageError('write_failed', json?.error?.message ?? 'Не удалось скачать Excel');
    }
    const name =
      /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
      'tracker.xlsx';
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = decodeURIComponent(name);
    link.click();
    URL.revokeObjectURL(url);
  },
};
