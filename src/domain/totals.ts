import {
  STATUSES,
  type History,
  type Issue,
  type Person,
  type Sprint,
  type Status,
} from './schema';

// Состояние задач и итоги спринта. Итоги не хранятся — считаются из задач и истории (ADR-003).
// Состав закрытого спринта заморожен: он восстанавливается по истории на момент закрытия.

/** Значения задачи на некоторый момент. */
export interface Snapshot {
  issue: Issue;
  status: Status;
  assigneeId: string | null;
  points: number | null;
}

/**
 * События истории по задачам. Индекс строится один раз для массива истории и запоминается, поэтому
 * расчёт по тысячам задач не перебирает всю историю заново для каждой (ADR-015: скорость).
 * Порядок событий внутри задачи сохраняется — он нужен для равных моментов.
 */
const indexCache = new WeakMap<History[], { length: number; byIssue: Map<string, History[]> }>();

function eventsOf(history: History[], issueId: string): History[] {
  let cached = indexCache.get(history);
  if (!cached || cached.length !== history.length) {
    const byIssue = new Map<string, History[]>();
    for (const h of history) {
      const list = byIssue.get(h.issueId);
      if (list) list.push(h);
      else byIssue.set(h.issueId, [h]);
    }
    cached = { length: history.length, byIssue };
    indexCache.set(history, cached);
  }
  return cached.byIssue.get(issueId) ?? [];
}

/** События в обратном порядке: новые сверху; при равных моментах — позднее записанные раньше. */
function newestFirst(events: History[]): History[] {
  return events
    .map((h, i) => ({ h, i }))
    .sort((a, b) => b.h.at.localeCompare(a.h.at) || b.i - a.i)
    .map(({ h }) => h);
}

/** Статус, исполнитель и points задачи на момент `t` (включительно): откат событий после него. */
export function valuesAt(issue: Issue, events: History[], t: string): Snapshot {
  const snap: Snapshot = {
    issue,
    status: issue.status,
    assigneeId: issue.assigneeId,
    points: issue.points,
  };
  for (const e of newestFirst(eventsOf(events, issue.id).filter((h) => h.at > t))) {
    if (e.field === 'status' && e.from !== null) snap.status = e.from as Status;
    if (e.field === 'assigneeId') snap.assigneeId = e.from;
    if (e.field === 'points') snap.points = e.from === null ? null : Number(e.from);
  }
  return snap;
}

/** Спринт задачи на момент `t` (включительно): откат событий смены спринта после него. */
export function sprintIdAt(issue: Issue, events: History[], t: string): string | null {
  let sprintId = issue.sprintId;
  for (const e of newestFirst(
    eventsOf(events, issue.id).filter((h) => h.field === 'sprintId' && h.at > t),
  )) {
    sprintId = e.from;
  }
  return sprintId;
}

/** Спринт задачи непосредственно перед моментом `t` (события в момент `t` уже не учитываются). */
export function sprintIdBefore(issue: Issue, events: History[], t: string): string | null {
  let sprintId = issue.sprintId;
  for (const e of newestFirst(
    eventsOf(events, issue.id).filter((h) => h.field === 'sprintId' && h.at >= t),
  )) {
    sprintId = e.from;
  }
  return sprintId;
}

/**
 * Задачи спринта со значениями на нужный момент. У идущего и запланированного спринта — текущие;
 * у закрытого — состав и значения на момент закрытия (до переноса незавершённых).
 */
export function sprintSnapshots(sprint: Sprint, issues: Issue[], history: History[]): Snapshot[] {
  const items =
    sprint.state === 'closed' && sprint.closedAt
      ? issues
          .filter((i) => sprintIdBefore(i, history, sprint.closedAt as string) === sprint.id)
          .map((i) => valuesAt(i, history, sprint.closedAt as string))
      : issues
          .filter((i) => i.sprintId === sprint.id)
          .map((i): Snapshot => ({
            issue: i,
            status: i.status,
            assigneeId: i.assigneeId,
            points: i.points,
          }));
  return items.sort((a, b) => a.issue.order - b.issue.order);
}

export interface PersonRow {
  personId: string | null;
  name: string;
  count: number;
  points: number;
  done: number;
}

export interface SprintSummary {
  rows: PersonRow[];
  total: { count: number; points: number; done: number };
  /** Story points по статусам. */
  byStatus: Record<Status, number>;
}

const NOBODY = 'Не назначено';

/** Итоги по людям и по спринту: задач, story points, из них в Done. */
export function summarize(snaps: Snapshot[], people: Person[]): SprintSummary {
  const rows = new Map<string | null, PersonRow>();
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const total = { count: 0, points: 0, done: 0 };
  for (const s of snaps) {
    const person = people.find((p) => p.id === s.assigneeId);
    const key = person ? person.id : null;
    const row = rows.get(key) ?? {
      personId: key,
      name: person ? person.name : NOBODY,
      count: 0,
      points: 0,
      done: 0,
    };
    const points = s.points ?? 0;
    row.count += 1;
    row.points += points;
    if (s.status === 'Done') row.done += points;
    rows.set(key, row);
    byStatus[s.status] += points;
    total.count += 1;
    total.points += points;
    if (s.status === 'Done') total.done += points;
  }
  const sorted = [...rows.values()].sort(
    (a, b) =>
      Number(a.personId === null) - Number(b.personId === null) ||
      b.points - a.points ||
      a.name.localeCompare(b.name),
  );
  return { rows: sorted, total, byStatus };
}

/** Строки по всем людям проекта (в том числе без задач в спринте) и отдельная строка «Не назначено», если она нужна. */
export function peopleRows(snaps: Snapshot[], people: Person[]): PersonRow[] {
  const rows = summarize(snaps, people).rows;
  const missing: PersonRow[] = people
    .filter((p) => !rows.some((r) => r.personId === p.id))
    .map((p) => ({ personId: p.id, name: p.name, count: 0, points: 0, done: 0 }));
  const withZeros = [...rows, ...missing];
  return withZeros.sort(
    (a, b) =>
      Number(a.personId === null) - Number(b.personId === null) ||
      b.points - a.points ||
      a.name.localeCompare(b.name),
  );
}
