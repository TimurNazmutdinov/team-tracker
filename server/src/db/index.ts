import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
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

/** Встроенная база: в память (dir не задан) или в каталог на диске. */
export async function openPglite(dir?: string): Promise<Connection> {
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}
