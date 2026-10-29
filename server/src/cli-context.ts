import { readFileSync } from 'node:fs';
import { BackupService } from './backups/service';
import { loadEnv, readConfig, type Config } from './config';
import { openDatabase, type Connection } from './db';
import { acquireLock } from './lock';
import { BACKUP_DIR_KEY, getSetting } from './settings';

// Общая часть команд `backup` и `restore`: настройки, база (встроенную нельзя открывать при
// запущенном трекере) и сервис копий с папкой, выбранной в настройках.

export interface CliContext {
  config: Config;
  connection: Connection;
  backups: BackupService;
  release: () => void;
}

export async function openCli(): Promise<CliContext> {
  loadEnv();
  const config = readConfig();
  const release = config.databaseUrl ? () => {} : acquireLock(config.dataDir);
  try {
    const connection = await openDatabase(config);
    const dir = (await getSetting(connection.db, BACKUP_DIR_KEY)) ?? config.backupDir;
    const appVersion = (
      JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
        version: string;
      }
    ).version;
    const backups = new BackupService({
      connection,
      dir,
      appVersion,
      keepDaily: config.backupKeepDaily,
      keepMonthly: config.backupKeepMonthly,
      time: config.backupTime,
      auto: false,
    });
    return { config, connection, backups, release };
  } catch (e) {
    release();
    throw e;
  }
}

export function explain(e: unknown): string {
  if (e instanceof Error && e.message.includes('уже запущен')) {
    return `${e.message}\nПока трекер работает, копию можно сделать в браузере: «Настройки → Резервные копии → Сделать копию сейчас».`;
  }
  return e instanceof Error ? e.message : String(e);
}
