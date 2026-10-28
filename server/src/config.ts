import { resolve } from 'node:path';

// Настройки из переменных окружения (см. .env.example). Файл .env подхватывается сам; значения,
// уже заданные в окружении, он не перекрывает.

export interface Config {
  /** PostgreSQL; не задан — встроенная база PGlite в каталоге dataDir (ADR-011). */
  databaseUrl: string | undefined;
  dataDir: string;
  host: string;
  port: number;
  allowRegistration: boolean;
  secureCookies: boolean;
  staticDir: string;
  backupDir: string;
  backupKeep: number;
}

export function loadEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // файла .env нет — используется окружение и значения по умолчанию
  }
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name}: ожидается положительное целое`);
  return n;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = positiveInt(env.PORT, 3000, 'PORT');
  if (port > 65535) throw new Error('PORT: не больше 65535');
  const url = env.DATABASE_URL?.trim();
  return {
    databaseUrl: url ? url : undefined,
    dataDir: resolve(env.DATA_DIR?.trim() || './local-data'),
    // По умолчанию только этот компьютер; 0.0.0.0 открывает доступ по локальной сети
    host: env.HOST?.trim() || '127.0.0.1',
    port,
    allowRegistration: env.ALLOW_REGISTRATION === 'true',
    secureCookies: env.COOKIE_SECURE === 'true',
    staticDir: env.STATIC_DIR?.trim() || 'dist',
    backupDir: resolve(env.BACKUP_DIR?.trim() || './backups'),
    backupKeep: positiveInt(env.BACKUP_KEEP, 14, 'BACKUP_KEEP'),
  };
}
