import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import {
  cfd,
  histogram,
  periodRange,
  roadmap,
  statsByType,
  timeStats,
  timedIssues,
  workload,
} from './analytics';
import { parseDataset } from './dataset';
import type { History, Issue } from './schema';
import { viewOf } from './testing';

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  projectId: 'p1',
  number: Number(id.replace(/\D/g, '')) || 1,
  type: 'Task',
  title: id,
  description: '',
  acceptance: '',
  status: 'Done',
  priority: 'Medium',
  points: 3,
  assigneeId: null,
  reporterId: 'u1',
  parentId: null,
  sprintId: null,
  labels: [],
  order: 0,
  dueDate: null,
  createdAt: '2026-10-01T09:00:00Z',
  updatedAt: '2026-10-01T09:00:00Z',
  ...over,
});
let n = 0;
const ev = (
  issueId: string,
  field: History['field'],
  to: string,
  at: string,
  from: string | null = null,
): History => ({
  id: `h${++n}`,
  issueId,
  authorId: 'u1',
  field,
  from,
  to,
  at,
});

describe('periodRange', () => {
  it('последние N дней включая сегодня', () => {
    expect(periodRange(3, '2026-10-10')).toEqual({ from: '2026-10-08', to: '2026-10-10' });
  });
});

describe('cfd', () => {
  const issues = [
    issue('i1'),
    issue('i2', { status: 'In Progress', createdAt: '2026-10-02T09:00:00Z' }),
  ];
  const history = [
    ev('i1', 'created', 'To Do', '2026-10-01T09:00:00Z'),
    ev('i1', 'status', 'In Progress', '2026-10-02T10:00:00Z', 'To Do'),
    ev('i1', 'status', 'Done', '2026-10-03T10:00:00Z', 'In Progress'),
    ev('i2', 'created', 'To Do', '2026-10-02T09:00:00Z'),
    ev('i2', 'status', 'In Progress', '2026-10-03T08:00:00Z', 'To Do'),
  ];
  const rows = cfd(issues, history, '2026-09-30', '2026-10-04');

  it('считает задачи по статусам на конец дня', () => {
    expect(rows.map((r) => r.total)).toEqual([0, 1, 2, 2, 2]);
    expect(rows[1]?.counts['To Do']).toBe(1);
    expect(rows[2]?.counts).toMatchObject({ 'In Progress': 1, 'To Do': 1 });
    expect(rows[3]?.counts).toMatchObject({ Done: 1, 'In Progress': 1 });
  });
  it('сумма статусов равна числу существующих задач', () => {
    for (const r of rows) {
      expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(r.total);
    }
  });
  it('задача без истории считается в текущем статусе с момента создания', () => {
    const r = cfd([issue('x1', { status: 'Review' })], [], '2026-10-01', '2026-10-02');
    expect(r[0]?.counts.Review).toBe(1);
  });
});

describe('время цикла и выполнения', () => {
  const issues = [
    issue('i1'),
    issue('i2'),
    issue('i3', { status: 'Review' }),
    issue('i4', { type: 'Bug' }),
  ];
  const history = [
    ev('i1', 'created', 'To Do', '2026-10-01T09:00:00Z'),
    ev('i1', 'status', 'In Progress', '2026-10-02T09:00:00Z'),
    ev('i1', 'status', 'Done', '2026-10-05T09:00:00Z'),
    // i2: вернули из Done и закрыли снова — считается последний вход
    ev('i2', 'created', 'To Do', '2026-10-01T09:00:00Z'),
    ev('i2', 'status', 'In Progress', '2026-10-01T12:00:00Z'),
    ev('i2', 'status', 'Done', '2026-10-02T12:00:00Z'),
    ev('i2', 'status', 'In Progress', '2026-10-03T12:00:00Z'),
    ev('i2', 'status', 'Done', '2026-10-04T12:00:00Z'),
    ev('i3', 'created', 'To Do', '2026-10-01T09:00:00Z'),
    // i4 закрыта вне периода
    ev('i4', 'created', 'To Do', '2026-08-01T09:00:00Z'),
    ev('i4', 'status', 'Done', '2026-08-02T09:00:00Z'),
  ];
  const items = timedIssues(issues, history, '2026-10-01', '2026-10-31');

  it('берёт только завершённые за период', () => {
    expect(items.map((i) => i.issueId).sort()).toEqual(['i1', 'i2']);
  });
  it('цикл — от последнего входа в работу, выполнение — от создания', () => {
    const i1 = items.find((i) => i.issueId === 'i1');
    expect(i1).toMatchObject({ cycle: 3, lead: 4 });
    const i2 = items.find((i) => i.issueId === 'i2');
    expect(i2).toMatchObject({ cycle: 1, lead: 3.1 });
  });
  it('задача без входа в работу: цикла нет, выполнение есть', () => {
    const r = timedIssues(
      [issue('j1')],
      [
        ev('j1', 'created', 'To Do', '2026-10-01T09:00:00Z'),
        ev('j1', 'status', 'Done', '2026-10-02T09:00:00Z'),
      ],
      '2026-10-01',
      '2026-10-31',
    );
    expect(r[0]).toMatchObject({ cycle: null, lead: 1 });
  });
  it('Epic не учитываются', () => {
    expect(
      timedIssues(
        [issue('e1', { type: 'Epic' })],
        [ev('e1', 'created', 'Done', '2026-10-02T09:00:00Z')],
        '2026-10-01',
        '2026-10-31',
      ),
    ).toEqual([]);
  });
});

describe('статистика', () => {
  it('среднее, медиана и 85-й процентиль', () => {
    expect(timeStats([])).toEqual({ count: 0, average: null, median: null, p85: null });
    expect(timeStats([1, 2, 3, 4, 10])).toEqual({ count: 5, average: 4, median: 3, p85: 10 });
    expect(timeStats([2, 4])).toMatchObject({ median: 3, p85: 4 });
  });
  it('распределение по корзинам', () => {
    const h = histogram([0.5, 1, 1.5, 4, 20], [0, 1, 3, 8]);
    expect(h.map((b) => [b.label, b.count])).toEqual([
      ['0–1', 1],
      ['1–3', 2],
      ['3–8', 1],
      ['8+', 1],
    ]);
  });
  it('по типам: «Все» и каждый присутствующий тип', () => {
    const s = statsByType([
      { issueId: 'a', type: 'Bug', cycle: 1, lead: 2, doneAt: '' },
      { issueId: 'b', type: 'Story', cycle: null, lead: 6, doneAt: '' },
    ]);
    expect(s.map((x) => x.type)).toEqual(['Все', 'Story', 'Bug']);
    expect(s[0]?.cycle.count).toBe(1);
    expect(s[0]?.lead.count).toBe(2);
  });
});

describe('на данных seed', () => {
  const parsed = parseDataset(seed);
  if (!parsed.ok) throw new Error('seed не разобран');
  const ds = parsed.data;
  const view = viewOf(ds, 'p1');

  it('нагрузка: незавершённые задачи идущего спринта по людям, сумма сходится', () => {
    const w = workload([view]);
    const active = view.sprints.find((s) => s.state === 'active');
    const expected = view.issues
      .filter((i) => i.sprintId === active?.id && i.status !== 'Done' && i.type !== 'Epic')
      .reduce((a, i) => a + (i.points ?? 0), 0);
    expect(w.rows.reduce((a, r) => a + r.points, 0)).toBe(expected);
    expect(
      w.rows.every((r) => Object.values(r.byProject).reduce((a, b) => a + b, 0) === r.points),
    ).toBe(true);
    expect(w.average).not.toBeNull();
  });
  it('нагрузка по нескольким проектам делит полосу по проектам', () => {
    const other = { ...view, project: { ...view.project, key: 'SHOP' } };
    const w = workload([view, other]);
    expect(Object.keys(w.rows[0]?.byProject ?? {}).sort()).toEqual(['DEMO', 'SHOP']);
  });
  it('дорожная карта: эпик получает даты спринтов и прогресс', () => {
    const rows = roadmap([view]);
    const epic = rows.find((r) => r.issueNumber === 1);
    expect(epic).toBeTruthy();
    expect(epic?.start).not.toBeNull();
    expect((epic?.start ?? '') <= (epic?.end ?? '')).toBe(true);
    expect(epic?.percent).toBe(40);
  });
  it('CFD по seed: в каждый день сумма статусов совпадает с числом существующих задач', () => {
    const rows = cfd(ds.issues, ds.history, '2026-10-01', '2026-11-05');
    for (const r of rows) {
      expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(r.total);
    }
    expect(rows[rows.length - 1]?.total).toBe(ds.issues.length);
  });
});
