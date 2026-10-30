import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { BackupCounts } from '../../../src/domain/backups';
import { insertChunks } from '../bulk';
import { schema, type Db } from '../db';
import { hashPassword, temporaryPassword } from '../passwords';
import { lockWrites } from '../repo';
import { JSON_FILE, XLSX_FILE } from './service';
import {
  backupJsonSchema,
  countsOf,
  snapshotProblems,
  type Entities,
  type Snapshot,
} from './types';
import { readXlsx } from './xlsx';

// Восстановление из комплекта (ADR-012): основной путь — tracker.json, запасной — tracker.xlsx.
// Сначала проверка и отчёт, затем замена всех данных в одной транзакции.

const t = schema;

export type Source = 'json' | 'xlsx';

export interface LoadedBundle {
  source: Source;
  createdAt: string | null;
  reason: string | null;
  appVersion: string | null;
  snapshot: Snapshot;
  counts: BackupCounts;
  /** С паролями ли учётки: из Excel их не восстановить, будут выданы временные. */
  withPasswords: boolean;
  /** Пояснения: например, что json не прочитался и взят Excel. */
  notes: string[];
}

export type LoadResult = ({ ok: true } & LoadedBundle) | { ok: false; problems: string[] };

function jsonProblems(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fromJson(folder: string): Promise<LoadResult> {
  const path = join(folder, JSON_FILE);
  if (!existsSync(path)) return { ok: false, problems: [`нет файла ${JSON_FILE}`] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { ok: false, problems: [`${JSON_FILE} не читается: ${jsonProblems(e)}`] };
  }
  const parsed = backupJsonSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues
        .slice(0, 10)
        .map((i) => `${JSON_FILE}: ${i.path.join('.') || '(корень)'}: ${i.message}`),
    };
  }
  const { data, accounts, counts } = parsed.data;
  const snapshot: Snapshot = { data: data as Entities, accounts };
  const problems = snapshotProblems(snapshot);
  const real = countsOf(snapshot.data);
  for (const key of Object.keys(counts) as (keyof BackupCounts)[]) {
    if (counts[key] !== real[key]) {
      problems.push(
        `${JSON_FILE}: заявлено ${key} ${counts[key]}, а записей ${real[key]} — файл повреждён`,
      );
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    source: 'json',
    createdAt: parsed.data.createdAt,
    reason: parsed.data.reason,
    appVersion: parsed.data.appVersion,
    snapshot,
    counts: real,
    withPasswords: accounts.every((a) => a.passwordHash !== null),
    notes: [],
  };
}

async function fromXlsx(folder: string): Promise<LoadResult> {
  const path = join(folder, XLSX_FILE);
  if (!existsSync(path)) return { ok: false, problems: [`нет файла ${XLSX_FILE}`] };
  try {
    const read = await readXlsx(readFileSync(path));
    // Те же проверки структуры, что и для json: Excel могли править руками
    const entities = backupJsonSchema.shape.data.safeParse(read.snapshot.data);
    if (!entities.success) {
      return {
        ok: false,
        problems: entities.error.issues
          .slice(0, 10)
          .map((i) => `${XLSX_FILE}: ${i.path.join('.')}: ${i.message}`),
      };
    }
    const problems = snapshotProblems(read.snapshot);
    if (problems.length > 0) return { ok: false, problems };
    return {
      ok: true,
      source: 'xlsx',
      createdAt: read.createdAt,
      reason: null,
      appVersion: null,
      snapshot: read.snapshot,
      counts: countsOf(read.snapshot.data),
      withPasswords: false,
      notes: [
        'Из Excel не восстанавливаются пароли: учётки получат временные пароли (будут показаны один раз).',
        'Пустая строка и пустая ячейка в Excel неразличимы: в истории пустые «было/стало» станут пустыми значениями.',
      ],
    };
  } catch (e) {
    return { ok: false, problems: [`${XLSX_FILE}: ${jsonProblems(e)}`] };
  }
}

/**
 * Читает и проверяет комплект. `auto` — json, а если он повреждён или его нет, Excel (с пометкой);
 * явный источник проверяется без запасных путей.
 */
export async function loadBundle(
  folder: string,
  source: Source | 'auto' = 'auto',
): Promise<LoadResult> {
  if (!existsSync(folder)) return { ok: false, problems: [`папка не найдена: ${folder}`] };
  if (source === 'json') return fromJson(folder);
  if (source === 'xlsx') return fromXlsx(folder);
  const json = await fromJson(folder);
  if (json.ok) return json;
  const xlsx = await fromXlsx(folder);
  if (xlsx.ok) {
    return {
      ...xlsx,
      notes: [`json не подошёл (${json.problems[0] ?? 'ошибка'}), взят Excel.`, ...xlsx.notes],
    };
  }
  return { ok: false, problems: [...json.problems, ...xlsx.problems] };
}

export interface RestoreResult {
  /** Учётки без пароля в копии получили временные: показать один раз. */
  temporaryPasswords: { email: string; password: string }[];
}

/** Заменяет ВСЕ данные трекера данными из снимка в одной транзакции; сессии входа закрываются. */
export async function applyRestore(db: Db, snapshot: Snapshot): Promise<RestoreResult> {
  const temporaryPasswords: RestoreResult['temporaryPasswords'] = [];
  const users = await Promise.all(
    snapshot.accounts.map(async (a) => {
      if (a.passwordHash !== null) {
        return {
          id: a.id,
          email: a.email,
          passwordHash: a.passwordHash,
          accessRole: a.accessRole,
          mustChangePassword: a.mustChangePassword,
          palette: a.palette,
          ...(a.createdAt ? { createdAt: new Date(a.createdAt) } : {}),
        };
      }
      const password = temporaryPassword();
      temporaryPasswords.push({ email: a.email, password });
      return {
        id: a.id,
        email: a.email,
        passwordHash: await hashPassword(password),
        accessRole: a.accessRole,
        mustChangePassword: true,
        palette: a.palette,
      };
    }),
  );

  const { data } = snapshot;
  await db.transaction(async (tx) => {
    await lockWrites(tx);
    // Порядок удаления и вставки учитывает внешние ключи
    for (const table of [
      t.sessions,
      t.comments,
      t.history,
      t.links,
      t.issues,
      t.sprints,
      t.projectMembers,
      t.issueTemplates,
      t.absences,
      t.retroItems,
      t.roles,
      t.users,
      t.people,
      t.projects,
    ]) {
      await tx.delete(table);
    }
    await insertChunks((r) => tx.insert(t.projects).values(r), data.projects);
    await insertChunks((r) => tx.insert(t.people).values(r), data.people);
    await insertChunks((r) => tx.insert(t.users).values(r), users);
    await insertChunks((r) => tx.insert(t.projectMembers).values(r), data.members);
    await insertChunks((r) => tx.insert(t.issueTemplates).values(r), data.templates);
    await insertChunks((r) => tx.insert(t.roles).values(r), data.roles);
    await insertChunks((r) => tx.insert(t.absences).values(r), data.absences);
    await insertChunks((r) => tx.insert(t.sprints).values(r), data.sprints);
    await insertChunks((r) => tx.insert(t.issues).values(r), data.issues);
    await insertChunks((r) => tx.insert(t.retroItems).values(r), data.retroItems);
    await insertChunks((r) => tx.insert(t.links).values(r), data.links);
    await insertChunks((r) => tx.insert(t.comments).values(r), data.comments);
    await insertChunks((r) => tx.insert(t.history).values(r), data.history, 1000);
  });
  return { temporaryPasswords };
}

/** Количество записей в текущей базе — для сравнения в отчёте «что будет заменено». */
export async function currentCounts(db: Db): Promise<BackupCounts & { accounts: number }> {
  const count = async (name: string) => {
    const r = await db.execute(sql.raw(`select count(*)::int as n from ${name}`));
    return Number((r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
  };
  return {
    projects: await count('projects'),
    people: await count('people'),
    sprints: await count('sprints'),
    issues: await count('issues'),
    links: await count('links'),
    comments: await count('comments'),
    history: await count('history'),
    accounts: await count('users'),
  };
}
