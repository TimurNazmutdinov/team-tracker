import { fileURLToPath } from 'node:url';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import pg from 'pg';
import * as schema from './schema';

export { schema };
/** Общий тип для обоих драйверов: PostgreSQL (pg) и встроенной базы PGlite для тестов и разработки. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Копия базы «как есть» для комплекта: файл и его содержимое либо причина, почему её нет. */
export type NativeDump = { file: string; data: Uint8Array } | { skipped: string };

export interface Connection {
  db: Db;
  close(): Promise<void>;
  /** Копия средствами самой базы: архив папки данных PGlite или дамп pg_dump. */
  nativeDump(): Promise<NativeDump>;
}

/** Дамп PostgreSQL через pg_dump (если он установлен); пароль передаётся окружением, не аргументами. */
function pgDump(url: string): Promise<NativeDump> {
  const u = new URL(url);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
  return new Promise((resolve) => {
    const child = spawn('pg_dump', ['--no-owner', '--clean', '--if-exists'], { env });
    const out: Buffer[] = [];
    let err = '';
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => (err += String(c)));
    child.on('error', (e: NodeJS.ErrnoException) =>
      resolve({
        skipped:
          e.code === 'ENOENT'
            ? 'pg_dump не найден: полной копии базы нет (tracker.json содержит все данные трекера)'
            : `pg_dump: ${e.message}`,
      }),
    );
    child.on('close', (code) =>
      resolve(
        code === 0
          ? { file: 'database.sql.gz', data: gzipSync(Buffer.concat(out)) }
          : { skipped: `pg_dump завершился с кодом ${code}: ${err.trim().slice(0, 200)}` },
      ),
    );
  });
}

const MIGRATIONS = fileURLToPath(new URL('../../migrations', import.meta.url));

export async function openPostgres(url: string): Promise<Connection> {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => pool.end(), nativeDump: () => pgDump(url) };
}

/**
 * Встроенная база: в память (dir не задан) или в каталог на диске. PGlite нужен для тестов и
 * локальной разработки, поэтому подключается только здесь — в образе для сервера его нет.
 */
export async function openPglite(dir?: string): Promise<Connection> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return {
    db,
    close: () => client.close(),
    // PGlite отдаёт архив папки данных прямо из работающего процесса
    nativeDump: async () => {
      const archive = await client.dumpDataDir('gzip');
      return { file: 'database.pglite.tar.gz', data: new Uint8Array(await archive.arrayBuffer()) };
    },
  };
}

export interface DatabaseOptions {
  databaseUrl: string | undefined;
  dataDir: string;
}

/** PostgreSQL, если задан DATABASE_URL, иначе встроенная база в каталоге данных (ADR-011). */
export function openDatabase(options: DatabaseOptions): Promise<Connection> {
  return options.databaseUrl ? openPostgres(options.databaseUrl) : openPglite(options.dataDir);
}
