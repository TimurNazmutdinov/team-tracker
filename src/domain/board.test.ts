import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import {
  BOARD_COLUMNS,
  NO_BOARD_FILTERS,
  UNSET,
  boardCards,
  boardSprints,
  columnStats,
  defaultSprint,
  filterCards,
  groupLanes,
  hiddenBacklogCards,
  isGroupField,
  statsOf,
} from './board';
import type { Dataset, Issue } from './schema';

const ds = seed as unknown as Dataset;
const ctx = { people: ds.people, issues: ds.issues, projectKey: 'DEMO' };
const nums = (issues: Issue[]) => issues.map((i) => i.number);

describe('boardCards', () => {
  it('в карточки попадают задачи спринта, включая Sub-task, кроме статуса Backlog', () => {
    expect(nums(boardCards(ds.issues, 's2'))).toEqual([4, 5, 8, 9, 10, 13, 14, 15]);
    expect(nums(boardCards(ds.issues, 's1'))).toEqual([2, 3, 6, 7, 12, 16]);
    expect(BOARD_COLUMNS).not.toContain('Backlog');
  });

  it('задачи спринта в статусе Backlog на доске скрыты и перечисляются отдельно', () => {
    const issues = ds.issues.map((i) =>
      i.id === 'i10' ? { ...i, status: 'Backlog' as const } : i,
    );
    expect(nums(boardCards(issues, 's2'))).not.toContain(10);
    expect(nums(hiddenBacklogCards(issues, 's2'))).toEqual([10]);
    expect(hiddenBacklogCards(ds.issues, 's2')).toEqual([]);
  });
});

describe('filterCards', () => {
  const cards = boardCards(ds.issues, 's2');
  it('по типу и приоритету, по «и»', () => {
    expect(nums(filterCards(cards, NO_BOARD_FILTERS))).toEqual(nums(cards));
    expect(nums(filterCards(cards, { type: 'Sub-task', priority: null }))).toEqual([14, 15]);
    expect(nums(filterCards(cards, { type: null, priority: 'Highest' }))).toEqual([13]);
    expect(filterCards(cards, { type: 'Bug', priority: 'Low' })).toEqual([]);
  });
});

describe('groupLanes', () => {
  const cards = boardCards(ds.issues, 's2');
  const lanes = (field: Parameters<typeof groupLanes>[1], list = cards) =>
    groupLanes(list, field, ctx).map((l) => [l.title, nums(l.issues)]);

  it('по исполнителю: порядок как в списке людей, у группы есть человек', () => {
    expect(lanes('assignee')).toEqual([
      ['Анна Ковалёва', [15]],
      ['Игорь Смирнов', [4, 9, 14]],
      ['Мария Орлова', [5, 8, 10, 13]],
    ]);
    expect(groupLanes(cards, 'assignee', ctx)[0]?.person?.id).toBe('u1');
  });

  it('по типу и приоритету: порядок по справочнику', () => {
    expect(lanes('type')).toEqual([
      ['Story', [4, 5]],
      ['Task', [8, 9, 10]],
      ['Bug', [13]],
      ['Sub-task', [14, 15]],
    ]);
    expect(lanes('priority').map(([t]) => t)).toEqual(['Highest', 'High', 'Medium', 'Low']);
  });

  it('по родителю: подзадачи под своей Task, остальные под Epic', () => {
    expect(lanes('parent')).toEqual([
      ['DEMO-1 Личный кабинет клиента', [4, 5, 8, 9, 10, 13]],
      ['DEMO-9 Форма смены пароля', [14, 15]],
    ]);
  });

  it('задачи без значения попадают в «Не задано» в конце', () => {
    const noOne = cards.map((i) =>
      i.id === 'i4' ? { ...i, assigneeId: null, parentId: null } : i,
    );
    const assignee = groupLanes(noOne, 'assignee', ctx);
    expect(assignee.at(-1)).toMatchObject({ key: UNSET, title: UNSET });
    expect(nums(assignee.at(-1)?.issues ?? [])).toEqual([4]);
    expect(lanes('parent', noOne).at(-1)).toEqual([UNSET, [4]]);
  });

  it('пустые группы не показываются', () => {
    expect(groupLanes([], 'assignee', ctx)).toEqual([]);
  });
});

describe('подсчёт и выбор спринта', () => {
  it('число задач и points по колонкам', () => {
    const stats = columnStats(boardCards(ds.issues, 's2'));
    expect(stats).toEqual({
      'To Do': { count: 3, points: 10 },
      'In Progress': { count: 3, points: 8 },
      Review: { count: 2, points: 3 },
      Done: { count: 0, points: 0 },
    });
    expect(statsOf([])).toEqual({ count: 0, points: 0 });
  });

  it('спринт по умолчанию: идущий, иначе запланированный, иначе последний закрытый', () => {
    expect(defaultSprint(ds.sprints)?.id).toBe('s2');
    const [s1, s2] = ds.sprints;
    if (!s1 || !s2) throw new Error('нет спринтов');
    expect(defaultSprint([s1])?.id).toBe('s1');
    expect(defaultSprint([s1, { ...s2, state: 'planned' }])?.id).toBe('s2');
    expect(defaultSprint([])).toBeUndefined();
  });

  it('список спринтов для выбора: идущий, запланированные, закрытые', () => {
    expect(boardSprints(ds.sprints).map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('isGroupField', () => {
    expect(isGroupField('parent')).toBe(true);
    expect(isGroupField('label')).toBe(false);
    expect(isGroupField(null)).toBe(false);
  });
});
