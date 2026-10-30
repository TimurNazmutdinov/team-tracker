import { z } from 'zod';
import { checkIntegrity } from '../../../src/domain/integrity';
import { DEFAULT_PALETTE, PALETTES, type Palette } from '../../../src/domain/palettes';
import { DEFAULT_ROLES, roleSchema } from '../../../src/domain/roles';
import type { Role } from '../../../src/domain/permissions';
import {
  commentSchema,
  historySchema,
  issueSchema,
  linkSchema,
  memberSchema,
  templateSchema,
  absenceSchema,
  retroItemSchema,
  personSchema,
  projectSchema,
  sprintSchema,
  type Dataset,
} from '../../../src/domain/schema';
import type { BackupCounts } from '../../../src/domain/backups';

// Содержимое комплекта копии (ADR-012): снимок данных трекера и учётных записей.

/** Данные трекера без служебной версии seed. */
export type Entities = Omit<Dataset, 'version'>;

export interface AccountRecord {
  id: string;
  email: string;
  /** Хэш пароля; null — учётка восстановлена из Excel, пароля в нём нет. */
  passwordHash: string | null;
  accessRole: Role;
  mustChangePassword: boolean;
  /** Цветовая гамма профиля (ADR-013). */
  palette: Palette;
  createdAt: string | null;
}

export interface Snapshot {
  data: Entities;
  accounts: AccountRecord[];
}

export const FORMAT = 1;

export function countsOf(data: Entities): BackupCounts {
  return {
    projects: data.projects.length,
    people: data.people.length,
    sprints: data.sprints.length,
    issues: data.issues.length,
    links: data.links.length,
    comments: data.comments.length,
    history: data.history.length,
  };
}

const countsSchema = z.object({
  projects: z.number().int(),
  people: z.number().int(),
  sprints: z.number().int(),
  issues: z.number().int(),
  links: z.number().int(),
  comments: z.number().int(),
  history: z.number().int(),
});

const accountSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  passwordHash: z.string().min(1).nullable(),
  accessRole: z.string().min(1),
  mustChangePassword: z.boolean(),
  // в копиях до ADR-013 поля нет — тогда гамма по умолчанию
  palette: z.enum(PALETTES).default(DEFAULT_PALETTE),
  createdAt: z.iso.datetime().nullable(),
});

/** Формат tracker.json — основной путь восстановления. */
export const backupJsonSchema = z.object({
  format: z.literal(FORMAT),
  createdAt: z.iso.datetime(),
  reason: z.string(),
  appVersion: z.string(),
  schemaVersion: z.number().int().nullable(),
  counts: countsSchema,
  data: z.object({
    projects: z.array(projectSchema),
    people: z.array(personSchema),
    // в копиях до ADR-016 участников проектов нет
    members: z.array(memberSchema).default([]),
    // в копиях до ADR-017 шаблонов задач нет
    templates: z.array(templateSchema).default([]),
    // в копиях до ADR-021 ролей нет — тогда четыре роли по умолчанию
    roles: z.array(roleSchema).default(() => structuredClone(DEFAULT_ROLES)),
    // в копиях до ADR-018 отсутствий и записей ретроспектив нет
    absences: z.array(absenceSchema).default([]),
    retroItems: z.array(retroItemSchema).default([]),
    sprints: z.array(sprintSchema),
    issues: z.array(issueSchema),
    links: z.array(linkSchema),
    comments: z.array(commentSchema),
    history: z.array(historySchema),
  }),
  accounts: z.array(accountSchema),
});

export type BackupJson = z.infer<typeof backupJsonSchema>;

const MAX_PROBLEMS = 20;

/** Проверка снимка перед восстановлением: целостность данных и учётных записей. */
export function snapshotProblems(snapshot: Snapshot): string[] {
  const problems = checkIntegrity({ version: 1, ...snapshot.data });
  const people = new Set(snapshot.data.people.map((p) => p.id));
  const roleIds = new Set(snapshot.data.roles.map((r) => r.id));
  const emails = new Set<string>();
  for (const a of snapshot.accounts) {
    if (!people.has(a.id)) problems.push(`учётка ${a.email}: нет человека с id ${a.id}`);
    if (!roleIds.has(a.accessRole)) problems.push(`учётка ${a.email}: нет роли ${a.accessRole}`);
    if (emails.has(a.email.toLowerCase())) problems.push(`почта ${a.email} повторяется`);
    emails.add(a.email.toLowerCase());
  }
  const ids = new Set<string>();
  for (const key of [
    'projects',
    'people',
    'members',
    'templates',
    'roles',
    'absences',
    'retroItems',
    'sprints',
    'issues',
    'links',
    'comments',
    'history',
  ] as const) {
    ids.clear();
    for (const row of snapshot.data[key]) {
      if (ids.has(row.id)) problems.push(`${key}: id ${row.id} повторяется`);
      ids.add(row.id);
    }
  }
  return problems.slice(0, MAX_PROBLEMS);
}
