import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Changes } from '../../src/domain/changes';
import { parseDataset } from '../../src/domain/dataset';
import { violations, type Role } from '../../src/domain/permissions';
import type {
  Comment,
  Dataset,
  History,
  Issue,
  IssueTemplate,
  Absence,
  RoleDef,
  RetroItem,
  Link,
  Person,
  Project,
  ProjectMember,
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
  members: (db: Db) => db.select().from(t.projectMembers) as Promise<ProjectMember[]>,
  templates: (db: Db) => db.select().from(t.issueTemplates) as Promise<IssueTemplate[]>,
  roles: (db: Db) => db.select().from(t.roles) as Promise<RoleDef[]>,
  absences: (db: Db) => db.select().from(t.absences) as Promise<Absence[]>,
  retroItems: (db: Db, projectId: string) =>
    db.select().from(t.retroItems).where(eq(t.retroItems.projectId, projectId)) as Promise<
      RetroItem[]
    >,
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

/**
 * Набор данных для проверки изменений. С `projectIds` — только эти проекты (их спринты, задачи, связи,
 * комментарии, история) и все люди: проверки целостности и прав не выходят за границы проекта, а
 * загрузка и разбор всей базы на каждую запись замедляют работу на тысячах задач (ADR-015).
 */
async function loadDataset(db: Db | Tx, projectIds?: string[]): Promise<Dataset> {
  const scoped = projectIds !== undefined;
  const ids = projectIds ?? [];
  const issueIds = scoped
    ? db.select({ id: t.issues.id }).from(t.issues).where(inArray(t.issues.projectId, ids))
    : null;
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
  ] = await Promise.all([
    scoped
      ? db.select().from(t.projects).where(inArray(t.projects.id, ids))
      : db.select().from(t.projects),
    db.select().from(t.people),
    scoped
      ? db.select().from(t.projectMembers).where(inArray(t.projectMembers.projectId, ids))
      : db.select().from(t.projectMembers),
    scoped
      ? db.select().from(t.issueTemplates).where(inArray(t.issueTemplates.projectId, ids))
      : db.select().from(t.issueTemplates),
    db.select().from(t.roles),
    db.select().from(t.absences),
    scoped
      ? db.select().from(t.retroItems).where(inArray(t.retroItems.projectId, ids))
      : db.select().from(t.retroItems),
    scoped
      ? db.select().from(t.sprints).where(inArray(t.sprints.projectId, ids))
      : db.select().from(t.sprints),
    scoped
      ? db.select().from(t.issues).where(inArray(t.issues.projectId, ids))
      : db.select().from(t.issues),
    issueIds
      ? db.select().from(t.links).where(inArray(t.links.fromId, issueIds))
      : db.select().from(t.links),
    issueIds
      ? db.select().from(t.comments).where(inArray(t.comments.issueId, issueIds))
      : db.select().from(t.comments),
    issueIds
      ? db.select().from(t.history).where(inArray(t.history.issueId, issueIds))
      : db.select().from(t.history),
  ]);
  return {
    version: DATASET_VERSION,
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
  } as Dataset;
}

/** Проекты, которых касается набор изменений: свои и те, где лежат упомянутые задачи и связи. */
async function touchedProjects(tx: Tx, changes: Changes): Promise<string[]> {
  const out = new Set<string>();
  for (const p of changes.projects ?? []) out.add(p.id);
  for (const s of changes.sprints ?? []) out.add(s.projectId);
  for (const m of changes.members ?? []) out.add(m.projectId);
  for (const x of changes.templates ?? []) out.add(x.projectId);
  for (const x of changes.retroItems ?? []) out.add(x.projectId);
  const retroIds = changes.deleteRetroItemIds ?? [];
  if (retroIds.length > 0) {
    const rows = await tx
      .select({ projectId: t.retroItems.projectId })
      .from(t.retroItems)
      .where(inArray(t.retroItems.id, retroIds));
    for (const r of rows) out.add(r.projectId);
  }
  const templateIds = changes.deleteTemplateIds ?? [];
  if (templateIds.length > 0) {
    const rows = await tx
      .select({ projectId: t.issueTemplates.projectId })
      .from(t.issueTemplates)
      .where(inArray(t.issueTemplates.id, templateIds));
    for (const r of rows) out.add(r.projectId);
  }
  const memberIds = changes.deleteMemberIds ?? [];
  if (memberIds.length > 0) {
    const rows = await tx
      .select({ projectId: t.projectMembers.projectId })
      .from(t.projectMembers)
      .where(inArray(t.projectMembers.id, memberIds));
    for (const r of rows) out.add(r.projectId);
  }
  for (const i of changes.issues ?? []) out.add(i.projectId);
  const issueIds = new Set<string>();
  for (const i of changes.issues ?? []) issueIds.add(i.id);
  for (const l of changes.links ?? []) {
    issueIds.add(l.fromId);
    issueIds.add(l.toId);
  }
  for (const c of changes.comments ?? []) issueIds.add(c.issueId);
  for (const h of changes.history ?? []) issueIds.add(h.issueId);
  const removed = changes.deleteLinkIds ?? [];
  if (removed.length > 0) {
    const rows = await tx
      .select({ fromId: t.links.fromId, toId: t.links.toId })
      .from(t.links)
      .where(inArray(t.links.id, removed));
    for (const r of rows) {
      issueIds.add(r.fromId);
      issueIds.add(r.toId);
    }
  }
  if (issueIds.size > 0) {
    const rows = await tx
      .select({ projectId: t.issues.projectId })
      .from(t.issues)
      .where(inArray(t.issues.id, [...issueIds]));
    for (const r of rows) out.add(r.projectId);
  }
  return [...out];
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
  upsert(next.members, changes.members);
  upsert(next.templates, changes.templates);
  upsert(next.roles, changes.roles);
  upsert(next.absences, changes.absences);
  upsert(next.retroItems, changes.retroItems);
  upsert(next.sprints, changes.sprints);
  upsert(next.issues, changes.issues);
  upsert(next.links, changes.links);
  const removed = new Set(changes.deleteLinkIds ?? []);
  next.links = next.links.filter((l) => !removed.has(l.id));
  const removedMembers = new Set(changes.deleteMemberIds ?? []);
  next.members = next.members.filter((m) => !removedMembers.has(m.id));
  const removedRoles = new Set(changes.deleteRoleIds ?? []);
  next.roles = next.roles.filter((x) => !removedRoles.has(x.id));
  const removedAbsences = new Set(changes.deleteAbsenceIds ?? []);
  next.absences = next.absences.filter((x) => !removedAbsences.has(x.id));
  const removedRetro = new Set(changes.deleteRetroItemIds ?? []);
  next.retroItems = next.retroItems.filter((x) => !removedRetro.has(x.id));
  const removedTemplates = new Set(changes.deleteTemplateIds ?? []);
  next.templates = next.templates.filter((x) => !removedTemplates.has(x.id));
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
      const current = await loadDataset(tx, await touchedProjects(tx, changes));

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
      for (const m of changes.members ?? []) {
        await tx
          .insert(t.projectMembers)
          .values(m)
          .onConflictDoUpdate({ target: t.projectMembers.id, set: m });
      }
      if ((changes.deleteMemberIds ?? []).length > 0) {
        await tx
          .delete(t.projectMembers)
          .where(inArray(t.projectMembers.id, changes.deleteMemberIds ?? []));
      }
      for (const x of changes.templates ?? []) {
        await tx
          .insert(t.issueTemplates)
          .values(x)
          .onConflictDoUpdate({ target: t.issueTemplates.id, set: x });
      }
      if ((changes.deleteTemplateIds ?? []).length > 0) {
        await tx
          .delete(t.issueTemplates)
          .where(inArray(t.issueTemplates.id, changes.deleteTemplateIds ?? []));
      }
      if ((changes.deleteRoleIds ?? []).length > 0) {
        // роль, назначенную учётке, удалить нельзя (ADR-021)
        const used = await tx
          .select({ role: t.users.accessRole })
          .from(t.users)
          .where(inArray(t.users.accessRole, changes.deleteRoleIds ?? []));
        if (used.length > 0)
          throw new HttpError(
            409,
            'role_in_use',
            'Роль назначена учёткам: сначала смените им роль',
          );
      }
      for (const x of changes.roles ?? []) {
        await tx.insert(t.roles).values(x).onConflictDoUpdate({ target: t.roles.id, set: x });
      }
      if ((changes.deleteRoleIds ?? []).length > 0) {
        await tx.delete(t.roles).where(inArray(t.roles.id, changes.deleteRoleIds ?? []));
      }
      for (const x of changes.absences ?? []) {
        await tx.insert(t.absences).values(x).onConflictDoUpdate({ target: t.absences.id, set: x });
      }
      if ((changes.deleteAbsenceIds ?? []).length > 0) {
        await tx.delete(t.absences).where(inArray(t.absences.id, changes.deleteAbsenceIds ?? []));
      }
      for (const x of changes.retroItems ?? []) {
        await tx
          .insert(t.retroItems)
          .values(x)
          .onConflictDoUpdate({ target: t.retroItems.id, set: x });
      }
      if ((changes.deleteRetroItemIds ?? []).length > 0) {
        await tx
          .delete(t.retroItems)
          .where(inArray(t.retroItems.id, changes.deleteRetroItemIds ?? []));
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
