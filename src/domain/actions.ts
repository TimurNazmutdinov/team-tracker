import { type Changes } from './changes';
import { canHavePoints, isValidParent } from './hierarchy';
import {
  ISSUE_TYPES,
  LINK_TYPES,
  PRIORITIES,
  STATUSES,
  type Comment,
  type History,
  type HistoryField,
  type Issue,
  type IssueType,
  type Link,
  type LinkType,
  type Person,
  type Priority,
  type Project,
  type Sprint,
} from './schema';

// Действия над данными: чистые функции, которые по текущим данным и вводу пользователя возвращают
// набор изменений (Changes) с записями истории или ошибки по полям. Правила: ADR-003.

/** Источники времени и идентификаторов подставляются снаружи, чтобы логика была проверяемой. */
export interface Ctx {
  /** Текущий момент в формате ISO 8601 (UTC) без долей секунды: 2026-10-28T09:00:00Z. */
  now(): string;
  newId(): string;
}

/** Данные проекта, нужные логике. */
export interface View {
  projectId: string;
  people: Person[];
  sprints: Sprint[];
  issues: Issue[];
  links: Link[];
}

/** Ошибки по полям формы; ключ `form` — ошибка всего действия. */
export type FieldErrors = Record<string, string>;
export type Result = { ok: true; changes: Changes } | { ok: false; errors: FieldErrors };

const fail = (errors: FieldErrors): Result => ({ ok: false, errors });
const ok = (changes: Changes): Result => ({ ok: true, changes });

const TITLE_MAX = 200;
const COMMENT_MAX = 5000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CLOSED_SPRINT_MESSAGE = 'Спринт закрыт: задачи в нём доступны только для чтения.';

export interface NewIssueInput {
  type: IssueType;
  title: string;
  description: string;
  acceptance: string;
  parentId: string | null;
  priority: Priority;
  points: number | null;
  assigneeId: string | null;
  labels: string[];
  dueDate: string | null;
  sprintId: string | null;
}

export type IssuePatch = Partial<
  Pick<
    Issue,
    | 'title'
    | 'description'
    | 'acceptance'
    | 'status'
    | 'priority'
    | 'points'
    | 'assigneeId'
    | 'parentId'
    | 'sprintId'
    | 'labels'
    | 'dueDate'
  >
>;

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

function findIssue(view: View, id: string): Issue | undefined {
  return view.issues.find((i) => i.id === id);
}

function sprintById(view: View, id: string | null): Sprint | undefined {
  return id === null ? undefined : view.sprints.find((s) => s.id === id);
}

function subtasksOf(view: View, parentId: string): Issue[] {
  return view.issues.filter((i) => i.type === 'Sub-task' && i.parentId === parentId);
}

function historyEntry(
  ctx: Ctx,
  issueId: string,
  authorId: string,
  field: HistoryField,
  from: string | null,
  to: string | null,
): History {
  return { id: ctx.newId(), issueId, authorId, field, from, to, at: ctx.now() };
}

function validPoints(type: IssueType, points: number | null): string | null {
  if (points === null) return null;
  if (!canHavePoints(type)) return 'У этого типа задач story points не ставятся';
  if (!Number.isInteger(points) || points < 0) return 'Story points — целое число не меньше 0';
  return null;
}

function validTargetSprint(view: View, sprintId: string | null): string | null {
  if (sprintId === null) return null;
  const sprint = sprintById(view, sprintId);
  if (!sprint) return 'Такого спринта нет';
  if (sprint.state === 'closed') return 'В закрытый спринт задачи добавлять нельзя';
  return null;
}

function validParent(view: View, type: IssueType, parentId: string | null): string | null {
  const parent = parentId === null ? undefined : findIssue(view, parentId);
  if (parentId !== null && !parent) return 'Такой родительской задачи нет';
  if (!isValidParent(type, parent?.type ?? null)) {
    if (type === 'Sub-task') return 'Sub-task создаётся внутри Story, Task или Bug';
    if (type === 'Epic') return 'У Epic не может быть родителя';
    return 'Родитель — только Epic (Task в Story не вкладывается)';
  }
  return null;
}

function cleanLabels(labels: string[]): string[] {
  return [...new Set(labels.map((l) => l.trim()).filter((l) => l.length > 0))];
}

/** Родители, допустимые для задач этого типа: для выпадающего списка в форме. */
export function parentCandidates(view: View, type: IssueType, excludeId?: string): Issue[] {
  return view.issues.filter(
    (i) =>
      i.id !== excludeId &&
      isValidParent(type, i.type) &&
      validParent(view, type, i.id) === null &&
      // подзадача следует за родителем, а в закрытый спринт добавлять нельзя
      !(type === 'Sub-task' && sprintById(view, i.sprintId)?.state === 'closed'),
  );
}

// ------------------------------------------------------------------ создание

export function createIssue(view: View, input: NewIssueInput, authorId: string, ctx: Ctx): Result {
  const errors: FieldErrors = {};
  const title = input.title.trim();
  if (!ISSUE_TYPES.includes(input.type)) errors.type = 'Выберите тип задачи';
  if (title.length === 0) errors.title = `Введите название (до ${TITLE_MAX} символов)`;
  else if (title.length > TITLE_MAX) errors.title = `Название длиннее ${TITLE_MAX} символов`;
  if (!PRIORITIES.includes(input.priority)) errors.priority = 'Выберите приоритет';

  const parentError = validParent(view, input.type, input.parentId);
  if (parentError) errors.parentId = parentError;
  const pointsError = validPoints(input.type, input.points);
  if (pointsError) errors.points = pointsError;
  if (input.assigneeId !== null && !view.people.some((p) => p.id === input.assigneeId)) {
    errors.assigneeId = 'Такого человека нет';
  }
  if (input.dueDate !== null) {
    if (!DATE.test(input.dueDate)) errors.dueDate = 'Дата в формате ГГГГ-ММ-ДД';
    else if (input.dueDate < dateOf(ctx.now()))
      errors.dueDate = 'Срок не может быть раньше сегодняшнего дня';
  }

  // Sub-task всегда в спринте родителя (ADR-003, п. 9)
  const parent = input.parentId === null ? undefined : findIssue(view, input.parentId);
  const sprintId = input.type === 'Sub-task' ? (parent?.sprintId ?? null) : input.sprintId;
  const sprintError = validTargetSprint(view, sprintId);
  if (sprintError) {
    if (input.type === 'Sub-task') {
      errors.parentId = 'Родитель в закрытом спринте: подзадачи добавлять нельзя';
    } else {
      errors.sprintId = sprintError;
    }
  }
  if (Object.keys(errors).length > 0) return fail(errors);

  const now = ctx.now();
  const number = Math.max(0, ...view.issues.map((i) => i.number)) + 1;
  const order = Math.max(0, ...view.issues.map((i) => i.order)) + 1;
  const issue: Issue = {
    id: ctx.newId(),
    projectId: view.projectId,
    number,
    type: input.type,
    title,
    description: input.description.trim(),
    acceptance: input.acceptance.trim(),
    status: 'Backlog',
    priority: input.priority,
    points: input.points,
    assigneeId: input.assigneeId,
    reporterId: authorId,
    parentId: input.parentId,
    sprintId,
    labels: cleanLabels(input.labels),
    order,
    dueDate: input.dueDate,
    createdAt: now,
    updatedAt: now,
  };
  const history = [historyEntry(ctx, issue.id, authorId, 'created', null, 'Backlog')];
  if (sprintId !== null)
    history.push(historyEntry(ctx, issue.id, authorId, 'sprintId', null, sprintId));
  return ok({ issues: [issue], history });
}

// ------------------------------------------------------------------ изменение

function same<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Применяет изменение полей задачи: пишет историю, переносит подзадачи вместе с родителем. */
export function updateIssue(
  view: View,
  issueId: string,
  patch: IssuePatch,
  authorId: string,
  ctx: Ctx,
): Result {
  const issue = findIssue(view, issueId);
  if (!issue) return fail({ form: 'Задача не найдена' });
  if (sprintById(view, issue.sprintId)?.state === 'closed')
    return fail({ form: CLOSED_SPRINT_MESSAGE });

  const errors: FieldErrors = {};
  const next: Issue = { ...issue };
  const history: History[] = [];
  const extra: Issue[] = [];
  const now = ctx.now();

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title.length === 0) errors.title = `Введите название (до ${TITLE_MAX} символов)`;
    else if (title.length > TITLE_MAX) errors.title = `Название длиннее ${TITLE_MAX} символов`;
    else next.title = title;
  }
  if (patch.description !== undefined) next.description = patch.description.trim();
  if (patch.acceptance !== undefined) next.acceptance = patch.acceptance.trim();
  if (patch.priority !== undefined) {
    if (!PRIORITIES.includes(patch.priority)) errors.priority = 'Выберите приоритет';
    else next.priority = patch.priority;
  }
  if (patch.labels !== undefined) next.labels = cleanLabels(patch.labels);
  if (patch.dueDate !== undefined) {
    if (patch.dueDate !== null && !DATE.test(patch.dueDate))
      errors.dueDate = 'Дата в формате ГГГГ-ММ-ДД';
    else next.dueDate = patch.dueDate;
  }
  if (patch.status !== undefined && patch.status !== issue.status) {
    if (!STATUSES.includes(patch.status)) errors.status = 'Выберите статус';
    else {
      history.push(historyEntry(ctx, issue.id, authorId, 'status', issue.status, patch.status));
      next.status = patch.status;
    }
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== issue.assigneeId) {
    if (patch.assigneeId !== null && !view.people.some((p) => p.id === patch.assigneeId)) {
      errors.assigneeId = 'Такого человека нет';
    } else {
      history.push(
        historyEntry(ctx, issue.id, authorId, 'assigneeId', issue.assigneeId, patch.assigneeId),
      );
      next.assigneeId = patch.assigneeId;
    }
  }
  if (patch.points !== undefined && patch.points !== issue.points) {
    const pointsError = validPoints(issue.type, patch.points);
    if (pointsError) errors.points = pointsError;
    else {
      history.push(
        historyEntry(
          ctx,
          issue.id,
          authorId,
          'points',
          issue.points === null ? null : String(issue.points),
          patch.points === null ? null : String(patch.points),
        ),
      );
      next.points = patch.points;
    }
  }

  let newSprintId = issue.sprintId;
  if (patch.parentId !== undefined && patch.parentId !== issue.parentId) {
    const parentError = validParent(view, issue.type, patch.parentId);
    if (parentError) errors.parentId = parentError;
    else {
      next.parentId = patch.parentId;
      // Sub-task следует за новым родителем (ADR-003, п. 9)
      if (issue.type === 'Sub-task') {
        newSprintId = findIssue(view, patch.parentId ?? '')?.sprintId ?? null;
        if (validTargetSprint(view, newSprintId)) {
          errors.parentId = 'Родитель в закрытом спринте: подзадачу туда переносить нельзя';
        }
      }
    }
  }
  if (patch.sprintId !== undefined && patch.sprintId !== issue.sprintId) {
    if (issue.type === 'Sub-task') errors.sprintId = 'Sub-task переносится вместе с родителем';
    else {
      const sprintError = validTargetSprint(view, patch.sprintId);
      if (sprintError) errors.sprintId = sprintError;
      else newSprintId = patch.sprintId;
    }
  }
  if (Object.keys(errors).length > 0) return fail(errors);

  if (newSprintId !== issue.sprintId) {
    history.push(historyEntry(ctx, issue.id, authorId, 'sprintId', issue.sprintId, newSprintId));
    next.sprintId = newSprintId;
    if (issue.type !== 'Sub-task') {
      for (const sub of subtasksOf(view, issue.id)) {
        history.push(historyEntry(ctx, sub.id, authorId, 'sprintId', sub.sprintId, newSprintId));
        extra.push({ ...sub, sprintId: newSprintId, updatedAt: now });
      }
    }
  }

  if (same(next, issue) && extra.length === 0) return ok({});
  next.updatedAt = now;
  return ok({ issues: [next, ...extra], history });
}

// ------------------------------------------------------------------ порядок

/** Задачи списка (бэклога или спринта) по порядку. Sub-task во внимание не берутся: они идут за родителем. */
export function containerItems(view: View, sprintId: string | null): Issue[] {
  return view.issues
    .filter((i) => i.type !== 'Sub-task' && i.sprintId === sprintId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Переносит задачу в список (спринт или бэклог) на позицию index. Значения order перераспределяются
 * только внутри затронутого списка, поэтому не пересекаются с другими списками.
 */
export function moveIssue(
  view: View,
  issueId: string,
  target: { sprintId: string | null; index: number },
  authorId: string,
  ctx: Ctx,
): Result {
  const issue = findIssue(view, issueId);
  if (!issue) return fail({ form: 'Задача не найдена' });
  if (issue.type === 'Sub-task') return fail({ form: 'Sub-task переносится вместе с родителем' });

  let working = view;
  let base: Changes = {};
  if (target.sprintId !== issue.sprintId) {
    const moved = updateIssue(view, issueId, { sprintId: target.sprintId }, authorId, ctx);
    if (!moved.ok) return moved;
    base = moved.changes;
    const byId = new Map((base.issues ?? []).map((i) => [i.id, i]));
    working = { ...view, issues: view.issues.map((i) => byId.get(i.id) ?? i) };
  } else if (sprintById(view, issue.sprintId)?.state === 'closed') {
    return fail({ form: CLOSED_SPRINT_MESSAGE });
  }

  const others = containerItems(working, target.sprintId).filter((i) => i.id !== issueId);
  const current = working.issues.find((i) => i.id === issueId) ?? issue;
  const index = Math.max(0, Math.min(target.index, others.length));
  const list = [...others.slice(0, index), current, ...others.slice(index)];
  const values = [...others.map((i) => i.order), issue.order].sort((a, b) => a - b);
  const reordered = new Map<string, Issue>();
  list.forEach((item, position) => {
    const order = values[position] ?? item.order;
    if (order !== item.order) reordered.set(item.id, { ...item, order });
  });

  const issues = new Map((base.issues ?? []).map((i) => [i.id, i]));
  for (const [id, item] of reordered) {
    const prior = issues.get(id);
    issues.set(id, prior ? { ...prior, order: item.order } : item);
  }
  if (issues.size === 0) return ok({});
  return ok({ issues: [...issues.values()], history: base.history ?? [] });
}

// ------------------------------------------------------------------ связи и комментарии

export function addLink(
  view: View,
  fromId: string,
  toId: string,
  type: LinkType,
  ctx: Ctx,
): Result {
  const errors: FieldErrors = {};
  if (!LINK_TYPES.includes(type)) errors.type = 'Выберите тип связи';
  if (!findIssue(view, fromId) || !findIssue(view, toId)) errors.toId = 'Выберите задачу';
  else if (fromId === toId) errors.toId = 'Задачу нельзя связать с самой собой';
  else if (
    view.links.some(
      (l) =>
        l.type === type &&
        ((l.fromId === fromId && l.toId === toId) ||
          (type === 'relates' && l.fromId === toId && l.toId === fromId)),
    )
  ) {
    errors.toId = 'Такая связь уже есть';
  }
  if (Object.keys(errors).length > 0) return fail(errors);
  return ok({ links: [{ id: ctx.newId(), fromId, toId, type }] });
}

export function removeLink(view: View, linkId: string): Result {
  if (!view.links.some((l) => l.id === linkId)) return fail({ form: 'Связь не найдена' });
  return ok({ deleteLinkIds: [linkId] });
}

export function addComment(
  view: View,
  issueId: string,
  authorId: string,
  text: string,
  ctx: Ctx,
): Result {
  const trimmed = text.trim();
  if (!findIssue(view, issueId)) return fail({ form: 'Задача не найдена' });
  if (trimmed.length === 0) return fail({ text: 'Комментарий не может быть пустым' });
  if (trimmed.length > COMMENT_MAX)
    return fail({ text: `Комментарий длиннее ${COMMENT_MAX} символов` });
  const comment: Comment = {
    id: ctx.newId(),
    issueId,
    authorId,
    text: trimmed,
    createdAt: ctx.now(),
  };
  return ok({ comments: [comment] });
}

// ------------------------------------------------------------------ проекты

export function createProject(
  existing: Project[],
  input: { key: string; name: string },
  ctx: Ctx,
): Result {
  const errors: FieldErrors = {};
  const key = input.key.trim();
  const name = input.name.trim();
  if (!/^[A-Z]{2,10}$/.test(key)) errors.key = '2–10 заглавных латинских букв, например DEMO';
  else if (existing.some((p) => p.key === key))
    errors.key = 'Такой ключ уже занят, выберите другой';
  if (name.length === 0 || name.length > 100) errors.name = 'Введите название (до 100 символов)';
  if (Object.keys(errors).length > 0) return fail(errors);
  return ok({ projects: [{ id: ctx.newId(), key, name }] });
}
