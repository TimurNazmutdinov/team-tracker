import { buildApp } from './app';
import { loadEnv, readConfig } from './config';
import { openDatabase } from './db';
import { acquireLock } from './lock';
import { countAccounts } from './auth';
import { BackupService } from './backups/service';
import { BACKUP_DIR_KEY, getSetting } from './settings';
import { readFileSync } from 'node:fs';

// Запуск сервера: интерфейс и API на одном адресе. Настройки — .env и переменные окружения
// (config.ts). Без DATABASE_URL работает встроенная база PGlite в DATA_DIR (ADR-011).

loadEnv();
const config = readConfig();

// Встроенную базу нельзя открывать двумя процессами сразу
let release = () => {};
if (!config.databaseUrl) {
  try {
    release = acquireLock(config.dataDir);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

const connection = await openDatabase(config);
// Папка копий: выбранная в настройках важнее BACKUP_DIR из .env
const backupDir = (await getSetting(connection.db, BACKUP_DIR_KEY)) ?? config.backupDir;
const appVersion = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
const backups = new BackupService({
  connection,
  dir: backupDir,
  appVersion,
  keepDaily: config.backupKeepDaily,
  keepMonthly: config.backupKeepMonthly,
  time: config.backupTime,
  auto: config.backupAuto,
  onLog: (line) => console.log(`[копия] ${line}`),
});

const app = buildApp({
  db: connection.db,
  backups,
  dataDir: config.dataDir,
  staticDir: config.staticDir,
  allowRegistration: config.allowRegistration,
  secureCookies: config.secureCookies,
  logger: true,
});

await app.listen({ port: config.port, host: config.host });
backups.start();
console.log(
  `Трекер запущен: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}` +
    (config.host === '0.0.0.0' ? ' (доступен по локальной сети)' : ''),
);
if ((await countAccounts(connection.db)) === 0) {
  console.log('Учётных записей нет. Создайте администратора: npm run admin:create');
}

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  backups.stop();
  void app
    .close()
    .then(() => connection.close())
    .finally(() => {
      release();
      process.exit(0);
    });
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(signal, shutdown);
