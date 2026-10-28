import { z } from 'zod';

// Типы и схемы сущностей: docs/data-model.md. Типы выводятся из схем, чтобы не расходиться.

z.config(z.locales.ru());

export const ISSUE_TYPES = ['Epic', 'Story', 'Task', 'Bug', 'Sub-task'] as const;
export const STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'] as const;
export const PRIORITIES = ['Highest', 'High', 'Medium', 'Low'] as const;
export const SPRINT_STATES = ['planned', 'active', 'closed'] as const;
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
export type Person = z.infer<typeof personSchema>;
export type Sprint = z.infer<typeof sprintSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type Link = z.infer<typeof linkSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type History = z.infer<typeof historySchema>;
export type Dataset = z.infer<typeof datasetSchema>;
