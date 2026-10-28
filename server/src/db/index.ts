import { fileURLToPath } from 'node:url';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

export { schema };
/** Общий тип для обоих драйверов: PostgreSQL (pg) и встроенной базы PGlite для тестов и разработки. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Connection {
  db: Db;
  close(): Promise<void>;
}

const MIGRATIONS = fileURLToPath(new URL('../../migrations', import.meta.url));

export async function openPostgres(url: string): Promise<Connection> {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => pool.end() };
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
  return { db, close: () => client.close() };
}
