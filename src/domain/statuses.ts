import { z } from 'zod';
import type { FieldErrors } from './actions';

// Колонки досок (D-1, ADR-024): статусы — данные, общие для всех проектов. У каждой колонки тип:
// не начато, в работе или готово; служебный статус «Бэклог» не показывается на доске. Отчёты,
// Definition of Done и WIP опираются на тип колонки, а не на её название.

export const STATUS_CATEGORIES = ['backlog', 'todo', 'progress', 'done'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<StatusCategory, string> = {
  backlog: 'бэклог',
  todo: 'не начато',
  progress: 'в работе',
  done: 'готово',
};

export const STATUS_NAME_MAX = 40;

export const statusSchema = z.object({
  /** Идентификатор; у колонок по умолчанию совпадает с прежним названием (откат безопасен). */
  id: z.string().min(1),
  name: z.string().min(1).max(STATUS_NAME_MAX),
  category: z.enum(STATUS_CATEGORIES),
  order: z.number().int(),
  /** Удалённая колонка: скрыта отовсюду, имя остаётся для истории. */
  archived: z.boolean().default(false),
});

export type StatusDef = z.infer<typeof statusSchema>;

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'Backlog', name: 'Backlog', category: 'backlog', order: 0, archived: false },
  { id: 'To Do', name: 'To Do', category: 'todo', order: 1, archived: false },
  { id: 'In Progress', name: 'In Progress', category: 'progress', order: 2, archived: false },
  { id: 'Review', name: 'Review', category: 'progress', order: 3, archived: false },
  { id: 'Done', name: 'Done', category: 'done', order: 4, archived: false },
];

/** Тип прежних статусов по идентификатору — если в данных колонки не нашлось. */
const LEGACY_CATEGORY: Record<string, StatusCategory> = {
  Backlog: 'backlog',
  'To Do': 'todo',
  'In Progress': 'progress',
  Review: 'progress',
  Done: 'done',
};

export type Statuses = readonly StatusDef[];

/** Колонки из данных проекта или набора данных; нет — колонки по умолчанию. */
export const statusesOf = (holder: { statuses?: readonly StatusDef[] | undefined }): Statuses =>
  holder.statuses ?? DEFAULT_STATUSES;

/** Действующие колонки по порядку (без удалённых). */
export function activeStatuses(statuses: Statuses): StatusDef[] {
  return statuses.filter((s) => !s.archived).sort((a, b) => a.order - b.order);
}

/** Колонки доски: действующие, кроме служебного «Бэклога». */
export function boardStatuses(statuses: Statuses): StatusDef[] {
  return activeStatuses(statuses).filter((s) => s.category !== 'backlog');
}

export function statusById(statuses: Statuses, id: string): StatusDef | undefined {
  return statuses.find((s) => s.id === id);
}

export function categoryOf(statuses: Statuses, id: string): StatusCategory {
  return statusById(statuses, id)?.category ?? LEGACY_CATEGORY[id] ?? 'todo';
}

export const isDoneStatus = (statuses: Statuses, id: string) => categoryOf(statuses, id) === 'done';

export const isBacklogStatus = (statuses: Statuses, id: string) =>
  categoryOf(statuses, id) === 'backlog';

/** Название колонки для показа; у неизвестной — сам идентификатор. */
export function statusName(statuses: Statuses, id: string): string {
  return statusById(statuses, id)?.name ?? id;
}

function firstOf(statuses: Statuses, category: StatusCategory, fallback: string): string {
  return activeStatuses(statuses).find((s) => s.category === category)?.id ?? fallback;
}

/** Статус новой задачи — первая колонка «бэклог». */
export const backlogStatusId = (statuses: Statuses) => firstOf(statuses, 'backlog', 'Backlog');
/** Первая колонка «не начато»: в неё попадает задача, взятая в спринт или вернувшаяся из него. */
export const startStatusId = (statuses: Statuses) => firstOf(statuses, 'todo', 'To Do');
/** Первая колонка «готово». */
export const doneStatusId = (statuses: Statuses) => firstOf(statuses, 'done', 'Done');

/** CSS-класс цвета колонки: у прежних колонок — свой цвет, у новых — цвет типа. */
export function statusClass(statuses: Statuses, id: string): string {
  const legacy = LEGACY_CATEGORY[id] ? ` status-${id.toLowerCase().replace(' ', '-')}` : '';
  return `cat-${categoryOf(statuses, id)}${legacy}`;
}

// ---- правка колонок: чистые функции, возвращают изменённые колонки или ошибки

export type StatusResult = { ok: true; statuses: StatusDef[] } | { ok: false; errors: FieldErrors };

const fail = (errors: FieldErrors): StatusResult => ({ ok: false, errors });

/** Порядок заново 0, 1, 2…: возвращаются только колонки, у которых он изменился. */
function renumber(list: StatusDef[], all: Statuses): StatusDef[] {
  const changed: StatusDef[] = [];
  list.forEach((s, i) => {
    const before = all.find((x) => x.id === s.id);
    if (
      !before ||
      before.order !== i ||
      JSON.stringify(before) !== JSON.stringify({ ...s, order: i })
    )
      changed.push({ ...s, order: i });
  });
  return changed;
}

function validName(statuses: Statuses, name: string, exceptId?: string): string | null {
  const clean = name.trim();
  if (!clean) return 'Введите название колонки';
  if (clean.length > STATUS_NAME_MAX) return `Название длиннее ${STATUS_NAME_MAX} символов`;
  const lower = clean.toLocaleLowerCase('ru');
  if (
    activeStatuses(statuses).some(
      (s) => s.id !== exceptId && s.name.toLocaleLowerCase('ru') === lower,
    )
  )
    return 'Колонка с таким названием уже есть';
  return null;
}

/**
 * Новая колонка (D-1): по умолчанию «в работе», встаёт перед первой колонкой «готово».
 * `position` — номер среди колонок доски (0 — первая), если нужно другое место.
 */
export function addStatus(
  statuses: Statuses,
  input: { name: string; category?: StatusCategory; position?: number },
  newId: () => string,
): StatusResult {
  const error = validName(statuses, input.name);
  if (error) return fail({ name: error });
  const category = input.category ?? 'progress';
  if (category === 'backlog') return fail({ category: 'Колонка «бэклог» уже есть' });
  const created: StatusDef = {
    id: `st-${newId()}`,
    name: input.name.trim(),
    category,
    order: 0,
    archived: false,
  };
  const all = activeStatuses(statuses);
  const backlog = all.filter((s) => s.category === 'backlog');
  const board = all.filter((s) => s.category !== 'backlog');
  const firstDone = board.findIndex((s) => s.category === 'done');
  const at =
    input.position !== undefined
      ? Math.max(0, Math.min(board.length, input.position))
      : firstDone === -1
        ? board.length
        : firstDone;
  board.splice(at, 0, created);
  return { ok: true, statuses: renumber([...backlog, ...board], statuses) };
}

export function renameStatus(statuses: Statuses, id: string, name: string): StatusResult {
  const status = statusById(statuses, id);
  if (!status || status.archived) return fail({ form: 'Колонка не найдена' });
  const error = validName(statuses, name, id);
  if (error) return fail({ name: error });
  if (status.name === name.trim()) return { ok: true, statuses: [] };
  return { ok: true, statuses: [{ ...status, name: name.trim() }] };
}

/** Сдвиг колонки доски на `delta` мест (−1 влево, +1 вправо) или на место `to` среди колонок доски. */
export function moveStatus(
  statuses: Statuses,
  id: string,
  target: { delta: number } | { to: number },
): StatusResult {
  const all = activeStatuses(statuses);
  const backlog = all.filter((s) => s.category === 'backlog');
  const board = all.filter((s) => s.category !== 'backlog');
  const from = board.findIndex((s) => s.id === id);
  if (from === -1) return fail({ form: 'Колонка не найдена' });
  const to = 'delta' in target ? from + target.delta : target.to;
  if (to < 0 || to >= board.length || to === from) return { ok: true, statuses: [] };
  const [moved] = board.splice(from, 1);
  if (moved) board.splice(to, 0, moved);
  return { ok: true, statuses: renumber([...backlog, ...board], statuses) };
}

/** Проверка набора колонок: одна колонка «бэклог», хотя бы одна «не начато» и одна «готово». */
export function statusRuleErrors(statuses: Statuses): string[] {
  const all = activeStatuses(statuses);
  const errors: string[] = [];
  if (all.filter((s) => s.category === 'backlog').length !== 1)
    errors.push('Должна быть ровно одна служебная колонка «бэклог»');
  if (!all.some((s) => s.category === 'todo'))
    errors.push('Нужна хотя бы одна колонка «не начато»');
  if (!all.some((s) => s.category === 'done')) errors.push('Нужна хотя бы одна колонка «готово»');
  return errors;
}

export function setStatusCategory(
  statuses: Statuses,
  id: string,
  category: StatusCategory,
): StatusResult {
  const status = statusById(statuses, id);
  if (!status || status.archived) return fail({ form: 'Колонка не найдена' });
  if (status.category === 'backlog' || category === 'backlog')
    return fail({ category: 'Тип служебной колонки «бэклог» не меняется' });
  if (status.category === category) return { ok: true, statuses: [] };
  const next = { ...status, category };
  const errors = statusRuleErrors(statuses.map((s) => (s.id === id ? next : s)));
  if (errors.length > 0) return fail({ category: errors.join('. ') });
  return { ok: true, statuses: [next] };
}

/**
 * Удаление колонки: задачи из неё переносятся в `targetId` (это делает вызывающий код вместе с
 * записями истории), сама колонка помечается удалённой — её название остаётся в истории.
 */
export function archiveStatus(statuses: Statuses, id: string, targetId: string): StatusResult {
  const status = statusById(statuses, id);
  if (!status || status.archived) return fail({ form: 'Колонка не найдена' });
  if (status.category === 'backlog')
    return fail({ form: 'Служебную колонку «бэклог» удалить нельзя' });
  const target = statusById(statuses, targetId);
  if (!target || target.archived || target.id === id)
    return fail({ targetId: 'Выберите колонку, куда перенести задачи' });
  const next = { ...status, archived: true };
  const errors = statusRuleErrors(statuses.map((s) => (s.id === id ? next : s)));
  if (errors.length > 0) return fail({ form: errors.join('. ') });
  return { ok: true, statuses: [next] };
}
