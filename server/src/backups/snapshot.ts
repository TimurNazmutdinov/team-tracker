import { sql } from 'drizzle-orm';
import { DEFAULT_PALETTE, isPalette } from '../../../src/domain/palettes';
import { schema, type Db } from '../db';
import type { AccountRecord, Entities, Snapshot } from './types';

const t = schema;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Число применённых миграций; null, если узнать не удалось. Вызывается последним: сбой не мешает снимку. */
async function migrationCount(tx: Tx): Promise<number | null> {
  try {
    const r = await tx.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    const n = Number((r as unknown as { rows: { n?: unknown }[] }).rows[0]?.n ?? Number.NaN);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export interface TakenSnapshot extends Snapshot {
  /** Число применённых миграций базы (версия схемы); null, если узнать не удалось. */
  schemaVersion: number | null;
}

/**
 * Согласованный снимок: все таблицы читаются в одной транзакции только для чтения с уровнем
 * REPEATABLE READ, поэтому параллельные записи трекера не попадают в снимок наполовину и не
 * блокируются (ADR-012).
 */
export function takeSnapshot(db: Db): Promise<TakenSnapshot> {
  return db.transaction(
    async (tx) => {
      const [
        projects,
        people,
        members,
        templates,
        roles,
        absences,
        retroItems,
        sprints,
        issues,
        links,
        comments,
        history,
        users,
      ] = await Promise.all([
        tx.select().from(t.projects),
        tx.select().from(t.people),
        tx.select().from(t.projectMembers),
        tx.select().from(t.issueTemplates),
        tx.select().from(t.roles),
        tx.select().from(t.absences),
        tx.select().from(t.retroItems),
        tx.select().from(t.sprints),
        tx.select().from(t.issues),
        tx.select().from(t.links),
        tx.select().from(t.comments),
        tx.select().from(t.history),
        tx.select().from(t.users),
      ]);
      const schemaVersion = await migrationCount(tx);
      const data = {
        projects,
        people,
        members,
        templates,
        roles,
        absences,
        retroItems,
        sprints,
        issues,
        links,
        comments,
        history,
      } as Entities;
      const accounts: AccountRecord[] = users.map((u) => ({
        id: u.id,
        email: u.email,
        passwordHash: u.passwordHash,
        accessRole: u.accessRole,
        mustChangePassword: u.mustChangePassword,
        palette: isPalette(u.palette) ? u.palette : DEFAULT_PALETTE,
        createdAt: u.createdAt.toISOString(),
      }));
      return { data, accounts, schemaVersion };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
