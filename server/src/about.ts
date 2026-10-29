import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import type { BackupStatus } from '../../src/domain/backups';
import type { Config } from './config';
import type { LogEntry, LogStore } from './logs';

// Сведения о программе и диагностика (часть 2 доработок, ADR-015).

export interface AboutInfo {
  version: string;
  /** Дата сборки интерфейса (по файлу index.html в каталоге сборки); null, если сборки нет. */
  buildDate: string | null;
  node: string;
  platform: string;
  database: 'pglite' | 'postgres';
  startedAt: string;
}

export function readVersion(): string {
  const file = new URL('../../package.json', import.meta.url);
  return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
}

export function buildDateOf(staticDir: string): string | null {
  try {
    return statSync(join(staticDir, 'index.html')).mtime.toISOString();
  } catch {
    return null;
  }
}

export function aboutInfo(config: Config, version = readVersion()): AboutInfo {
  return {
    version,
    buildDate: buildDateOf(config.staticDir),
    node: process.version,
    platform: process.platform,
    database: config.databaseUrl ? 'postgres' : 'pglite',
    startedAt: new Date().toISOString(),
  };
}

/** Настройки для диагностики: без паролей и строки подключения к базе. */
export function publicSettings(config: Config): Record<string, string | number | boolean> {
  return {
    database: config.databaseUrl ? 'postgres' : 'pglite',
    dataDir: config.dataDir,
    host: config.host,
    port: config.port,
    allowRegistration: config.allowRegistration,
    secureCookies: config.secureCookies,
    staticDir: config.staticDir,
    backupDir: config.backupDir,
    backupAuto: config.backupAuto,
    backupTime: config.backupTime,
    backupKeepDaily: config.backupKeepDaily,
    backupKeepMonthly: config.backupKeepMonthly,
  };
}

/** Архив диагностики: версия, настройки, состояние копий и журнал ошибок; данных задач в нём нет. */
export function buildDiagnostics(input: {
  about: AboutInfo;
  settings: Record<string, string | number | boolean>;
  backups: BackupStatus | null;
  logs: LogStore | null;
  now?: Date;
}): Uint8Array {
  const entries: LogEntry[] = input.logs?.recent(500) ?? [];
  const log = entries
    .map((e) =>
      [
        `${e.at} [${e.source}] ${e.message}`,
        e.where ? `  где: ${e.where}` : '',
        e.stack ? `  ${e.stack.split('\n').join('\n  ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');
  const json = (value: unknown) => strToU8(`${JSON.stringify(value, null, 2)}\n`);
  return zipSync({
    'version.json': json({ ...input.about, collectedAt: (input.now ?? new Date()).toISOString() }),
    'settings.json': json(input.settings),
    'backups.json': json(input.backups),
    'errors.log': strToU8(log === '' ? 'Записей нет.\n' : `${log}\n`),
  });
}
