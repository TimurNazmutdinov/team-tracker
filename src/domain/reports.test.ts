import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { updateIssue } from './actions';
import { burndown, velocity } from './reports';
import type { Dataset, History } from './schema';
import { closeSprint } from './sprints';
import { peopleRows, sprintSnapshots } from './totals';
import { applyChanges, testCtx, viewOf } from './testing';

const base = seed as unknown as Dataset;
const sprint = (ds: Dataset, id: string) => {
  const s = ds.sprints.find((x) => x.id === id);
  if (!s) throw new Error('нет спринта');
  return s;
};
const day = (days: ReturnType<typeof burndown>, date: string) => {
  const d = days.find((x) => x.date === date);
  if (!d) throw new Error(`нет дня ${date}`);
  return d;
};

describe('burndown закрытого спринта 1', () => {
  const days = burndown(sprint(base, 's1'), base.issues, base.history, '2026-10-28');

  it('календарные дни от старта до конца', () => {
    expect(days).toHaveLength(12);
    expect(days[0]?.date).toBe('2026-10-12');
    expect(days.at(-1)?.date).toBe('2026-10-23');
  });

  it('остаток по дням с учётом добавления задачи в спринт посреди спринта', () => {
    expect(day(days, '2026-10-12')).toMatchObject({ scope: 16, done: 0, remaining: 16 });
    expect(day(days, '2026-10-14')).toMatchObject({ scope: 16, done: 3, remaining: 13 });
    expect(day(days, '2026-10-15')).toMatchObject({ scope: 18, done: 3, remaining: 15 });
    expect(day(days, '2026-10-20')).toMatchObject({ done: 6, remaining: 12 });
    expect(day(days, '2026-10-22')).toMatchObject({ done: 13, remaining: 5 });
  });

  it('в последний день остаётся перенесённая незавершённая задача (состояние на момент закрытия)', () => {
    expect(day(days, '2026-10-23')).toMatchObject({ scope: 18, done: 16, remaining: 2 });
  });

  it('идеальная линия: от объёма первого дня до 0', () => {
    expect(days[0]?.ideal).toBe(16);
    expect(days.at(-1)?.ideal).toBe(0);
    expect(day(days, '2026-10-17').ideal).toBeCloseTo(16 * (1 - 5 / 11), 1);
  });

  it('правки после закрытия (перенесённая задача стала Done) отчёт не меняют', () => {
    const r = updateIssue(
      viewOf(base),
      'i8',
      { status: 'Done' },
      'u1',
      testCtx('2026-10-29T10:00:00Z'),
    );
    if (!r.ok) throw new Error('ожидался успех');
    const ds = applyChanges(base, r.changes);
    expect(burndown(sprint(ds, 's1'), ds.issues, ds.history, '2026-10-30')).toEqual(days);
  });
});

describe('burndown идущего и запланированного спринта', () => {
  it('дни после «сегодня» без данных', () => {
    const days = burndown(sprint(base, 's2'), base.issues, base.history, '2026-10-28');
    expect(days.map((d) => d.remaining)).toEqual([
      21,
      21,
      21,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(day(days, '2026-10-28')).toMatchObject({ scope: 21, done: 0 });
    expect(days[0]?.ideal).toBe(21);
  });

  it('смена статуса сегодня сразу видна в остатке', () => {
    const r = updateIssue(
      viewOf(base),
      'i10',
      { status: 'Done' },
      'u3',
      testCtx('2026-10-28T12:00:00Z'),
    );
    if (!r.ok) throw new Error('ожидался успех');
    const ds = applyChanges(base, r.changes);
    const days = burndown(sprint(ds, 's2'), ds.issues, ds.history, '2026-10-28');
    expect(day(days, '2026-10-27').remaining).toBe(21);
    expect(day(days, '2026-10-28')).toMatchObject({ done: 2, remaining: 19 });
  });

  it('запланированный спринт: данных нет', () => {
    const days = burndown(sprint(base, 's3'), base.issues, base.history, '2026-10-28');
    expect(days.every((d) => d.remaining === null && d.ideal === 0)).toBe(true);
  });

  it('удаление задачи из спринта уменьшает объём со дня удаления', () => {
    const history: History[] = [
      ...base.history,
      {
        id: 'x1',
        issueId: 'i5',
        authorId: 'u1',
        field: 'sprintId',
        from: 's2',
        to: null,
        at: '2026-10-28T09:00:00Z',
      },
    ];
    const issues = base.issues.map((i) => (i.id === 'i5' ? { ...i, sprintId: null } : i));
    const days = burndown(sprint(base, 's2'), issues, history, '2026-10-28');
    expect(day(days, '2026-10-27').scope).toBe(21);
    expect(day(days, '2026-10-28').scope).toBe(13);
  });
});

describe('velocity', () => {
  it('закрытый спринт — на момент закрытия, идущий — «в процессе»; среднее по закрытым', () => {
    const v = velocity(base.sprints, base.issues, base.history);
    expect(v.bars).toEqual([
      { sprintId: 's1', name: 'Спринт 1', velocity: 16, scope: 18, state: 'closed' },
      { sprintId: 's2', name: 'Спринт 2', velocity: 0, scope: 21, state: 'active' },
    ]);
    expect(v.average).toBe(16);
  });

  it('без закрытых спринтов среднего нет; запланированные не учитываются', () => {
    const open = base.sprints.filter((s) => s.id !== 's1');
    const v = velocity(open, base.issues, base.history);
    expect(v.average).toBeNull();
    expect(v.bars.map((b) => b.sprintId)).toEqual(['s2']);
  });

  it('после закрытия идущего спринта добавляется столбец, среднее пересчитывается', () => {
    let ds = base;
    for (const id of ['i4', 'i5']) {
      const r = updateIssue(
        viewOf(ds),
        id,
        { status: 'Done' },
        'u1',
        testCtx('2026-11-05T10:00:00Z'),
      );
      if (!r.ok) throw new Error('ожидался успех');
      ds = applyChanges(ds, r.changes);
    }
    const close = closeSprint(
      viewOf(ds),
      's2',
      { kind: 'backlog' },
      'u1',
      testCtx('2026-11-06T18:00:00Z'),
    );
    if (!close.ok) throw new Error('ожидался успех');
    ds = applyChanges(ds, close.changes);
    const v = velocity(ds.sprints, ds.issues, ds.history);
    expect(v.bars.map((b) => [b.sprintId, b.velocity, b.state])).toEqual([
      ['s1', 16, 'closed'],
      ['s2', 13, 'closed'],
    ]);
    expect(v.average).toBe(14.5);
  });
});

describe('peopleRows', () => {
  it('включает всех людей проекта, в том числе без задач в спринте', () => {
    const snaps = sprintSnapshots(sprint(base, 's2'), base.issues, base.history);
    expect(peopleRows(snaps, base.people).map((r) => [r.name, r.count, r.points])).toEqual([
      ['Мария Орлова', 4, 13],
      ['Игорь Смирнов', 3, 8],
      ['Анна Ковалёва', 1, 0],
      ['Дмитрий Васильев', 0, 0],
    ]);
  });
});
