import type { Ctx, FieldErrors, Result, View } from './actions';
import type { Changes } from './changes';
import type { History, Issue, Sprint } from './schema';
import { projectAfterSprint } from './settings';

// Спринты (F-08, F-09): создание, правка, запуск и закрытие с переносом незавершённого.
// Правила: ADR-003 (п. 2, 4, 8, 9), ADR-008. Чистые функции: данные на входе, изменения на выходе.

const NAME_MAX = 100;
const GOAL_MAX = 500;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (errors: FieldErrors): Result => ({ ok: false, errors });

export interface SprintInput {
  name: string;
  goal: string;
  start: string;
  end: string;
}

function validDate(value: string): boolean {
  return (
    DATE.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
  );
}

/** Проверка полей спринта; `prefix` нужен окну закрытия, где форма нового спринта вложена в другую. */
function validateSprint(
  input: SprintInput,
  others: Sprint[],
  exceptId?: string,
  prefix = '',
): FieldErrors {
  const errors: FieldErrors = {};
  const key = (name: string) =>
    prefix ? `${prefix}${name[0]?.toUpperCase() ?? ''}${name.slice(1)}` : name;
  const name = input.name.trim();
  if (name.length === 0) errors[key('name')] = `Введите название (до ${NAME_MAX} символов)`;
  else if (name.length > NAME_MAX) errors[key('name')] = `Название длиннее ${NAME_MAX} символов`;
  else if (
    others.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === name.toLowerCase())
  ) {
    errors[key('name')] = 'Спринт с таким названием уже есть';
  }
  if (input.goal.trim().length > GOAL_MAX)
    errors[key('goal')] = `Цель длиннее ${GOAL_MAX} символов`;
  if (!validDate(input.start)) errors[key('start')] = 'Дата в формате ГГГГ-ММ-ДД';
  if (!validDate(input.end)) errors[key('end')] = 'Дата в формате ГГГГ-ММ-ДД';
  if (!errors[key('start')] && !errors[key('end')] && input.end <= input.start) {
    errors[key('end')] = 'Дата окончания должна быть позже даты старта';
  }
  return errors;
}

/** Изменение проекта после создания спринта (счётчик номера, дата-подсказка), если оно есть. */
function projectChange(view: View, sprint: Sprint): Changes {
  const project = projectAfterSprint(view, sprint);
  return JSON.stringify(project) === JSON.stringify(view.project) ? {} : { projects: [project] };
}

function newSprint(view: View, input: SprintInput, ctx: Ctx): Sprint {
  return {
    id: ctx.newId(),
    projectId: view.projectId,
    name: input.name.trim(),
    goal: input.goal.trim(),
    start: input.start,
    end: input.end,
    state: 'planned',
    closedAt: null,
  };
}

export function createSprint(view: View, input: SprintInput, ctx: Ctx): Result {
  const errors = validateSprint(input, view.sprints);
  if (Object.keys(errors).length > 0) return fail(errors);
  const sprint = newSprint(view, input, ctx);
  return { ok: true, changes: { sprints: [sprint], ...projectChange(view, sprint) } };
}

/** Правка названия, цели и дат; закрытый спринт только для чтения. */
export function updateSprint(
  view: View,
  sprintId: string,
  patch: Partial<SprintInput>,
  ctx: Ctx,
): Result {
  void ctx;
  const sprint = view.sprints.find((s) => s.id === sprintId);
  if (!sprint) return fail({ form: 'Спринт не найден' });
  if (sprint.state === 'closed')
    return fail({ form: 'Закрытый спринт доступен только для чтения' });
  const next: SprintInput = {
    name: patch.name ?? sprint.name,
    goal: patch.goal ?? sprint.goal,
    start: patch.start ?? sprint.start,
    end: patch.end ?? sprint.end,
  };
  const errors = validateSprint(next, view.sprints, sprint.id);
  if (Object.keys(errors).length > 0) return fail(errors);
  const updated: Sprint = {
    ...sprint,
    name: next.name.trim(),
    goal: next.goal.trim(),
    start: next.start,
    end: next.end,
  };
  if (JSON.stringify(updated) === JSON.stringify(sprint)) return { ok: true, changes: {} };
  return { ok: true, changes: { sprints: [updated] } };
}

/** Запуск: planned → active; одновременно активен один спринт проекта. */
export function startSprint(view: View, sprintId: string): Result {
  const sprint = view.sprints.find((s) => s.id === sprintId);
  if (!sprint) return fail({ form: 'Спринт не найден' });
  if (sprint.state !== 'planned')
    return fail({ form: 'Запустить можно только запланированный спринт' });
  const active = view.sprints.find((s) => s.state === 'active');
  if (active)
    return fail({
      form: `Сначала закройте «${active.name}»: в проекте может быть один активный спринт`,
    });
  return { ok: true, changes: { sprints: [{ ...sprint, state: 'active' }] } };
}

// ------------------------------------------------------------------ закрытие

export type CloseTarget =
  { kind: 'backlog' } | { kind: 'sprint'; sprintId: string } | { kind: 'new'; sprint: SprintInput };

export interface CloseSummary {
  /** Сколько задач в Done и сколько story points они дают: это velocity спринта. */
  doneCount: number;
  velocity: number;
  /** Что будет перенесено: незавершённые задачи верхнего уровня и все их подзадачи. */
  carried: Issue[];
  carriedPoints: number;
  /** Незавершённые подзадачи выполненных родителей: остаются в закрытом спринте. */
  staying: Issue[];
}

function sprintIssues(view: View, sprintId: string): Issue[] {
  return view.issues.filter((i) => i.sprintId === sprintId).sort((a, b) => a.order - b.order);
}

/** Что произойдёт при закрытии спринта: для окна закрытия и для уведомления. */
export function closeSummary(view: View, sprintId: string): CloseSummary {
  const inSprint = sprintIssues(view, sprintId);
  const topLevel = inSprint.filter((i) => i.type !== 'Sub-task');
  const unfinishedParents = new Set(topLevel.filter((i) => i.status !== 'Done').map((i) => i.id));
  const carried = inSprint.filter((i) =>
    i.type === 'Sub-task' ? unfinishedParents.has(i.parentId ?? '') : unfinishedParents.has(i.id),
  );
  const staying = inSprint.filter(
    (i) => i.type === 'Sub-task' && i.status !== 'Done' && !unfinishedParents.has(i.parentId ?? ''),
  );
  const done = inSprint.filter((i) => i.status === 'Done');
  return {
    doneCount: done.length,
    velocity: done.reduce((sum, i) => sum + (i.points ?? 0), 0),
    carried,
    carriedPoints: carried.reduce((sum, i) => sum + (i.points ?? 0), 0),
    staying,
  };
}

/**
 * Закрытие спринта (ADR-003, п. 2, 4, 8, 9): состояние closed, момент закрытия, перенос незавершённого
 * в спринт planned, в бэклог или в новый спринт; подзадачи переносятся вместе с родителем.
 * События sprintId пишутся с моментом закрытия, поэтому закрытый спринт остаётся замороженным.
 */
export function closeSprint(
  view: View,
  sprintId: string,
  target: CloseTarget,
  authorId: string,
  ctx: Ctx,
): Result {
  const sprint = view.sprints.find((s) => s.id === sprintId);
  if (!sprint) return fail({ form: 'Спринт не найден' });
  if (sprint.state !== 'active') return fail({ form: 'Закрыть можно только идущий спринт' });
  const summary = closeSummary(view, sprintId);
  const now = ctx.now();

  let targetSprint: Sprint | undefined;
  let targetId: string | null = null;
  if (summary.carried.length > 0) {
    if (target.kind === 'sprint') {
      targetSprint = view.sprints.find((s) => s.id === target.sprintId);
      if (!targetSprint || targetSprint.id === sprint.id || targetSprint.state !== 'planned') {
        return fail({ target: 'Выберите запланированный спринт' });
      }
      targetId = targetSprint.id;
    } else if (target.kind === 'new') {
      const errors = validateSprint(target.sprint, view.sprints, undefined, 'new');
      if (Object.keys(errors).length > 0) return fail(errors);
      targetSprint = newSprint(view, target.sprint, ctx);
      targetId = targetSprint.id;
    }
  }

  const changes: Changes = { sprints: [{ ...sprint, state: 'closed', closedAt: now }] };
  if (targetSprint && target.kind === 'new') {
    changes.sprints?.push(targetSprint);
    Object.assign(changes, projectChange(view, targetSprint));
  }
  if (summary.carried.length > 0) {
    const history: History[] = [];
    changes.issues = summary.carried.map((issue) => {
      history.push({
        id: ctx.newId(),
        issueId: issue.id,
        authorId,
        field: 'sprintId',
        from: sprint.id,
        to: targetId,
        at: now,
      });
      return { ...issue, sprintId: targetId, updatedAt: now };
    });
    changes.history = history;
  }
  return { ok: true, changes };
}
