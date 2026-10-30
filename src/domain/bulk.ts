import type { Changes } from './changes';
import {
  moveIssue,
  updateIssue,
  containerItems,
  type Ctx,
  type Result,
  type View,
} from './actions';
import type { History, Issue, Priority, Status } from './schema';

// Массовые действия над задачами (ADR-017): статус, исполнитель, приоритет, метка, спринт.
// Каждая задача меняется обычными правилами (updateIssue, moveIssue) и получает свои записи истории.
// Результат «всё или ничего»: если хоть одну задачу изменить нельзя, не меняется ни одна.

export interface BulkPatch {
  status?: Status;
  assigneeId?: string | null;
  priority?: Priority;
  /** Метка, которую нужно добавить (если её ещё нет). */
  addLabel?: string;
  /** Спринт назначения; null — бэклог. Задачи встают в конец списка. */
  sprintId?: string | null;
}

const MAX_SHOWN_ERRORS = 5;

export function isEmptyPatch(patch: BulkPatch): boolean {
  return (
    patch.status === undefined &&
    patch.assigneeId === undefined &&
    patch.priority === undefined &&
    (patch.addLabel === undefined || patch.addLabel.trim() === '') &&
    patch.sprintId === undefined
  );
}

export function bulkUpdate(
  view: View,
  issueIds: string[],
  patch: BulkPatch,
  authorId: string,
  ctx: Ctx,
): Result {
  if (issueIds.length === 0 || isEmptyPatch(patch)) return { ok: true, changes: {} };
  const label = patch.addLabel?.trim() ?? '';

  let working = view;
  const issues = new Map<string, Issue>();
  const history: History[] = [];
  const failures: string[] = [];
  const keyOf = (i: Issue) => `${view.project.key}-${i.number}`;

  const apply = (changes: Changes) => {
    const byId = new Map<string, Issue>();
    for (const i of changes.issues ?? []) {
      byId.set(i.id, i);
      issues.set(i.id, i);
    }
    history.push(...(changes.history ?? []));
    if (byId.size > 0)
      working = { ...working, issues: working.issues.map((i) => byId.get(i.id) ?? i) };
  };

  for (const id of issueIds) {
    const issue = working.issues.find((i) => i.id === id);
    if (!issue) {
      failures.push(`${id}: задача не найдена`);
      continue;
    }
    const fields: Parameters<typeof updateIssue>[2] = {};
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.assigneeId !== undefined) fields.assigneeId = patch.assigneeId;
    if (patch.priority !== undefined) fields.priority = patch.priority;
    if (label !== '' && !issue.labels.includes(label)) fields.labels = [...issue.labels, label];
    if (Object.keys(fields).length > 0) {
      const r = updateIssue(working, id, fields, authorId, ctx);
      if (!r.ok) {
        failures.push(`${keyOf(issue)}: ${Object.values(r.errors).join('. ')}`);
        continue;
      }
      apply(r.changes);
    }
    if (patch.sprintId !== undefined) {
      const current = working.issues.find((i) => i.id === id) ?? issue;
      if (current.sprintId !== patch.sprintId) {
        const index = containerItems(working, patch.sprintId).filter((i) => i.id !== id).length;
        const r = moveIssue(working, id, { sprintId: patch.sprintId, index }, authorId, ctx);
        if (!r.ok) {
          failures.push(`${keyOf(issue)}: ${Object.values(r.errors).join('. ')}`);
          continue;
        }
        apply(r.changes);
      }
    }
  }

  if (failures.length > 0) {
    const shown = failures.slice(0, MAX_SHOWN_ERRORS).join('; ');
    const rest =
      failures.length > MAX_SHOWN_ERRORS ? ` и ещё ${failures.length - MAX_SHOWN_ERRORS}` : '';
    return { ok: false, errors: { form: `Не изменена ни одна задача. ${shown}${rest}` } };
  }
  if (issues.size === 0 && history.length === 0) return { ok: true, changes: {} };
  return { ok: true, changes: { issues: [...issues.values()], history } };
}
