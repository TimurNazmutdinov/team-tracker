import type { FieldErrors, Result } from './actions';
import type { Project } from './schema';

// Управление созданными проектами на вкладке «Портфель» (ADR-023): название и ключ, архив, удаление
// пустого проекта. Создание проекта — `createProject` в actions.ts.

const fail = (errors: FieldErrors): Result => ({ ok: false, errors });

export function isArchived(project: Pick<Project, 'archivedAt'>): boolean {
  return project.archivedAt !== null;
}

/** Проекты, с которыми работают экраны: без архивных. */
export function activeProjects<T extends Pick<Project, 'archivedAt'>>(projects: readonly T[]): T[] {
  return projects.filter((p) => !isArchived(p));
}

export interface ProjectEdit {
  key: string;
  name: string;
}

/** Меняет ключ и название проекта; ключ — 2–10 заглавных латинских букв, уникальный. */
export function updateProject(existing: Project[], id: string, input: ProjectEdit): Result {
  const project = existing.find((p) => p.id === id);
  if (!project) return fail({ form: 'Проект не найден' });
  const errors: FieldErrors = {};
  const key = input.key.trim();
  const name = input.name.trim();
  if (!/^[A-Z]{2,10}$/.test(key)) errors.key = '2–10 заглавных латинских букв, например DEMO';
  else if (existing.some((p) => p.id !== id && p.key === key))
    errors.key = 'Такой ключ уже занят, выберите другой';
  if (name.length === 0 || name.length > 100) errors.name = 'Введите название (до 100 символов)';
  if (Object.keys(errors).length > 0) return fail(errors);
  if (key === project.key && name === project.name) return { ok: true, changes: {} };
  return { ok: true, changes: { projects: [{ ...project, key, name }] } };
}

/** Отправляет проект в архив: он скрывается из выбора проектов, портфеля, аналитики и поиска. */
export function archiveProject(project: Project, now: string): Result {
  if (isArchived(project)) return fail({ form: 'Проект уже в архиве' });
  return { ok: true, changes: { projects: [{ ...project, archivedAt: now }] } };
}

export function restoreProject(project: Project): Result {
  if (!isArchived(project)) return fail({ form: 'Проект не в архиве' });
  return { ok: true, changes: { projects: [{ ...project, archivedAt: null }] } };
}

/** Удаление разрешено только проекту без задач: данные не теряются; остальное — в архив. */
export function deleteProject(project: Project, issueCount: number): Result {
  if (issueCount > 0)
    return fail({
      form: 'В проекте есть задачи: удалить можно только пустой проект. Отправьте его в архив.',
    });
  return { ok: true, changes: { deleteProjectIds: [project.id] } };
}
