import type { Ctx, FieldErrors, Result, View } from './actions';
import type { Capacity } from './planning';
import { ABSENCE_KINDS, type Absence, type AbsenceKind, type Sprint } from './schema';
import { addDays, validDate } from './settings';

// Доступность людей и ёмкость спринта (ADR-018). Рабочие дни — понедельник–пятница без праздников.
// Ёмкость по velocity (ADR-014) умножается на долю доступных человеко-дней команды спринта.

export const ABSENCE_LABELS: Record<AbsenceKind, string> = {
  vacation: 'Отпуск',
  sick: 'Больничный',
  other: 'Другое',
};

const MAX_RANGE_DAYS = 366;

const isWorkday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
};

/** Рабочие дни от start до end включительно (не более года). */
export function workdays(start: string, end: string): string[] {
  const out: string[] = [];
  let n = 0;
  for (let d = start; d <= end && n < MAX_RANGE_DAYS; d = addDays(d, 1), n += 1) {
    if (isWorkday(d)) out.push(d);
  }
  return out;
}

export interface AbsenceInput {
  personId: string;
  start: string;
  end: string;
  kind: AbsenceKind;
}

function validate(view: Pick<View, 'people'>, input: AbsenceInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!view.people.some((p) => p.id === input.personId)) errors.personId = 'Выберите человека';
  if (!validDate(input.start)) errors.start = 'Введите дату начала';
  if (!validDate(input.end)) errors.end = 'Введите дату конца';
  else if (validDate(input.start) && input.end < input.start)
    errors.end = 'Конец не может быть раньше начала';
  else if (validDate(input.start) && workdays(input.start, input.end).length === 0)
    errors.end = 'В периоде нет рабочих дней';
  if (!ABSENCE_KINDS.includes(input.kind)) errors.kind = 'Выберите вид';
  return errors;
}

export function addAbsence(view: Pick<View, 'people'>, input: AbsenceInput, ctx: Ctx): Result {
  const errors = validate(view, input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, changes: { absences: [{ id: ctx.newId(), ...input }] } };
}

export function updateAbsence(
  view: Pick<View, 'people' | 'absences'>,
  id: string,
  input: AbsenceInput,
): Result {
  const existing = view.absences.find((a) => a.id === id);
  if (!existing) return { ok: false, errors: { form: 'Отсутствие не найдено' } };
  const errors = validate(view, input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const next: Absence = { id, ...input };
  if (JSON.stringify(next) === JSON.stringify(existing)) return { ok: true, changes: {} };
  return { ok: true, changes: { absences: [next] } };
}

export function deleteAbsence(view: Pick<View, 'absences'>, id: string): Result {
  if (!view.absences.some((a) => a.id === id))
    return { ok: false, errors: { form: 'Отсутствие не найдено' } };
  return { ok: true, changes: { deleteAbsenceIds: [id] } };
}

/** Команда проекта: владелец и участники. */
export function teamOf(view: Pick<View, 'project' | 'members' | 'projectId'>): string[] {
  const ids = new Set<string>();
  if (view.project.ownerId) ids.add(view.project.ownerId);
  for (const m of view.members) if (m.projectId === view.projectId) ids.add(m.personId);
  return [...ids];
}

export interface AbsenceInSprint {
  absence: Absence;
  /** Рабочие дни спринта, на которые приходится отсутствие. */
  days: number;
  /** Часть отсутствия внутри спринта. */
  start: string;
  end: string;
}

export interface Availability {
  /** Человеко-дни команды за спринт (рабочие дни × число людей). */
  totalDays: number;
  /** Из них доступные: без отпусков и больничных (пересекающиеся отсутствия не считаются дважды). */
  availableDays: number;
  /** Доля доступных дней, 0–1; 1, если команды нет или рабочих дней нет. */
  ratio: number;
  absences: AbsenceInSprint[];
}

/** Доступность команды проекта в спринте. */
export function sprintAvailability(
  view: Pick<View, 'project' | 'members' | 'projectId' | 'absences'>,
  sprint: Pick<Sprint, 'start' | 'end'>,
): Availability {
  const days = workdays(sprint.start, sprint.end);
  const team = teamOf(view);
  const totalDays = days.length * team.length;
  const absences: AbsenceInSprint[] = [];
  let lost = 0;
  for (const personId of team) {
    const gone = new Set<string>();
    for (const absence of view.absences.filter((a) => a.personId === personId)) {
      const inside = days.filter((d) => d >= absence.start && d <= absence.end);
      if (inside.length === 0) continue;
      for (const d of inside) gone.add(d);
      absences.push({
        absence,
        days: inside.length,
        start: inside[0] ?? absence.start,
        end: inside[inside.length - 1] ?? absence.end,
      });
    }
    lost += gone.size;
  }
  const availableDays = totalDays - lost;
  return {
    totalDays,
    availableDays,
    ratio: totalDays === 0 ? 1 : availableDays / totalDays,
    absences: absences.sort((a, b) => a.start.localeCompare(b.start)),
  };
}

export interface AdjustedCapacity extends Capacity {
  /** Среднее velocity до поправки на доступность. */
  base: number | null;
  availability: Availability;
}

/** Ёмкость спринта с учётом доступности: velocity × доля доступных человеко-дней, один знак после запятой. */
export function adjustedCapacity(capacity: Capacity, availability: Availability): AdjustedCapacity {
  const value =
    capacity.value === null ? null : Math.round(capacity.value * availability.ratio * 10) / 10;
  return { ...capacity, value, base: capacity.value, availability };
}
