import type { View } from './actions';
import { epicProgress } from './progress';
import { STATUSES, type History, type Issue, type IssueType, type Status } from './schema';
import { addDays } from './settings';

// Аналитика (ADR-019): CFD, время цикла и выполнения, нагрузка, дорожная карта эпиков. Ничего не
// хранится: всё считается из задач, истории и спринтов. Расчёты работают на объединённых задачах и
// истории нескольких проектов — идентификаторы уникальны во всём наборе.

const DAY_MS = 86_400_000;
const MAX_DAYS = 400;

/** Границы периода «последние N дней», включая сегодня. */
export function periodRange(days: number, today: string): { from: string; to: string } {
  return { from: addDays(today, -(days - 1)), to: today };
}

function dayList(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d);
  return days;
}

interface StatusEvent {
  at: string;
  status: Status;
}

/** Смены статуса задач по порядку: создание и переходы. */
function statusTimelines(issues: Issue[], history: History[]): Map<string, StatusEvent[]> {
  const known = new Set(issues.map((i) => i.id));
  const map = new Map<string, StatusEvent[]>();
  history.forEach((h) => {
    if (!known.has(h.issueId)) return;
    if ((h.field !== 'status' && h.field !== 'created') || h.to === null) return;
    const list = map.get(h.issueId) ?? [];
    list.push({ at: h.at, status: h.to as Status });
    map.set(h.issueId, list);
  });
  for (const issue of issues) {
    const list = map.get(issue.id);
    // старые данные без истории: считаем, что задача была в текущем статусе с момента создания
    if (!list || list.length === 0)
      map.set(issue.id, [{ at: issue.createdAt, status: issue.status }]);
    else list.sort((a, b) => a.at.localeCompare(b.at));
  }
  return map;
}

// ------------------------------------------------------------------ CFD

export interface CfdDay {
  date: string;
  counts: Record<Status, number>;
  total: number;
}

const emptyCounts = () => Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;

/** Накопленная диаграмма потока: число задач в каждом статусе на конец каждого дня периода. */
export function cfd(issues: Issue[], history: History[], from: string, to: string): CfdDay[] {
  const days = dayList(from, to);
  const timelines = statusTimelines(issues, history);
  const rows: CfdDay[] = days.map((date) => ({ date, counts: emptyCounts(), total: 0 }));
  for (const issue of issues) {
    const events = timelines.get(issue.id) ?? [];
    let pointer = -1;
    for (const [i, day] of days.entries()) {
      const end = `${day}T23:59:59Z`;
      while (pointer + 1 < events.length && (events[pointer + 1] as StatusEvent).at <= end)
        pointer += 1;
      if (pointer < 0 || issue.createdAt > end) continue;
      const row = rows[i] as CfdDay;
      row.counts[(events[pointer] as StatusEvent).status] += 1;
      row.total += 1;
    }
  }
  return rows;
}

// ------------------------------------------------------------------ время цикла и выполнения

export interface TimedIssue {
  issueId: string;
  type: IssueType;
  /** От последнего входа в In Progress до Done, дни; null, если задача в работу не входила. */
  cycle: number | null;
  /** От создания до Done, дни. */
  lead: number;
  doneAt: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const daysBetween = (a: string, b: string) =>
  Math.max(0, round1((Date.parse(b) - Date.parse(a)) / DAY_MS));

/** Задачи, перешедшие в Done за период (Epic не учитываются), с временем цикла и выполнения. */
export function timedIssues(
  issues: Issue[],
  history: History[],
  from: string,
  to: string,
): TimedIssue[] {
  const timelines = statusTimelines(issues, history);
  const start = `${from}T00:00:00Z`;
  const end = `${to}T23:59:59Z`;
  const out: TimedIssue[] = [];
  for (const issue of issues) {
    if (issue.type === 'Epic' || issue.status !== 'Done') continue;
    const events = timelines.get(issue.id) ?? [];
    let doneIndex = -1;
    events.forEach((e, i) => {
      if (e.status === 'Done') doneIndex = i;
    });
    const done = events[doneIndex];
    if (!done || done.at < start || done.at > end) continue;
    // последний вход в Done: событие, после которого задача уже не покидала Done
    let enter = doneIndex;
    while (enter > 0 && (events[enter - 1] as StatusEvent).status === 'Done') enter -= 1;
    const doneAt = (events[enter] as StatusEvent).at;
    let progress: StatusEvent | undefined;
    for (let i = enter - 1; i >= 0; i -= 1) {
      if ((events[i] as StatusEvent).status === 'In Progress') {
        progress = events[i];
        // ищем начало последнего непрерывного пребывания в работе
        while (i > 0 && (events[i - 1] as StatusEvent).status === 'In Progress') {
          i -= 1;
          progress = events[i];
        }
        break;
      }
    }
    out.push({
      issueId: issue.id,
      type: issue.type,
      cycle: progress ? daysBetween(progress.at, doneAt) : null,
      lead: daysBetween(issue.createdAt, doneAt),
      doneAt,
    });
  }
  return out;
}

export interface TimeStats {
  count: number;
  average: number | null;
  median: number | null;
  /** 85-й процентиль: «в 85 % случаев задача завершается не позже». */
  p85: number | null;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)] as number;
}

export function timeStats(values: number[]): TimeStats {
  if (values.length === 0) return { count: 0, average: null, median: null, p85: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return {
    count: sorted.length,
    average: round1(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    median: round1(median),
    p85: round1(percentile(sorted, 0.85)),
  };
}

export interface HistogramBucket {
  label: string;
  /** Нижняя граница включительно, верхняя — исключительно; у последней корзины верхней нет. */
  from: number;
  to: number | null;
  count: number;
}

/** Распределение по корзинам с заданными нижними границами (по возрастанию, первая — 0). */
export function histogram(values: number[], edges: number[]): HistogramBucket[] {
  const buckets: HistogramBucket[] = edges.map((from, i) => {
    const to = edges[i + 1] ?? null;
    return { label: to === null ? `${from}+` : `${from}–${to}`, from, to, count: 0 };
  });
  for (const v of values) {
    const bucket = [...buckets].reverse().find((b) => v >= b.from);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export interface TypeStats {
  type: IssueType | 'Все';
  cycle: TimeStats;
  lead: TimeStats;
}

/** Статистика по всем завершённым задачам и по каждому типу, в котором они есть. */
export function statsByType(items: TimedIssue[]): TypeStats[] {
  const stats = (list: TimedIssue[]) => ({
    cycle: timeStats(list.flatMap((i) => (i.cycle === null ? [] : [i.cycle]))),
    lead: timeStats(list.map((i) => i.lead)),
  });
  const types = (['Story', 'Task', 'Bug', 'Sub-task'] as const).filter((t) =>
    items.some((i) => i.type === t),
  );
  return [
    { type: 'Все', ...stats(items) },
    ...types.map((type) => ({ type, ...stats(items.filter((i) => i.type === type)) })),
  ];
}

// ------------------------------------------------------------------ нагрузка

export interface WorkloadRow {
  personId: string | null;
  name: string;
  points: number;
  tasks: number;
  /** Story points по ключам проектов. */
  byProject: Record<string, number>;
}

export interface Workload {
  rows: WorkloadRow[];
  /** Среднее story points по людям, у которых есть нагрузка; null, если нет никого. */
  average: number | null;
}

const NOBODY = 'Не назначено';

/** Нагрузка: незавершённые задачи (кроме Epic) в идущих спринтах выбранных проектов, по людям. */
export function workload(views: View[]): Workload {
  const rows = new Map<string | null, WorkloadRow>();
  for (const view of views) {
    const active = new Set(view.sprints.filter((s) => s.state === 'active').map((s) => s.id));
    for (const issue of view.issues) {
      if (issue.type === 'Epic' || issue.status === 'Done') continue;
      if (issue.sprintId === null || !active.has(issue.sprintId)) continue;
      const person = view.people.find((p) => p.id === issue.assigneeId);
      const key = person ? person.id : null;
      const row = rows.get(key) ?? {
        personId: key,
        name: person ? person.name : NOBODY,
        points: 0,
        tasks: 0,
        byProject: {},
      };
      const points = issue.points ?? 0;
      row.points += points;
      row.tasks += 1;
      row.byProject[view.project.key] = (row.byProject[view.project.key] ?? 0) + points;
      rows.set(key, row);
    }
  }
  const sorted = [...rows.values()].sort(
    (a, b) =>
      Number(a.personId === null) - Number(b.personId === null) ||
      b.points - a.points ||
      a.name.localeCompare(b.name),
  );
  const assigned = sorted.filter((r) => r.personId !== null);
  const average =
    assigned.length === 0
      ? null
      : round1(assigned.reduce((sum, r) => sum + r.points, 0) / assigned.length);
  return { rows: sorted, average };
}

// ------------------------------------------------------------------ дорожная карта

export interface RoadmapTask {
  issueNumber: number;
  issueId: string;
  title: string;
  /** Спринт задачи; null — задача не в спринте. */
  start: string | null;
  end: string | null;
  status: Status;
}

export interface RoadmapEpic {
  projectKey: string;
  issueNumber: number;
  issueId: string;
  title: string;
  /** Полоса: от начала первого до конца последнего спринта задач эпика; null — нет задач в спринтах. */
  start: string | null;
  end: string | null;
  percent: number;
  status: Status;
  /** Задачи эпика (Story, Task, Bug) со своими спринтами: раскрываются под эпиком. */
  tasks: RoadmapTask[];
}

/** Эпики выбранных проектов с датами по спринтам их задач (включая подзадачи) и прогрессом. */
export function roadmap(views: View[]): RoadmapEpic[] {
  const out: RoadmapEpic[] = [];
  for (const view of views) {
    const sprints = new Map(view.sprints.map((s) => [s.id, s]));
    for (const epic of view.issues.filter((i) => i.type === 'Epic')) {
      const children = view.issues.filter((i) => i.parentId === epic.id);
      const ids = new Set(children.map((c) => c.id));
      const family = [
        ...children,
        ...view.issues.filter((i) => i.parentId !== null && ids.has(i.parentId)),
      ];
      let start: string | null = null;
      let end: string | null = null;
      for (const issue of family) {
        const sprint = issue.sprintId === null ? undefined : sprints.get(issue.sprintId);
        if (!sprint) continue;
        if (start === null || sprint.start < start) start = sprint.start;
        if (end === null || sprint.end > end) end = sprint.end;
      }
      if (start !== null && epic.dueDate !== null && epic.dueDate > (end ?? '')) end = epic.dueDate;
      out.push({
        projectKey: view.project.key,
        issueNumber: epic.number,
        issueId: epic.id,
        title: epic.title,
        start,
        end,
        percent: epicProgress(view.issues, epic.id).percent,
        status: epic.status,
        tasks: children
          .filter((c) => c.type !== 'Sub-task')
          .sort((a, b) => a.number - b.number)
          .map((c) => {
            const sprint = c.sprintId === null ? undefined : sprints.get(c.sprintId);
            return {
              issueNumber: c.number,
              issueId: c.id,
              title: c.title,
              start: sprint?.start ?? null,
              end: sprint?.end ?? null,
              status: c.status,
            };
          }),
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.projectKey.localeCompare(b.projectKey) ||
      Number(a.start === null) - Number(b.start === null) ||
      (a.start ?? '').localeCompare(b.start ?? '') ||
      a.issueNumber - b.issueNumber,
  );
}
