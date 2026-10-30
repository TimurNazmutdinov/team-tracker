import type { FieldErrors, Result, View } from './actions';
import { checklistItems } from './checklist';
import type { Issue, Project, Status } from './schema';

// Definition of Done проекта (ADR-018): чек-лист в Markdown («- [ ] …»). При переводе задачи
// в Done пользователь подтверждает все пункты; пустой список — подтверждения нет.

export const DOD_MAX = 5000;

/** Пункты Definition of Done по порядку (без отметок: подтверждение каждый раз новое). */
export function dodItems(project: Pick<Project, 'dod'>): string[] {
  return checklistItems(project.dod)
    .map((i) => i.text)
    .filter((t) => t !== '');
}

/** Нужно ли подтверждение: в Done переводится задача, которая ещё не в Done, а список не пуст. */
export function dodRequired(
  project: Pick<Project, 'dod'>,
  from: Pick<Issue, 'status'> | Status,
  to: Status,
): boolean {
  const status = typeof from === 'string' ? from : from.status;
  return to === 'Done' && status !== 'Done' && dodItems(project).length > 0;
}

/** Сохраняет Definition of Done проекта. */
export function updateDod(view: View, dod: string): Result {
  const errors: FieldErrors = {};
  if (dod.length > DOD_MAX) errors.dod = `Не больше ${DOD_MAX} символов`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (dod === view.project.dod) return { ok: true, changes: {} };
  return { ok: true, changes: { projects: [{ ...view.project, dod }] } };
}
