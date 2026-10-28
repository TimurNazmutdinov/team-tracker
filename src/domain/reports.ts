import type { History, Issue, Sprint } from './schema';
import { addDays } from './settings';
import { sprintIdAt, sprintIdBefore, sprintSnapshots, summarize, valuesAt } from './totals';

// Отчёты (F-14, F-15): burndown и velocity. Ничего не хранится: всё считается из задач и истории
// (ADR-003, ADR-009). Дни — календарные.

export interface BurndownDay {
  date: string;
  /** Идеальная линия: от объёма на конец первого дня до 0 в последний день. */
  ideal: number;
  /** Story points задач, которые в этот день были в спринте; null — данных ещё нет. */
  scope: number | null;
  /** Из них в Done к концу дня. */
  done: number | null;
  /** Остаток: scope − done; null — день ещё не наступил или спринт не начался. */
  remaining: number | null;
}

const MAX_DAYS = 366;

function dates(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = start; d <= end && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * Burndown спринта: остаток story points по дням. Состав спринта на каждый день восстанавливается из
 * событий `sprintId` (добавление, удаление, перенос), статус и points — из истории. У закрытого спринта
 * дни с момента закрытия показывают состояние на момент закрытия (до переноса незавершённого).
 */
export function burndown(
  sprint: Sprint,
  issues: Issue[],
  history: History[],
  today: string,
): BurndownDay[] {
  const days = dates(sprint.start, sprint.end);
  const rows = days.map((date) => {
    const empty = { date, scope: null, done: null, remaining: null } as const;
    if (sprint.state === 'planned' || (sprint.state === 'active' && date > today))
      return { ...empty };
    const t = `${date}T23:59:59Z`;
    const frozen = sprint.state === 'closed' && sprint.closedAt !== null && t >= sprint.closedAt;
    const at = frozen ? (sprint.closedAt as string) : t;
    let scope = 0;
    let done = 0;
    for (const issue of issues) {
      const member =
        (frozen ? sprintIdBefore(issue, history, at) : sprintIdAt(issue, history, at)) ===
        sprint.id;
      if (!member) continue;
      const values = valuesAt(issue, history, at);
      scope += values.points ?? 0;
      if (values.status === 'Done') done += values.points ?? 0;
    }
    return { date, scope, done, remaining: scope - done };
  });
  const initial = rows.find((r) => r.scope !== null)?.scope ?? 0;
  const last = Math.max(rows.length - 1, 1);
  return rows.map((r, i) => ({ ...r, ideal: Math.round(initial * (1 - i / last) * 100) / 100 }));
}

export interface VelocityBar {
  sprintId: string;
  name: string;
  /** Story points задач в Done: у закрытого спринта — на момент закрытия, у идущего — на сейчас. */
  velocity: number;
  /** Объём спринта в story points. */
  scope: number;
  state: 'closed' | 'active';
}

export interface VelocityReport {
  bars: VelocityBar[];
  /** Средняя velocity закрытых спринтов, одно знак после запятой; null, если закрытых нет. */
  average: number | null;
}

/** Velocity по закрытым спринтам (по дате окончания) и идущему спринту как «в процессе». */
export function velocity(sprints: Sprint[], issues: Issue[], history: History[]): VelocityReport {
  const bar = (s: Sprint): VelocityBar => {
    const total = summarize(sprintSnapshots(s, issues, history), []).total;
    return {
      sprintId: s.id,
      name: s.name,
      velocity: total.done,
      scope: total.points,
      state: s.state === 'closed' ? 'closed' : 'active',
    };
  };
  const closed = sprints
    .filter((s) => s.state === 'closed')
    .sort((a, b) => a.end.localeCompare(b.end))
    .map(bar);
  const active = sprints.filter((s) => s.state === 'active').map(bar);
  const average =
    closed.length === 0
      ? null
      : Math.round((closed.reduce((sum, b) => sum + b.velocity, 0) / closed.length) * 10) / 10;
  return { bars: [...closed, ...active], average };
}
