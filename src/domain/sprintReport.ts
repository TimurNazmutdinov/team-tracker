import type { View } from './actions';
import { adjustedCapacity, sprintAvailability, type AdjustedCapacity } from './availability';
import { sprintCapacity } from './planning';
import { burndown, type BurndownDay } from './reports';
import { RETRO_LABELS, retroOf } from './retro';
import type { History, RetroItem, Sprint, Status } from './schema';
import { sprintSnapshots, summarize, type PersonRow, type SprintSummary } from './totals';

// Отчёт спринта (ADR-018): цель, выполнено и перенесено, velocity, burndown, итоги по людям,
// ретроспектива. Ничего не хранится — считается из задач, истории и записей ретроспективы.

export interface ReportIssue {
  key: string;
  title: string;
  status: Status;
  assignee: string;
  points: number | null;
}

export interface SprintReport {
  sprint: Sprint;
  projectKey: string;
  done: ReportIssue[];
  /** Задачи спринта не в Done: у закрытого спринта — перенесённые при закрытии. */
  carried: ReportIssue[];
  total: { count: number; points: number; done: number; carried: number };
  /** Velocity: story points задач в Done. */
  velocity: number;
  capacity: AdjustedCapacity;
  people: PersonRow[];
  summary: SprintSummary;
  burndown: BurndownDay[];
  retro: RetroItem[];
}

export function sprintReport(
  view: View,
  sprint: Sprint,
  history: History[],
  today: string,
): SprintReport {
  const snaps = sprintSnapshots(sprint, view.issues, history);
  const summary = summarize(snaps, view.people);
  const nameOf = (id: string | null) =>
    view.people.find((p) => p.id === id)?.name ?? 'Не назначено';
  const row = (s: (typeof snaps)[number]): ReportIssue => ({
    key: `${view.project.key}-${s.issue.number}`,
    title: s.issue.title,
    status: s.status,
    assignee: nameOf(s.assigneeId),
    points: s.points,
  });
  const done = snaps.filter((s) => s.status === 'Done').map(row);
  const carried = snaps.filter((s) => s.status !== 'Done').map(row);
  // ёмкость — по спринтам, закончившимся до начала этого, как её видел планирующий
  const earlier = view.sprints.filter((s) => s.end < sprint.start);
  const capacity = adjustedCapacity(
    sprintCapacity(earlier, view.issues, history),
    sprintAvailability(view, sprint),
  );
  return {
    sprint,
    projectKey: view.project.key,
    done,
    carried,
    total: {
      ...summary.total,
      carried: summary.total.points - summary.total.done,
    },
    velocity: summary.total.done,
    capacity,
    people: summary.rows,
    summary,
    burndown: burndown(sprint, view.issues, history, today),
    retro: retroOf(view, sprint.id),
  };
}

type Cell = string | number | null;

export interface ReportSheet {
  name: string;
  rows: Cell[][];
}

const STATE_LABELS = { planned: 'запланирован', active: 'идёт', closed: 'закрыт' } as const;

/** Листы Excel-отчёта: «Сводка», «Задачи», «Люди», «Burndown», «Ретроспектива». Первая строка — заголовки. */
export function reportSheets(
  report: SprintReport,
  lookup: { authors: Map<string, string>; issueKeys: Map<string, string> },
): ReportSheet[] {
  const { sprint, capacity } = report;
  const availability = capacity.availability;
  const summary: Cell[][] = [
    ['Параметр', 'Значение'],
    ['Проект', report.projectKey],
    ['Спринт', sprint.name],
    ['Состояние', STATE_LABELS[sprint.state]],
    ['Даты', `${sprint.start} – ${sprint.end}`],
    ['Цель', sprint.goal],
    ['Задач в спринте', report.total.count],
    ['Story points в спринте', report.total.points],
    ['Выполнено, sp', report.total.done],
    ['Перенесено / не завершено, sp', report.total.carried],
    ['Velocity, sp', report.velocity],
    ['Ёмкость по velocity, sp', capacity.base],
    ['Доступность команды, %', Math.round(availability.ratio * 100)],
    ['Ёмкость с учётом доступности, sp', capacity.value],
  ];
  const issues: Cell[][] = [
    ['Задача', 'Название', 'Статус', 'Исполнитель', 'Story points', 'Итог'],
    ...report.done.map((i): Cell[] => [
      i.key,
      i.title,
      i.status,
      i.assignee,
      i.points,
      'выполнена',
    ]),
    ...report.carried.map((i): Cell[] => [
      i.key,
      i.title,
      i.status,
      i.assignee,
      i.points,
      sprint.state === 'closed' ? 'перенесена' : 'не завершена',
    ]),
  ];
  const people: Cell[][] = [
    ['Человек', 'Задач', 'Story points', 'Выполнено, sp'],
    ...report.people.map((p): Cell[] => [p.name, p.count, p.points, p.done]),
  ];
  const days: Cell[][] = [
    ['Дата', 'Идеальная линия', 'Объём, sp', 'Выполнено, sp', 'Остаток, sp'],
    ...report.burndown.map((d): Cell[] => [d.date, d.ideal, d.scope, d.done, d.remaining]),
  ];
  const retro: Cell[][] = [
    ['Список', 'Текст', 'Автор', 'Задача'],
    ...report.retro.map((r): Cell[] => [
      RETRO_LABELS[r.kind],
      r.text,
      lookup.authors.get(r.authorId) ?? '',
      r.issueId ? (lookup.issueKeys.get(r.issueId) ?? '') : '',
    ]),
  ];
  return [
    { name: 'Сводка', rows: summary },
    { name: 'Задачи', rows: issues },
    { name: 'Люди', rows: people },
    { name: 'Burndown', rows: days },
    { name: 'Ретроспектива', rows: retro },
  ];
}
