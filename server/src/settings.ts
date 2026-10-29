import { eq } from 'drizzle-orm';
import { schema, type Db } from './db';

/** Настройки, которые администратор задаёт в интерфейсе; они важнее значений из .env. */
export const BACKUP_DIR_KEY = 'backup_dir';

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return rows[0]?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}
