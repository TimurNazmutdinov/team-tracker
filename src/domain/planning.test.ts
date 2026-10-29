import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { updateIssue } from './actions';
import {
  NO_PLANNING_FILTERS,
  allLabels,
  closedSprints,
  fillOf,
  matchesFilters,
  sprintCapacity,
  totalPoints,
  unestimated,
} from './planning';
import type { Dataset, Issue, Sprint } from './schema';
import { applyChanges, testCtx, viewOf } from './testing';

const ds = seed as unknown as Dataset;
const issue = (n: number): Issue => {
  const found = ds.issues.find((i) => i.number === n);
  if (!found) throw new Error(`нет задачи ${n}`);
  return found;
};

describe('fillOf', () => {
  it('до 90 % — норма, до 100 % — почти полон, больше — перегруз', () => {
    expect(fillOf(15, 17)).toMatchObject({ level: 'ok', percent: 88, over: 0, free: 2 });
    expect(fillOf(17, 17)).toMatchObject({ level: 'near', percent: 100, free: 0 });
    expect(fillOf(16, 17).level).toBe('near');
    expect(fillOf(21, 17)).toMatchObject({ level: 'over', percent: 124, over: 4 });
  });

  it('границу 90 % относит к норме', () => {
    expect(fillOf(9, 10).level).toBe('ok');
    expect(fillOf(10, 10).level).toBe('near');
    expect(fillOf(11, 10).level).toBe('over');
  });

  it('без ёмкости процент неизвестен', () => {
    expect(fillOf(5, null)).toMatchObject({ level: 'unknown', percent: null });
    expect(fillOf(5, 0).level).toBe('unknown');
  });
});

describe('sprintCapacity', () => {
  const sprint = (id: string, end: string, state: Sprint['state'] = 'closed'): Sprint => ({
    id,
    projectId: 'p1',
    name: id,
    goal: '',
    start: '2026-01-01',
    end,
    state,
    closedAt: state === 'closed' ? `${end}T18:00:00Z` : null,
  });

  it('нет закрытых спринтов — ёмкость неизвестна', () => {
    const view = viewOf(ds);
    const open = view.sprints.filter((s) => s.state !== 'closed');
    expect(sprintCapacity(open, view.issues, ds.history)).toEqual({
      value: null,
      sprints: 0,
      velocities: [],
    });
  });

  it('по имеющимся закрытым спринтам seed считает среднее velocity', () => {
    const view = viewOf(ds);
    const capacity = sprintCapacity(view.sprints, view.issues, ds.history);
    expect(capacity.sprints).toBe(1);
    expect(capacity.value).toBe(capacity.velocities[0]);
  });

  it('берёт не больше трёх последних закрытых спринтов', () => {
    const view = viewOf(ds);
    const extra = ['2026-02-01', '2026-03-01', '2026-04-01'].map((end, n) => sprint(`x${n}`, end));
    const capacity = sprintCapacity([...view.sprints, ...extra], view.issues, ds.history);
    expect(capacity.sprints).toBe(3);
    expect(capacity.velocities).toHaveLength(3);
  });
});

describe('фильтры планирования', () => {
  const key = (i: Issue) => `DEMO-${i.number}`;
  const f = (patch: Partial<typeof NO_PLANNING_FILTERS>) => ({ ...NO_PLANNING_FILTERS, ...patch });

  it('поиск по ключу и названию без учёта регистра', () => {
    const i = issue(5);
    expect(matchesFilters(i, key(i), f({ search: 'demo-5' }))).toBe(true);
    expect(matchesFilters(i, key(i), f({ search: i.title.slice(0, 4).toUpperCase() }))).toBe(true);
    expect(matchesFilters(i, key(i), f({ search: 'нет такого' }))).toBe(false);
  });

  it('эпик: сам эпик и его задачи', () => {
    const epic = issue(1);
    expect(matchesFilters(epic, key(epic), f({ epicId: epic.id }))).toBe(true);
    expect(matchesFilters(issue(5), key(issue(5)), f({ epicId: epic.id }))).toBe(true);
    expect(matchesFilters(issue(5), key(issue(5)), f({ epicId: 'нет' }))).toBe(false);
  });

  it('«без оценки» и «без исполнителя» складываются по И', () => {
    const noPoints: Issue = { ...issue(5), points: null, assigneeId: null };
    expect(matchesFilters(noPoints, 'DEMO-5', f({ noEstimate: true, noAssignee: true }))).toBe(
      true,
    );
    const assigned: Issue = { ...noPoints, assigneeId: 'u1' };
    expect(matchesFilters(assigned, 'DEMO-5', f({ noEstimate: true, noAssignee: true }))).toBe(
      false,
    );
    // у Epic points нет по правилам, поэтому «без оценки» его не выбирает
    expect(matchesFilters(issue(1), 'DEMO-1', f({ noEstimate: true }))).toBe(false);
  });

  it('метка и тип', () => {
    const i = issue(4);
    expect(matchesFilters(i, key(i), f({ label: 'безопасность' }))).toBe(true);
    expect(matchesFilters(i, key(i), f({ label: 'заказы' }))).toBe(false);
    expect(matchesFilters(i, key(i), f({ type: 'Story' }))).toBe(true);
    expect(matchesFilters(i, key(i), f({ type: 'Bug' }))).toBe(false);
  });

  it('метки собираются без повторов по алфавиту', () => {
    const labels = allLabels(ds.issues);
    expect(labels).toEqual([...new Set(labels)].sort((a, b) => a.localeCompare(b, 'ru')));
    expect(labels).toContain('бэкенд');
  });

  it('суммы: points и число неоценённых без Epic', () => {
    const items = [issue(1), issue(5), { ...issue(4), points: null }];
    expect(totalPoints(items)).toBe(8);
    expect(unestimated(items)).toBe(1);
  });
});

describe('closedSprints', () => {
  it('возвращает закрытые спринты с выполненными задачами и velocity', () => {
    const view = viewOf(ds);
    const [first] = closedSprints(view.sprints, view.issues, ds.history);
    expect(first?.sprint.id).toBe('s1');
    expect(first?.done.every((i) => i.status === 'Done')).toBe(true);
    expect(first?.velocity).toBe(totalPointsOfDone(first?.done ?? []));
  });
});

function totalPointsOfDone(done: Issue[]) {
  return done.reduce((sum, i) => sum + (i.points ?? 0), 0);
}

describe('возврат из идущего спринта в бэклог', () => {
  it('сбрасывает статус в To Do и пишет это в историю', () => {
    const view = viewOf(ds);
    const r = updateIssue(view, 'i4', { sprintId: null }, 'u1', testCtx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const moved = applyChanges(ds, r.changes).issues.find((i) => i.id === 'i4');
    expect(moved).toMatchObject({ sprintId: null, status: 'To Do' });
    expect(r.changes.history?.map((h) => h.field)).toEqual(
      expect.arrayContaining(['sprintId', 'status']),
    );
  });

  it('не трогает To Do и не меняет статус при явном патче', () => {
    const view = viewOf(ds);
    const todo = updateIssue(view, 'i5', { sprintId: null }, 'u1', testCtx());
    expect(todo.ok && todo.changes.history?.map((h) => h.field)).toEqual(['sprintId']);
    const explicit = updateIssue(view, 'i4', { sprintId: null, status: 'Review' }, 'u1', testCtx());
    expect(explicit.ok && explicit.changes.issues?.[0]?.status).toBe('Review');
  });

  it('из запланированного спринта статус не сбрасывается', () => {
    const view = viewOf(ds);
    const toPlanned = updateIssue(view, 'i11', { sprintId: 's3' }, 'u1', testCtx());
    const back = toPlanned.ok
      ? updateIssue(
          viewOf(applyChanges(ds, toPlanned.changes)),
          'i11',
          { sprintId: null },
          'u1',
          testCtx(),
        )
      : toPlanned;
    expect(back.ok && back.changes.history?.map((h) => h.field)).toEqual(['sprintId']);
  });
});
