import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Changes } from '../../src/domain/changes';
import { parseDataset } from '../../src/domain/dataset';
import { violations, type Role } from '../../src/domain/permissions';
import type {
  Comment,
  Dataset,
  History,
  Issue,
  Link,
  Person,
  Project,
  Sprint,
} from '../../src/domain/schema';
import { schema, type Db } from './db';
import { HttpError } from './errors';

// Чтение и запись данных трекера. Запись — один набор изменений за раз: под блокировкой
// проверяются права, структура и целостность всего набора данных, затем изменения пишутся в
// одной транзакции.

const t = schema;

/** Версия набора данных на сервере не используется, но схема требует число. */
const DATASET_VERSION = 1;

export const readers = {
  projects: (db: Db) => db.select().from(t.projects) as unknown as Promise<Project[]>,
  people: (db: Db) => db.select().from(t.people) as Promise<Person[]>,
  sprints: (db: Db, projectId: string) =>
    db.select().from(t.sprints).where(eq(t.sprints.projectId, projectId)) as Promise<Sprint[]>,
  issues: (db: Db, projectId: string) =>
    db.select().from(t.issues).where(eq(t.issues.projectId, projectId)) as Promise<Issue[]>,
  async links(db: Db, projectId: string): Promise<Link[]> {
    const ids = db
      .select({ id: t.issues.id })
      .from(t.issues)
      .where(eq(t.issues.projectId, projectId));
    return (await db.select().from(t.links).where(inArray(t.links.fromId, ids))) as Link[];
  },
  comments: (db: Db, issueId: string) =>
    db.select().from(t.comments).where(eq(t.comments.issueId, issueId)) as Promise<Comment[]>,
  history: (db: Db, issueId: string) =>
    db.select().from(t.history).where(eq(t.history.issueId, issueId)) as Promise<History[]>,
  async projectHistory(db: Db, projectId: string): Promise<History[]> {
    const ids = db
      .select({ id: t.issues.id })
      .from(t.issues)
      .where(eq(t.issues.projectId, projectId));
    return (await db.select().from(t.history).where(inArray(t.history.issueId, ids))) as History[];
  },
};

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function loadDataset(db: Db | Tx): Promise<Dataset> {
  const [projects, people, sprints, issues, links, comments, history] = await Promise.all([
    db.select().from(t.projects),
    db.select().from(t.people),
    db.select().from(t.sprints),
    db.select().from(t.issues),
    db.select().from(t.links),
    db.select().from(t.comments),
    db.select().from(t.history),
  ]);
  return {
    version: DATASET_VERSION,
    projects,
    people,
    sprints,
    issues,
    links,
    comments,
    history,
  } as Dataset;
}

function upsert<T extends { id: string }>(target: T[], items: T[] | undefined): void {
  for (const item of items ?? []) {
    const i = target.findIndex((x) => x.id === item.id);
    if (i === -1) target.push(item);
    else target[i] = item;
  }
}

function append<T extends { id: string }>(name: string, target: T[], items: T[] | undefined) {
  for (const item of items ?? []) {
    if (target.some((x) => x.id === item.id)) {
      throw new HttpError(409, 'conflict', `${name}: запись ${item.id} уже существует`);
    }
    target.push(item);
  }
}

/** Набор данных после применения изменений (как в локальном хранилище). */
function applied(current: Dataset, changes: Changes): Dataset {
  const next = structuredClone(current);
  upsert(next.projects, changes.projects);
  upsert(next.people, changes.people);
  upsert(next.sprints, changes.sprints);
  upsert(next.issues, changes.issues);
  upsert(next.links, changes.links);
  const removed = new Set(changes.deleteLinkIds ?? []);
  next.links = next.links.filter((l) => !removed.has(l.id));
  append('comments', next.comments, changes.comments);
  append('history', next.history, changes.history);
  return next;
}

function isUniqueViolation(e: unknown): boolean {
  for (
    let cur: unknown = e;
    cur && typeof cur === 'object';
    cur = (cur as { cause?: unknown }).cause
  ) {
    if ((cur as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

/** Ключ блокировки, которая выстраивает записи в очередь (и регистрацию первого администратора). */
export const WRITE_LOCK = 4_242_001;

export async function lockWrites(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${WRITE_LOCK})`);
}

export async function commit(
  db: Db,
  user: { id: string; role: Role },
  changes: Changes,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await lockWrites(tx);
      const current = await loadDataset(tx);

      const denied = violations(user.role, user.id, current, changes);
      if (denied.length > 0) {
        throw new HttpError(403, 'forbidden', 'Недостаточно прав для этого изменения', denied);
      }

      const checked = parseDataset(applied(current, changes));
      if (!checked.ok) {
        throw new HttpError(422, 'invalid_data', 'Изменения не прошли проверку', checked.errors);
      }

      // Порядок учитывает внешние ключи.
      for (const p of changes.projects ?? []) {
        await tx.insert(t.projects).values(p).onConflictDoUpdate({ target: t.projects.id, set: p });
      }
      for (const p of changes.people ?? []) {
        await tx.insert(t.people).values(p).onConflictDoUpdate({ target: t.people.id, set: p });
      }
      for (const s of changes.sprints ?? []) {
        await tx.insert(t.sprints).values(s).onConflictDoUpdate({ target: t.sprints.id, set: s });
      }
      for (const i of changes.issues ?? []) {
        await tx.insert(t.issues).values(i).onConflictDoUpdate({ target: t.issues.id, set: i });
      }
      for (const l of changes.links ?? []) {
        await tx.insert(t.links).values(l).onConflictDoUpdate({ target: t.links.id, set: l });
      }
      if ((changes.deleteLinkIds ?? []).length > 0) {
        await tx.delete(t.links).where(inArray(t.links.id, changes.deleteLinkIds ?? []));
      }
      if ((changes.comments ?? []).length > 0)
        await tx.insert(t.comments).values(changes.comments ?? []);
      if ((changes.history ?? []).length > 0)
        await tx.insert(t.history).values(changes.history ?? []);
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new HttpError(409, 'conflict', 'Данные изменились: обновите страницу и повторите');
    }
    throw e;
  }
}

export async function findIssueByNumber(
  db: Db,
  projectId: string,
  number: number,
): Promise<Issue | null> {
  const rows = (await db
    .select()
    .from(t.issues)
    .where(and(eq(t.issues.projectId, projectId), eq(t.issues.number, number)))) as Issue[];
  return rows[0] ?? null;
}

export { loadDataset };
