import {
  ISSUE_TYPES,
  PRIORITIES,
  type Issue,
  type IssueType,
  type Link,
  type Person,
  type Priority,
  type Sprint,
  type Status,
} from './schema';
import {
  DEFAULT_STATUSES,
  boardStatuses,
  isBacklogStatus,
  isDoneStatus,
  type Statuses,
} from './statuses';

// Доска спринта (F-10, F-11): чистые функции отбора карточек, группировки и подсчёта.
// Решения: ADR-004 (нет колонки Backlog, Sub-task — отдельные карточки), ADR-007.

/**
 * Колонки доски по умолчанию: Backlog на доске не показывается (ADR-004, п. 1). Настоящие колонки —
 * данные (ADR-024): `boardStatuses(statuses)`.
 */
export const BOARD_COLUMNS: readonly Status[] = boardStatuses(DEFAULT_STATUSES).map((s) => s.id);
/** Идентификатор колонки доски. */
export type BoardColumn = Status;

/** Дорожки доски (D-5): по эпикам, исполнителям, типу, приоритету, родителю или без дорожек. */
export const GROUP_FIELDS = ['epic', 'assignee', 'type', 'priority', 'parent', 'none'] as const;
export type GroupField = (typeof GROUP_FIELDS)[number];

export const GROUP_LABELS: Record<GroupField, string> = {
  epic: 'По эпикам',
  assignee: 'По исполнителям',
  type: 'По типу',
  priority: 'По приоритету',
  parent: 'По родителю',
  none: 'Без дорожек',
};

/** Ключ единственной дорожки «без дорожек»: её заголовок не показывается. */
export const ALL_LANE = '__all__';

/** Ключ группы для задач без значения поля; название зависит от поля группировки. */
export const UNSET = 'Не задано';

export interface Lane {
  key: string;
  title: string;
  /** Для группировки по исполнителю — человек (для аватара). */
  person?: Person;
  /** Для дорожек по эпикам — сам эпик (цвет, прогресс). */
  epic?: Issue;
  issues: Issue[];
}

/** Как сочетать выбранные метки: любая из них (ИЛИ) или все сразу (И). */
export type LabelMode = 'any' | 'all';

/** Фильтры доски: списки и быстрые фильтры-чипы (D-2). */
export interface BoardFilters {
  type: IssueType | null;
  priority: Priority | null;
  /** Только задачи текущего пользователя. */
  mine: boolean;
  /** Только задачи, которые ждут незавершённую блокирующую задачу. */
  blocked: boolean;
  /** Только задачи без исполнителя. */
  unassigned: boolean;
  labels: string[];
  labelMode: LabelMode;
}

export const NO_BOARD_FILTERS: BoardFilters = {
  type: null,
  priority: null,
  mine: false,
  blocked: false,
  unassigned: false,
  labels: [],
  labelMode: 'any',
};

/** Что нужно фильтрам, кроме самих задач. */
export interface FilterContext {
  /** Человек текущего пользователя для «Только мои». */
  meId?: string | null | undefined;
  /** Задачи, которые ждут незавершённые блокирующие. */
  blockedIds?: ReadonlySet<string> | undefined;
}

export function filtersActive(f: BoardFilters): boolean {
  return (
    f.type !== null ||
    f.priority !== null ||
    f.mine ||
    f.blocked ||
    f.unassigned ||
    f.labels.length > 0
  );
}

/** Фильтры из адреса страницы: ссылку с выбранными чипами можно отправить коллеге. */
export function filtersFromParams(params: URLSearchParams): BoardFilters {
  const type = params.get('type');
  const priority = params.get('prio');
  const quick = new Set((params.get('q') ?? '').split(',').filter(Boolean));
  const labels = (params.get('labels') ?? '').split('|').filter(Boolean);
  return {
    type: ISSUE_TYPES.includes(type as IssueType) ? (type as IssueType) : null,
    priority: PRIORITIES.includes(priority as Priority) ? (priority as Priority) : null,
    mine: quick.has('mine'),
    blocked: quick.has('blocked'),
    unassigned: quick.has('unassigned'),
    labels,
    labelMode: params.get('lm') === 'all' ? 'all' : 'any',
  };
}

/** Записать фильтры в адрес; пустые значения убираются. */
export function filtersToParams(f: BoardFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const set = (key: string, value: string | null) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  set('type', f.type);
  set('prio', f.priority);
  const quick = [f.mine && 'mine', f.blocked && 'blocked', f.unassigned && 'unassigned'].filter(
    Boolean,
  );
  set('q', quick.join(','));
  set('labels', f.labels.join('|'));
  set('lm', f.labels.length > 1 && f.labelMode === 'all' ? 'all' : null);
  return next;
}

/** Незавершённые блокирующие задачи для каждой задачи (связь «блокирует», D-10). */
export function openBlockers(
  issues: readonly Issue[],
  links: readonly Link[],
  statuses: Statuses = DEFAULT_STATUSES,
): Map<string, Issue[]> {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const out = new Map<string, Issue[]>();
  for (const l of links) {
    if (l.type !== 'blocks') continue;
    const from = byId.get(l.fromId);
    const to = byId.get(l.toId);
    if (!from || !to || isDoneStatus(statuses, from.status) || isDoneStatus(statuses, to.status))
      continue;
    out.set(to.id, [...(out.get(to.id) ?? []), from]);
  }
  return out;
}

/** Эпик верхнего уровня задачи (через под-эпик и родителя); null — задача вне эпика. */
export function epicOf(issue: Issue, byId: ReadonlyMap<string, Issue>): Issue | null {
  let current: Issue | undefined = issue;
  for (let guard = 0; current && guard < 10; guard++) {
    if (current.type === 'Epic') return current === issue ? null : current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}

function byOrder(a: Issue, b: Issue): number {
  return a.order - b.order;
}

/** Задачи спринта, которые показываются на доске (колонка не «бэклог»), по порядку. */
export function boardCards(
  issues: Issue[],
  sprintId: string,
  statuses: Statuses = DEFAULT_STATUSES,
): Issue[] {
  return issues
    .filter((i) => i.sprintId === sprintId && !isBacklogStatus(statuses, i.status))
    .sort(byOrder);
}

/** Задачи спринта в колонке «бэклог»: на доске их нет, их нужно перевести в первую колонку. */
export function hiddenBacklogCards(
  issues: Issue[],
  sprintId: string,
  statuses: Statuses = DEFAULT_STATUSES,
): Issue[] {
  return issues
    .filter((i) => i.sprintId === sprintId && isBacklogStatus(statuses, i.status))
    .sort(byOrder);
}

export function filterCards(
  cards: Issue[],
  filters: BoardFilters,
  ctx: FilterContext = {},
): Issue[] {
  const wanted = filters.labels.map((l) => l.toLocaleLowerCase('ru'));
  return cards.filter((i) => {
    if (filters.type !== null && i.type !== filters.type) return false;
    if (filters.priority !== null && i.priority !== filters.priority) return false;
    if (filters.mine && (!ctx.meId || i.assigneeId !== ctx.meId)) return false;
    if (filters.unassigned && i.assigneeId !== null) return false;
    if (filters.blocked && !ctx.blockedIds?.has(i.id)) return false;
    if (wanted.length > 0) {
      const own = new Set(i.labels.map((l) => l.toLocaleLowerCase('ru')));
      const hit =
        filters.labelMode === 'all'
          ? wanted.every((l) => own.has(l))
          : wanted.some((l) => own.has(l));
      if (!hit) return false;
    }
    return true;
  });
}

/** Группировка карточек по полю: только непустые группы; задачи без значения — в «Не назначен» (исполнитель) или «Без родителя» в конце. */
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
    case 'none':
      for (const c of cards) add(ALL_LANE, 'Все задачи', c);
      break;
    case 'epic': {
      const epics = new Map<string, Issue>();
      for (const c of cards) {
        const epic = epicOf(c, byId);
        if (epic) {
          epics.set(epic.id, epic);
          const lane = lanes.get(epic.id) ?? {
            key: epic.id,
            title: `${ctx.projectKey}-${epic.number} ${epic.title}`,
            epic,
            issues: [],
          };
          lane.issues.push(c);
          lanes.set(epic.id, lane);
        } else add(UNSET, 'Без эпика', c);
      }
      order.push(...[...epics.values()].sort(byOrder).map((e) => e.id));
      break;
    }
    case 'assignee':
      order.push(...ctx.people.map((p) => p.id));
      for (const c of cards) {
        const person = ctx.people.find((p) => p.id === c.assigneeId);
        if (person) add(person.id, person.name, c, person);
        else add(UNSET, 'Не назначен', c);
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
        else add(UNSET, 'Без родителя', c);
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

/** Число задач и points по колонкам; задачи в неизвестной колонке не теряются — для них своя запись. */
export function columnStats(
  cards: Issue[],
  columns: readonly Status[] = BOARD_COLUMNS,
): Record<BoardColumn, Stats> {
  const ids = [...new Set([...columns, ...cards.map((i) => i.status)])];
  return Object.fromEntries(
    ids.map((c) => [c, statsOf(cards.filter((i) => i.status === c))]),
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
