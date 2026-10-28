import {
  ISSUE_TYPES,
  PRIORITIES,
  type Issue,
  type IssueType,
  type Person,
  type Priority,
  type Sprint,
  type Status,
} from './schema';

// Доска спринта (F-10, F-11): чистые функции отбора карточек, группировки и подсчёта.
// Решения: ADR-004 (нет колонки Backlog, Sub-task — отдельные карточки), ADR-007.

/** Колонки доски: Backlog на доске не показывается (ADR-004, п. 1). */
export const BOARD_COLUMNS = [
  'To Do',
  'In Progress',
  'Review',
  'Done',
] as const satisfies readonly Status[];
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const GROUP_FIELDS = ['assignee', 'type', 'priority', 'parent'] as const;
export type GroupField = (typeof GROUP_FIELDS)[number];

export const GROUP_LABELS: Record<GroupField, string> = {
  assignee: 'Исполнитель',
  type: 'Тип',
  priority: 'Приоритет',
  parent: 'Родитель',
};

/** Название группы для задач без значения поля. */
export const UNSET = 'Не задано';

export interface Lane {
  key: string;
  title: string;
  /** Для группировки по исполнителю — человек (для аватара). */
  person?: Person;
  issues: Issue[];
}

export interface BoardFilters {
  type: IssueType | null;
  priority: Priority | null;
}

export const NO_BOARD_FILTERS: BoardFilters = { type: null, priority: null };

function byOrder(a: Issue, b: Issue): number {
  return a.order - b.order;
}

/** Задачи спринта, которые показываются на доске (статус не Backlog), по порядку. */
export function boardCards(issues: Issue[], sprintId: string): Issue[] {
  return issues.filter((i) => i.sprintId === sprintId && i.status !== 'Backlog').sort(byOrder);
}

/** Задачи спринта в статусе Backlog: на доске их нет, их нужно перевести в To Do. */
export function hiddenBacklogCards(issues: Issue[], sprintId: string): Issue[] {
  return issues.filter((i) => i.sprintId === sprintId && i.status === 'Backlog').sort(byOrder);
}

export function filterCards(cards: Issue[], filters: BoardFilters): Issue[] {
  return cards.filter(
    (i) =>
      (filters.type === null || i.type === filters.type) &&
      (filters.priority === null || i.priority === filters.priority),
  );
}

/** Группировка карточек по полю: только непустые группы; задачи без значения — в «Не задано» в конце. */
export function groupLanes(
  cards: Issue[],
  field: GroupField,
  ctx: { people: Person[]; issues: Issue[]; projectKey: string },
): Lane[] {
  const byId = new Map(ctx.issues.map((i) => [i.id, i]));
  const lanes = new Map<string, Lane>();
  const add = (key: string, title: string, issue: Issue, person?: Person) => {
    const lane = lanes.get(key) ?? { key, title, issues: [], ...(person ? { person } : {}) };
    lane.issues.push(issue);
    lanes.set(key, lane);
  };
  const order: string[] = [];

  switch (field) {
    case 'assignee':
      order.push(...ctx.people.map((p) => p.id));
      for (const c of cards) {
        const person = ctx.people.find((p) => p.id === c.assigneeId);
        if (person) add(person.id, person.name, c, person);
        else add(UNSET, UNSET, c);
      }
      break;
    case 'type':
      order.push(...ISSUE_TYPES);
      for (const c of cards) add(c.type, c.type, c);
      break;
    case 'priority':
      order.push(...PRIORITIES);
      for (const c of cards) add(c.priority, c.priority, c);
      break;
    case 'parent': {
      const parents = [
        ...new Set(cards.map((c) => c.parentId).filter((id): id is string => id !== null)),
      ]
        .map((id) => byId.get(id))
        .filter((p): p is Issue => p !== undefined)
        .sort((a, b) => a.number - b.number);
      order.push(...parents.map((p) => p.id));
      for (const c of cards) {
        const parent = c.parentId === null ? undefined : byId.get(c.parentId);
        if (parent) add(parent.id, `${ctx.projectKey}-${parent.number} ${parent.title}`, c);
        else add(UNSET, UNSET, c);
      }
      break;
    }
  }
  const rank = (key: string) => (key === UNSET ? Number.MAX_SAFE_INTEGER : order.indexOf(key));
  return [...lanes.values()].sort((a, b) => rank(a.key) - rank(b.key));
}

export interface Stats {
  count: number;
  points: number;
}

export function statsOf(cards: Issue[]): Stats {
  return { count: cards.length, points: cards.reduce((sum, i) => sum + (i.points ?? 0), 0) };
}

/** Число задач и points по колонкам. */
export function columnStats(cards: Issue[]): Record<BoardColumn, Stats> {
  return Object.fromEntries(
    BOARD_COLUMNS.map((c) => [c, statsOf(cards.filter((i) => i.status === c))]),
  ) as Record<BoardColumn, Stats>;
}

/** Спринт, который открывается на доске по умолчанию: идущий, иначе ближайший запланированный, иначе последний закрытый. */
export function defaultSprint(sprints: Sprint[]): Sprint | undefined {
  const active = sprints.find((s) => s.state === 'active');
  if (active) return active;
  const planned = sprints
    .filter((s) => s.state === 'planned')
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (planned) return planned;
  return sprints.filter((s) => s.state === 'closed').sort((a, b) => b.end.localeCompare(a.end))[0];
}

/** Спринты для выбора на доске: идущий, запланированные, затем закрытые (новые сверху). */
export function boardSprints(sprints: Sprint[]): Sprint[] {
  const rank = { active: 0, planned: 1, closed: 2 } as const;
  return [...sprints].sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (a.state === 'closed' ? b.end.localeCompare(a.end) : a.start.localeCompare(b.start)),
  );
}

export function isGroupField(value: string | null): value is GroupField {
  return value !== null && (GROUP_FIELDS as readonly string[]).includes(value);
}
