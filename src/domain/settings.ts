import type { Ctx, FieldErrors, Result, View } from './actions';
import type { Project, Sprint } from './schema';

// Настройки спринтов проекта (ADR-008): длительность, название (префикс и номер), дата начала следующего.

export const DEFAULT_SPRINT_SETTINGS = {
  sprintDurationDays: 14,
  sprintPrefix: 'Спринт',
  nextSprintNumber: 1,
  nextSprintStart: null,
} as const;

export interface SprintSettings {
  sprintDurationDays: number;
  sprintPrefix: string;
  nextSprintNumber: number;
  nextSprintStart: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Дата `date` (ГГГГ-ММ-ДД) плюс `days` дней. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function validDate(value: string): boolean {
  return DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

export function sprintSettingsOf(project: Project): SprintSettings {
  return {
    sprintDurationDays: project.sprintDurationDays,
    sprintPrefix: project.sprintPrefix,
    nextSprintNumber: project.nextSprintNumber,
    nextSprintStart: project.nextSprintStart,
  };
}

/** Проверка и сохранение настроек спринтов (F-28). */
export function updateSprintSettings(view: View, input: SprintSettings, ctx: Ctx): Result {
  void ctx;
  const errors: FieldErrors = {};
  if (
    !Number.isInteger(input.sprintDurationDays) ||
    input.sprintDurationDays < 1 ||
    input.sprintDurationDays > 90
  ) {
    errors.sprintDurationDays = 'Длительность — целое число дней от 1 до 90';
  }
  const prefix = input.sprintPrefix.trim();
  if (prefix.length === 0 || prefix.length > 30)
    errors.sprintPrefix = 'Введите префикс названия (до 30 символов)';
  if (
    !Number.isInteger(input.nextSprintNumber) ||
    input.nextSprintNumber < 1 ||
    input.nextSprintNumber > 9999
  ) {
    errors.nextSprintNumber = 'Номер — целое число от 1 до 9999';
  }
  if (input.nextSprintStart !== null && !validDate(input.nextSprintStart)) {
    errors.nextSprintStart = 'Дата в формате ГГГГ-ММ-ДД';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const project: Project = { ...view.project, ...input, sprintPrefix: prefix };
  if (JSON.stringify(project) === JSON.stringify(view.project)) return { ok: true, changes: {} };
  return { ok: true, changes: { projects: [project] } };
}

/** Название и номер следующего спринта: «префикс номер»; занятые названия пропускаются. */
export function nextSprintName(view: View): { name: string; number: number } {
  const taken = new Set(view.sprints.map((s) => s.name.trim().toLowerCase()));
  let number = view.project.nextSprintNumber;
  while (taken.has(`${view.project.sprintPrefix} ${number}`.toLowerCase()) && number < 9999)
    number += 1;
  return { name: `${view.project.sprintPrefix} ${number}`, number };
}

/**
 * Значения для формы нового спринта: название по настройкам, начало — заданная дата или день после
 * конца последнего спринта (но не раньше `today`), конец — начало плюс длительность.
 */
export function nextSprintDefaults(
  view: View,
  today: string,
): { name: string; goal: string; start: string; end: string } {
  const lastEnd = view.sprints
    .map((s) => s.end)
    .sort()
    .at(-1);
  const after = lastEnd ? addDays(lastEnd, 1) : today;
  const start = view.project.nextSprintStart ?? (after > today ? after : today);
  return {
    name: nextSprintName(view).name,
    goal: '',
    start,
    end: addDays(start, view.project.sprintDurationDays - 1),
  };
}

/** Проект после создания спринта: счётчик номера растёт, если взято предложенное название; дата-подсказка гасится. */
export function projectAfterSprint(view: View, sprint: Sprint): Project {
  const suggested = nextSprintName(view);
  const project = { ...view.project };
  if (sprint.name.trim().toLowerCase() === suggested.name.toLowerCase())
    project.nextSprintNumber = suggested.number + 1;
  if (project.nextSprintStart !== null && project.nextSprintStart === sprint.start)
    project.nextSprintStart = null;
  return project;
}
