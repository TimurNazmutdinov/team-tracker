import { buildApp } from './app';
import { loadEnv, readConfig } from './config';
import { openDatabase } from './db';
import { acquireLock } from './lock';
import { countAccounts } from './auth';
import { BackupService } from './backups/service';
import { BACKUP_DIR_KEY, getSetting } from './settings';
import { join } from 'node:path';
import { aboutInfo, publicSettings, readVersion } from './about';
import { LogStore } from './logs';

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
const appVersion = readVersion();
const logs = new LogStore(join(config.dataDir, 'logs'));
const backups = new BackupService({
  connection,
  dir: backupDir,
  appVersion,
  keepDaily: config.backupKeepDaily,
  keepMonthly: config.backupKeepMonthly,
  time: config.backupTime,
  auto: config.backupAuto,
  onLog: (line) => {
    console.log(`[копия] ${line}`);
    if (line.includes('| ОШИБКА |')) logs.write('server', { message: `копия не создана: ${line}` });
  },
});

const app = buildApp({
  db: connection.db,
  backups,
  dataDir: config.dataDir,
  staticDir: config.staticDir,
  allowRegistration: config.allowRegistration,
  secureCookies: config.secureCookies,
  logs,
  about: aboutInfo(config, appVersion),
  settings: publicSettings(config),
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

// Необработанные ошибки пишутся в журнал; после неперехваченного исключения процесс завершается
process.on('unhandledRejection', (reason) => {
  const e = reason instanceof Error ? reason : new Error(String(reason));
  logs.write('server', { message: `unhandledRejection: ${e.message}`, stack: e.stack });
  console.error(e);
});
process.on('uncaughtException', (e) => {
  logs.write('server', { message: `uncaughtException: ${e.message}`, stack: e.stack });
  console.error(e);
  process.exit(1);
});

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
