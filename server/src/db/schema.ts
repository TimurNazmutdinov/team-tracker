import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Таблицы повторяют сущности docs/data-model.md. Даты хранятся строками ISO, как в приложении:
// так значения возвращаются клиенту без преобразований.

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  sprintDurationDays: integer('sprint_duration_days').notNull(),
  sprintPrefix: text('sprint_prefix').notNull(),
  nextSprintNumber: integer('next_sprint_number').notNull(),
  nextSprintStart: text('next_sprint_start'),
});

export const people = pgTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
});

export const sprints = pgTable(
  'sprints',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    goal: text('goal').notNull(),
    start: text('start').notNull(),
    end: text('end').notNull(),
    state: text('state').notNull(),
    closedAt: text('closed_at'),
  },
  (t) => [index('sprints_project_idx').on(t.projectId)],
);

export const issues = pgTable(
  'issues',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    number: integer('number').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    acceptance: text('acceptance').notNull(),
    status: text('status').notNull(),
    priority: text('priority').notNull(),
    points: integer('points'),
    assigneeId: text('assignee_id').references(() => people.id),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => people.id),
    parentId: text('parent_id'),
    sprintId: text('sprint_id').references(() => sprints.id),
    labels: jsonb('labels').$type<string[]>().notNull(),
    order: integer('order').notNull(),
    dueDate: text('due_date'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('issues_number_idx').on(t.projectId, t.number)],
);

export const links = pgTable('links', {
  id: text('id').primaryKey(),
  fromId: text('from_id')
    .notNull()
    .references(() => issues.id),
  toId: text('to_id')
    .notNull()
    .references(() => issues.id),
  type: text('type').notNull(),
});

export const comments = pgTable(
  'comments',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id),
    authorId: text('author_id')
      .notNull()
      .references(() => people.id),
    text: text('text').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('comments_issue_idx').on(t.issueId)],
);

export const history = pgTable(
  'history',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id),
    authorId: text('author_id')
      .notNull()
      .references(() => people.id),
    field: text('field').notNull(),
    from: text('from'),
    to: text('to'),
    at: text('at').notNull(),
  },
  (t) => [index('history_issue_idx').on(t.issueId)],
);

/** Учётка: человек (people) с почтой, паролем и ролью доступа (ADR-010). */
export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .references(() => people.id),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  accessRole: text('access_role').notNull(),
  /** Пароль временный (его выдал администратор): до смены работать с данными нельзя. */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  /** Цветовая гамма интерфейса (ADR-013): хранится в профиле, видна с любого компьютера. */
  palette: text('palette').notNull().default('beige'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Сессия входа; в базе только хэш токена, сам токен лежит в cookie браузера. */
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Настройки приложения, которые меняет администратор в интерфейсе (например, папка копий). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
