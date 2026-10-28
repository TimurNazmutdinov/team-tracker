import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { updateIssue } from './actions';
import { closeSprint } from './sprints';
import type { Dataset, History } from './schema';
import { sprintIdBefore, sprintSnapshots, summarize, valuesAt } from './totals';
import { applyChanges, testCtx, viewOf } from './testing';

const base = seed as unknown as Dataset;
const sprint = (ds: Dataset, id: string) => {
  const s = ds.sprints.find((x) => x.id === id);
  if (!s) throw new Error('нет спринта');
  return s;
};

describe('итоги идущего спринта', () => {
  const snaps = sprintSnapshots(sprint(base, 's2'), base.issues, base.history);
  const summary = summarize(snaps, base.people);

  it('по людям: задач, sp, из них в Done; по убыванию sp', () => {
    expect(summary.rows.map((r) => [r.name, r.count, r.points, r.done])).toEqual([
      ['Мария Орлова', 4, 13, 0],
      ['Игорь Смирнов', 3, 8, 0],
      ['Анна Ковалёва', 1, 0, 0],
    ]);
    expect(summary.total).toEqual({ count: 8, points: 21, done: 0 });
  });

  it('story points по статусам', () => {
    expect(summary.byStatus).toEqual({
      Backlog: 0,
      'To Do': 10,
      'In Progress': 8,
      Review: 3,
      Done: 0,
    });
  });

  it('неназначенные — отдельной строкой в конце', () => {
    const issues = base.issues.map((i) => (i.id === 'i5' ? { ...i, assigneeId: null } : i));
    const rows = summarize(
      sprintSnapshots(sprint(base, 's2'), issues, base.history),
      base.people,
    ).rows;
    expect(rows.at(-1)).toMatchObject({
      personId: null,
      name: 'Не назначено',
      count: 1,
      points: 8,
    });
  });
});

describe('закрытый спринт заморожен', () => {
  it('состав и значения берутся на момент закрытия: 7 задач, 18 sp, 16 в Done', () => {
    const snaps = sprintSnapshots(sprint(base, 's1'), base.issues, base.history);
    expect(snaps.map((s) => s.issue.number)).toEqual([2, 3, 6, 7, 8, 12, 16]);
    expect(snaps.find((s) => s.issue.number === 8)?.status).toBe('Review');
    expect(summarize(snaps, base.people).total).toEqual({ count: 7, points: 18, done: 16 });
  });

  it('последующие изменения перенесённых задач не меняют итоги', () => {
    const r = updateIssue(
      viewOf(base),
      'i8',
      { status: 'Done', assigneeId: 'u2', points: 8 },
      'u1',
      testCtx('2026-10-29T10:00:00Z'),
    );
    if (!r.ok) throw new Error('ожидался успех');
    const ds = applyChanges(base, r.changes);
    const total = summarize(
      sprintSnapshots(sprint(ds, 's1'), ds.issues, ds.history),
      ds.people,
    ).total;
    expect(total).toEqual({ count: 7, points: 18, done: 16 });
  });

  it('только что закрытый спринт: перенесённые задачи остаются в его составе', () => {
    const close = closeSprint(
      viewOf(base),
      's2',
      { kind: 'backlog' },
      'u1',
      testCtx('2026-11-06T18:00:00Z'),
    );
    if (!close.ok) throw new Error('ожидался успех');
    const ds = applyChanges(base, close.changes);
    const snaps = sprintSnapshots(sprint(ds, 's2'), ds.issues, ds.history);
    expect(snaps).toHaveLength(8);
    expect(summarize(snaps, ds.people).total).toEqual({ count: 8, points: 21, done: 0 });
  });
});

describe('откат по истории', () => {
  const issue = base.issues.find((i) => i.id === 'i10');
  if (!issue) throw new Error('нет i10');
  const ev = (
    field: History['field'],
    from: string | null,
    to: string | null,
    at: string,
    id: string,
  ): History => ({
    id,
    issueId: 'i10',
    authorId: 'u1',
    field,
    from,
    to,
    at,
  });

  it('valuesAt откатывает статус, исполнителя и points после момента', () => {
    const events = [
      ev('status', 'To Do', 'Review', '2026-10-30T10:00:00Z', 'a'),
      ev('assigneeId', 'u3', 'u2', '2026-10-31T10:00:00Z', 'b'),
      ev('points', '2', '5', '2026-11-01T10:00:00Z', 'c'),
    ];
    const current = { ...issue, status: 'Review' as const, assigneeId: 'u2', points: 5 };
    expect(valuesAt(current, events, '2026-10-30T12:00:00Z')).toMatchObject({
      status: 'Review',
      assigneeId: 'u3',
      points: 2,
    });
    expect(valuesAt(current, events, '2026-10-29T00:00:00Z')).toMatchObject({
      status: 'To Do',
      assigneeId: 'u3',
      points: 2,
    });
    expect(valuesAt(current, events, '2026-12-01T00:00:00Z')).toMatchObject({
      status: 'Review',
      assigneeId: 'u2',
      points: 5,
    });
  });

  it('sprintIdBefore не учитывает события в сам момент t', () => {
    const events = [ev('sprintId', 's2', 's3', '2026-11-06T18:00:00Z', 'a')];
    const moved = { ...issue, sprintId: 's3' };
    expect(sprintIdBefore(moved, events, '2026-11-06T18:00:00Z')).toBe('s2');
    expect(sprintIdBefore(moved, events, '2026-11-06T18:00:01Z')).toBe('s3');
  });
});
