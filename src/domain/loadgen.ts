import type {
  Comment,
  Dataset,
  History,
  Issue,
  IssueType,
  Link,
  Person,
  Priority,
  Project,
  Sprint,
  Status,
} from './schema';

// Генератор нагрузочных данных (часть 2 доработок, ADR-015): много проектов, спринтов и задач с
// согласованной историей. Результат проходит parseDataset и воспроизводится по истории. Данные
// детерминированы: один и тот же набор параметров даёт тот же набор данных.

export interface LoadOptions {
  projects: number;
  /** Всего задач (включая Epic и Sub-task) на все проекты. */
  issues: number;
  /** Всего спринтов на все проекты (по пять на проект: три закрытых, идущий, запланированный). */
  sprints: number;
  people: number;
}

export const LOAD_DEFAULTS: LoadOptions = { projects: 10, issues: 10_000, sprints: 50, people: 40 };

const POINTS = [1, 2, 3, 5, 8, 13];
const PRIORITIES: Priority[] = ['Highest', 'High', 'Medium', 'Medium', 'Low'];
const LABELS = ['бэкенд', 'фронтенд', 'безопасность', 'заказы', 'тесты', 'отчёты'];
const WORKING: Status[] = ['To Do', 'In Progress', 'Review', 'Done'];

/** Простой детерминированный генератор псевдослучайных чисел (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoDay = (base: string, plus: number) =>
  new Date(Date.parse(`${base}T00:00:00Z`) + plus * 86_400_000).toISOString().slice(0, 10);

/** Ключ проекта: PA, PB, … PZ, PAA, … — только заглавные латинские буквы. */
function projectKey(n: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `P${letters[n % 26] ?? 'A'}${n >= 26 ? (letters[Math.floor(n / 26) % 26] ?? 'A') : ''}`;
}

export function generateLoadData(options: Partial<LoadOptions> = {}): Dataset {
  const o = { ...LOAD_DEFAULTS, ...options };
  const rand = rng(20261029);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;

  const people: Person[] = Array.from({ length: o.people }, (_, n) => ({
    id: `u${n + 1}`,
    name: `Участник ${n + 1}`,
    role: n % 8 === 0 ? 'Владелец продукта' : 'Разработчик',
  }));
  const someone = () => `u${1 + Math.floor(rand() * o.people)}`;

  const projects: Project[] = [];
  const sprints: Sprint[] = [];
  const issues: Issue[] = [];
  const links: Link[] = [];
  const comments: Comment[] = [];
  const history: History[] = [];
  let hid = 0;
  let cid = 0;
  let lid = 0;
  const event = (
    issueId: string,
    field: History['field'],
    from: string | null,
    to: string | null,
    at: string,
  ) => history.push({ id: `h${++hid}`, issueId, authorId: someone(), field, from, to, at });

  const perProject = Math.floor(o.issues / o.projects);
  const sprintsPerProject = Math.max(1, Math.floor(o.sprints / o.projects));

  for (let p = 0; p < o.projects; p += 1) {
    const projectId = `p${p + 1}`;
    const key = projectKey(p);
    projects.push({
      id: projectId,
      key,
      name: `Проект ${key}`,
      sprintDurationDays: 14,
      sprintPrefix: 'Спринт',
      nextSprintNumber: sprintsPerProject + 1,
      nextSprintStart: null,
    });

    // Спринты: все закрытые, кроме последних двух (идущий и запланированный)
    const projectSprints: Sprint[] = [];
    for (let s = 0; s < sprintsPerProject; s += 1) {
      const start = isoDay('2026-06-22', s * 14 - (sprintsPerProject - 2) * 14 + 4 * 14);
      const end = isoDay(start, 11);
      const closed = s < sprintsPerProject - 2;
      const active = s === sprintsPerProject - 2;
      const sprint: Sprint = {
        id: `s${p + 1}-${s + 1}`,
        projectId,
        name: `Спринт ${s + 1}`,
        goal: `Цель ${s + 1}`,
        start,
        end,
        state: closed ? 'closed' : active ? 'active' : 'planned',
        closedAt: closed ? `${end}T18:00:00Z` : null,
      };
      projectSprints.push(sprint);
    }
    sprints.push(...projectSprints);
    const closedSprints = projectSprints.filter((s) => s.state === 'closed');
    const activeSprint = projectSprints.find((s) => s.state === 'active');
    const plannedSprint = projectSprints.find((s) => s.state === 'planned');

    const order = new Map<string, number>();
    const nextOrder = (sprintId: string | null) => {
      const k = sprintId ?? 'backlog';
      const n = (order.get(k) ?? 0) + 1;
      order.set(k, n);
      return n;
    };
    const createdAt = '2026-06-15T10:00:00Z';
    const base: Pick<Issue, 'projectId' | 'description' | 'acceptance' | 'dueDate' | 'createdAt'> =
      {
        projectId,
        description: '',
        acceptance: '',
        dueDate: null,
        createdAt,
      };

    const epicCount = Math.max(1, Math.round(perProject * 0.03));
    const subCount = Math.round(perProject * 0.25);
    const mainCount = perProject - epicCount - subCount;
    let number = 0;
    const epics: Issue[] = [];
    const parents: Issue[] = [];

    const add = (
      type: IssueType,
      parentId: string | null,
      sprint: Sprint | null,
      status: Status,
    ): Issue => {
      number += 1;
      const id = `i${p + 1}-${number}`;
      const estimated = type === 'Story' || type === 'Task' || type === 'Bug';
      const issue: Issue = {
        ...base,
        id,
        number,
        type,
        title: `${type} ${key}-${number}: задача для проверки скорости`,
        status,
        priority: pick(PRIORITIES),
        points: estimated && rand() > 0.1 ? pick(POINTS) : null,
        assigneeId: type === 'Epic' || rand() < 0.15 ? null : someone(),
        reporterId: someone(),
        parentId,
        sprintId: sprint?.id ?? null,
        labels: rand() < 0.6 ? [pick(LABELS)] : [],
        order: nextOrder(sprint?.id ?? null),
        updatedAt: createdAt,
      };
      issues.push(issue);
      event(id, 'created', null, 'Backlog', createdAt);
      if (sprint) event(id, 'sprintId', null, sprint.id, `${sprint.start}T09:00:00Z`);
      if (status !== 'Backlog') {
        const path: Status[] =
          status === 'To Do'
            ? ['To Do']
            : status === 'In Progress'
              ? ['To Do', 'In Progress']
              : status === 'Review'
                ? ['To Do', 'In Progress', 'Review']
                : ['To Do', 'In Progress', 'Review', 'Done'];
        const from = sprint?.start ?? '2026-07-01';
        let prev: Status = 'Backlog';
        path.forEach((st, n) => {
          const day =
            sprint?.state === 'closed' ? isoDay(from, Math.min(n * 3, 10)) : isoDay(from, n);
          event(id, 'status', prev, st, `${day}T1${n}:00:00Z`);
          prev = st;
        });
      }
      return issue;
    };

    for (let e = 0; e < epicCount; e += 1) {
      epics.push(add('Epic', null, null, pick(['Backlog', 'In Progress'] as Status[])));
    }
    for (let n = 0; n < mainCount; n += 1) {
      const type: IssueType = pick(['Story', 'Task', 'Bug', 'Task'] as IssueType[]);
      const r = rand();
      let sprint: Sprint | null = null;
      let status: Status = 'Backlog';
      if (r < 0.45 && closedSprints.length > 0) {
        sprint = pick(closedSprints);
        status = 'Done';
      } else if (r < 0.6 && activeSprint) {
        sprint = activeSprint;
        status = pick(WORKING);
      } else if (r < 0.65 && plannedSprint) {
        sprint = plannedSprint;
      }
      const parent = rand() < 0.7 ? pick(epics) : null;
      parents.push(add(type, parent?.id ?? null, sprint, status));
    }
    for (let n = 0; n < subCount; n += 1) {
      const parent = pick(parents);
      const sprint = projectSprints.find((s) => s.id === parent.sprintId) ?? null;
      const status: Status =
        sprint?.state === 'closed' ? 'Done' : sprint ? pick(WORKING) : 'Backlog';
      add('Sub-task', parent.id, sprint, status);
    }

    // Связи и комментарии
    const mine = issues.filter((i) => i.projectId === projectId && i.type !== 'Epic');
    const seen = new Set<string>();
    for (let n = 0; n < Math.round(perProject * 0.1); n += 1) {
      const from = pick(mine);
      const to = pick(mine);
      const k = `${from.id}>${to.id}`;
      if (from.id === to.id || seen.has(k)) continue;
      seen.add(k);
      links.push({ id: `l${++lid}`, fromId: from.id, toId: to.id, type: 'relates' });
    }
    for (let n = 0; n < Math.round(perProject * 0.2); n += 1) {
      comments.push({
        id: `c${++cid}`,
        issueId: pick(mine).id,
        authorId: someone(),
        text: 'Комментарий для проверки скорости.',
        createdAt: '2026-07-10T12:00:00Z',
      });
    }
  }

  return { version: 1, projects, people, sprints, issues, links, comments, history };
}
