import { z } from 'zod';
import { DEFAULT_ROLES, roleSchema, type RoleDef } from './roles';

// Типы и схемы сущностей: docs/data-model.md. Типы выводятся из схем, чтобы не расходиться.

z.config(z.locales.ru());

export const ISSUE_TYPES = ['Epic', 'Story', 'Task', 'Bug', 'Sub-task'] as const;
export const STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'] as const;
export const PRIORITIES = ['Highest', 'High', 'Medium', 'Low'] as const;
export const SPRINT_STATES = ['planned', 'active', 'closed'] as const;
/** Роли в проекте: продакт, тимлид, разработчик (ADR-016). */
export const PROJECT_ROLES = ['product', 'lead', 'developer'] as const;
/** Колонки доски, для которых задаётся WIP-лимит (ADR-017). */
export const WIP_COLUMNS = ['To Do', 'In Progress', 'Review', 'Done'] as const;
/** Виды отсутствия человека (ADR-018). */
export const ABSENCE_KINDS = ['vacation', 'sick', 'other'] as const;
/** Списки ретроспективы: что хорошо, что улучшить, действия (ADR-018). */
export const RETRO_KINDS = ['good', 'improve', 'action'] as const;
export const LINK_TYPES = ['blocks', 'relates', 'duplicates'] as const;
export const HISTORY_FIELDS = [
  'created',
  'status',
  'assigneeId',
  'points',
  'sprintId',
  'title',
  'description',
  'acceptance',
  'priority',
  'parentId',
  'labels',
  'dueDate',
] as const;

const id = z.string().min(1);
const nullableId = id.nullable();

export const projectSchema = z.object({
  id,
  key: z.string().regex(/^[A-Z]{2,10}$/, '2–10 заглавных латинских букв'),
  name: z.string().min(1).max(100),
  /** Настройки спринтов проекта (ADR-008): длительность в днях, название и дата следующего спринта. */
  sprintDurationDays: z.number().int().min(1).max(90),
  sprintPrefix: z.string().min(1).max(30),
  nextSprintNumber: z.number().int().min(1).max(9999),
  nextSprintStart: z.iso.date().nullable(),
  /** Продакт-владелец проекта (ADR-016); у проектов, созданных раньше, не задан. */
  ownerId: nullableId.default(null),
  /** WIP-лимиты колонок доски (ADR-017): по умолчанию выключены. */
  wipEnabled: z.boolean().default(false),
  /** Лимит задач на колонку; нет записи — без лимита. */
  wipLimits: z.partialRecord(z.enum(WIP_COLUMNS), z.number().int().min(1).max(999)).default({}),
  /** Definition of Done проекта (ADR-018): чек-лист Markdown, строки «- [ ] …»; пусто — без подтверждения. */
  dod: z.string().max(5000).default(''),
});

/** Участник проекта с ролью в нём; владелец проекта хранится в Project.ownerId и здесь не повторяется. */
export const memberSchema = z.object({
  id,
  projectId: id,
  personId: id,
  role: z.enum(PROJECT_ROLES),
});

/** Шаблон задачи проекта (ADR-017): подставляет тип, описание и критерии при создании. */
export const templateSchema = z.object({
  id,
  projectId: id,
  name: z.string().min(1).max(60),
  type: z.enum(ISSUE_TYPES),
  description: z.string().max(10000),
  acceptance: z.string().max(10000),
});

/** Отсутствие человека (отпуск, больничный): уменьшает ёмкость спринтов, на которые приходится (ADR-018). */
export const absenceSchema = z.object({
  id,
  personId: id,
  start: z.iso.date(),
  end: z.iso.date(),
  kind: z.enum(ABSENCE_KINDS),
});

/** Запись ретроспективы спринта; у действия `issueId` — задача, созданная из него. */
export const retroItemSchema = z.object({
  id,
  projectId: id,
  sprintId: id,
  kind: z.enum(RETRO_KINDS),
  text: z.string().min(1).max(500),
  authorId: id,
  createdAt: z.iso.datetime(),
  issueId: nullableId.default(null),
});

export const personSchema = z.object({
  id,
  name: z.string().min(1),
  role: z.string().min(1),
});

export const sprintSchema = z.object({
  id,
  projectId: id,
  name: z.string().min(1),
  goal: z.string(),
  start: z.iso.date(),
  end: z.iso.date(),
  state: z.enum(SPRINT_STATES),
  closedAt: z.iso.datetime().nullable(),
});

export const issueSchema = z.object({
  id,
  projectId: id,
  number: z.number().int().positive(),
  type: z.enum(ISSUE_TYPES),
  title: z.string().min(1).max(200),
  description: z.string(),
  acceptance: z.string(),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  points: z.number().int().min(0).nullable(),
  assigneeId: nullableId,
  reporterId: id,
  parentId: nullableId,
  sprintId: nullableId,
  labels: z.array(z.string().min(1)),
  order: z.number().int(),
  dueDate: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const linkSchema = z.object({
  id,
  fromId: id,
  toId: id,
  type: z.enum(LINK_TYPES),
});

export const commentSchema = z.object({
  id,
  issueId: id,
  authorId: id,
  text: z.string().min(1).max(5000),
  createdAt: z.iso.datetime(),
});

export const historySchema = z.object({
  id,
  issueId: id,
  authorId: id,
  field: z.enum(HISTORY_FIELDS),
  from: z.string().nullable(),
  to: z.string().nullable(),
  at: z.iso.datetime(),
});

export const datasetSchema = z.object({
  /** Версия seed.json: при её изменении сохранённые в браузере данные сбрасываются. */
  version: z.number().int().min(1),
  projects: z.array(projectSchema),
  people: z.array(personSchema),
  /** Участники проектов; в старых наборах данных поля нет. */
  members: z.array(memberSchema).default([]),
  /** Шаблоны задач проектов; в старых наборах данных поля нет. */
  templates: z.array(templateSchema).default([]),
  /** Роли и права (ADR-021); в старых наборах данных — четыре роли по умолчанию. */
  roles: z.array(roleSchema).default(() => structuredClone(DEFAULT_ROLES)),
  /** Отсутствия и записи ретроспектив; в старых наборах данных полей нет. */
  absences: z.array(absenceSchema).default([]),
  retroItems: z.array(retroItemSchema).default([]),
  sprints: z.array(sprintSchema),
  issues: z.array(issueSchema),
  links: z.array(linkSchema),
  comments: z.array(commentSchema),
  history: z.array(historySchema),
});

export type IssueType = (typeof ISSUE_TYPES)[number];
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type SprintState = (typeof SPRINT_STATES)[number];
export type LinkType = (typeof LINK_TYPES)[number];
export type HistoryField = (typeof HISTORY_FIELDS)[number];

export type Project = z.infer<typeof projectSchema>;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type Person = z.infer<typeof personSchema>;
export type ProjectMember = z.infer<typeof memberSchema>;
export type { RoleDef };
export type Absence = z.infer<typeof absenceSchema>;
export type RetroItem = z.infer<typeof retroItemSchema>;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];
export type RetroKind = (typeof RETRO_KINDS)[number];
export type IssueTemplate = z.infer<typeof templateSchema>;
export type WipColumn = (typeof WIP_COLUMNS)[number];
export type Sprint = z.infer<typeof sprintSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type Link = z.infer<typeof linkSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type History = z.infer<typeof historySchema>;
export type Dataset = z.infer<typeof datasetSchema>;
