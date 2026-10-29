import { velocity } from './reports';
import type { History, Issue, Sprint } from './schema';

// Планирование будущих спринтов и история (ADR-014): ёмкость и заполнение спринта, фильтры
// бэклога, закрытые спринты для вкладки «Прошлые спринты».

/** Сколько последних закрытых спринтов берётся для ёмкости. */
export const CAPACITY_SPRINTS = 3;
/** До этой доли ёмкости заполнение считается нормой; от неё до 100 % — «почти полон». */
export const NEAR_LIMIT = 0.9;

export interface Capacity {
  /** Среднее velocity последних закрытых спринтов, один знак после запятой; null, если закрытых нет. */
  value: number | null;
  /** Сколько закрытых спринтов учтено (0–3). */
  sprints: number;
  /** Velocity учтённых спринтов от старого к новому. */
  velocities: number[];
}

export function sprintCapacity(sprints: Sprint[], issues: Issue[], history: History[]): Capacity {
  const closed = velocity(sprints, issues, history).bars.filter((b) => b.state === 'closed');
  const used = closed.slice(-CAPACITY_SPRINTS).map((b) => b.velocity);
  if (used.length === 0) return { value: null, sprints: 0, velocities: [] };
  const value = Math.round((used.reduce((a, b) => a + b, 0) / used.length) * 10) / 10;
  return { value, sprints: used.length, velocities: used };
}

export type FillLevel = 'ok' | 'near' | 'over' | 'unknown';

export interface Fill {
  points: number;
  capacity: number | null;
  /** Процент от ёмкости, целое; null, если ёмкость неизвестна или равна нулю. */
  percent: number | null;
  level: FillLevel;
  /** На сколько points спринт перегружен (0, если не перегружен). */
  over: number;
  /** Сколько ещё помещается (0, если спринт полон или перегружен). */
  free: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Заполнение спринта: до 90 % ёмкости — норма, 91–100 % — почти полон, больше — перегруз. */
export function fillOf(points: number, capacity: number | null): Fill {
  if (capacity === null || capacity <= 0) {
    return { points, capacity, percent: null, level: 'unknown', over: 0, free: 0 };
  }
  const ratio = points / capacity;
  const level: FillLevel = ratio > 1 ? 'over' : ratio > NEAR_LIMIT ? 'near' : 'ok';
  return {
    points,
    capacity,
    percent: Math.round(ratio * 100),
    level,
    over: points > capacity ? round1(points - capacity) : 0,
    free: points < capacity ? round1(capacity - points) : 0,
  };
}

export function totalPoints(issues: Issue[]): number {
  return issues.reduce((sum, i) => sum + (i.points ?? 0), 0);
}

export function unestimated(issues: Issue[]): number {
  return issues.filter((i) => i.points === null && i.type !== 'Epic').length;
}

// ------------------------------------------------------------------ фильтры

export interface PlanningFilters {
  search: string;
  /** Идентификатор эпика: подходят сам эпик и задачи в нём. */
  epicId: string | null;
  /** Идентификатор исполнителя. */
  assigneeId: string | null;
  label: string | null;
  type: Issue['type'] | null;
  noEstimate: boolean;
  noAssignee: boolean;
}

export const NO_PLANNING_FILTERS: PlanningFilters = {
  search: '',
  epicId: null,
  assigneeId: null,
  label: null,
  type: null,
  noEstimate: false,
  noAssignee: false,
};

export function filtersActive(f: PlanningFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.epicId !== null ||
    f.assigneeId !== null ||
    f.label !== null ||
    f.type !== null ||
    f.noEstimate ||
    f.noAssignee
  );
}

/** Подходит ли задача под все условия (условия складываются по И). Поиск — по ключу и названию. */
export function matchesFilters(issue: Issue, key: string, f: PlanningFilters): boolean {
  const q = f.search.trim().toLowerCase();
  if (q !== '') {
    const text = `${key} ${issue.title}`.toLowerCase();
    if (!text.includes(q)) return false;
  }
  if (f.epicId !== null && issue.id !== f.epicId && issue.parentId !== f.epicId) return false;
  if (f.assigneeId !== null && issue.assigneeId !== f.assigneeId) return false;
  if (f.label !== null && !issue.labels.includes(f.label)) return false;
  if (f.type !== null && issue.type !== f.type) return false;
  if (f.noEstimate && !(issue.points === null && issue.type !== 'Epic')) return false;
  if (f.noAssignee && issue.assigneeId !== null) return false;
  return true;
}

/** Все метки задач, по алфавиту. */
export function allLabels(issues: Issue[]): string[] {
  return [...new Set(issues.flatMap((i) => i.labels))].sort((a, b) => a.localeCompare(b, 'ru'));
}

// ------------------------------------------------------------------ история

export interface ClosedSprint {
  sprint: Sprint;
  /** Выполненные задачи спринта (статус Done), по порядку номера. */
  done: Issue[];
  /** Velocity на момент закрытия (ADR-009). */
  velocity: number;
}

/** Закрытые спринты, от новых к старым (по дате окончания). */
export function closedSprints(
  sprints: Sprint[],
  issues: Issue[],
  history: History[],
): ClosedSprint[] {
  const bars = new Map(velocity(sprints, issues, history).bars.map((b) => [b.sprintId, b]));
  return sprints
    .filter((s) => s.state === 'closed')
    .sort((a, b) => b.end.localeCompare(a.end))
    .map((sprint) => ({
      sprint,
      done: issues
        .filter((i) => i.sprintId === sprint.id && i.status === 'Done')
        .sort((a, b) => a.number - b.number),
      velocity: bars.get(sprint.id)?.velocity ?? 0,
    }));
}

/** Сколько спринтов показывается сразу и сколько добавляется по кнопке «ещё». */
export const HISTORY_PAGE = 5;
