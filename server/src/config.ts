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
  /** Включено ли автоматическое копирование (ежедневно и при запуске). */
  backupAuto: boolean;
  /** Время ежедневной копии по местному времени, ЧЧ:ММ. */
  backupTime: string;
  backupKeepDaily: number;
  backupKeepMonthly: number;
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

/** Время ЧЧ:ММ; по умолчанию 18:00. */
function backupTime(value: string | undefined): string {
  const v = value?.trim() || '18:00';
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    throw new Error('BACKUP_TIME: ожидается время ЧЧ:ММ, например 18:00');
  }
  return `${m[1]?.padStart(2, '0')}:${m[2]}`;
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
    backupAuto: env.BACKUP_AUTO !== 'false',
    backupTime: backupTime(env.BACKUP_TIME),
    backupKeepDaily: positiveInt(env.BACKUP_KEEP_DAILY, 30, 'BACKUP_KEEP_DAILY'),
    backupKeepMonthly: positiveInt(env.BACKUP_KEEP_MONTHLY, 12, 'BACKUP_KEEP_MONTHLY'),
  };
}
