import { describe, expect, it } from 'vitest';
import type { View } from './actions';
import {
  addAbsence,
  adjustedCapacity,
  deleteAbsence,
  sprintAvailability,
  teamOf,
  updateAbsence,
  workdays,
} from './availability';
import type { Absence } from './schema';
import { testCtx } from './testing';

const project = {
  id: 'p1',
  key: 'DEMO',
  name: 'Демо',
  sprintDurationDays: 14,
  sprintPrefix: 'Спринт',
  nextSprintNumber: 1,
  nextSprintStart: null,
  ownerId: 'u1',
  wipEnabled: false,
  wipLimits: {},
  dod: '',
};
const members = [
  { id: 'm1', projectId: 'p1', personId: 'u2', role: 'developer' as const },
  { id: 'm2', projectId: 'p2', personId: 'u3', role: 'developer' as const },
];
const people = [
  { id: 'u1', name: 'Анна', role: 'PO' },
  { id: 'u2', name: 'Игорь', role: 'Dev' },
  { id: 'u3', name: 'Мария', role: 'Dev' },
];
// 9–20 ноября 2026: понедельник–пятница, две рабочие недели = 10 дней
const sprint = { start: '2026-11-09', end: '2026-11-20' };
const absence = (id: string, personId: string, start: string, end: string): Absence => ({
  id,
  personId,
  start,
  end,
  kind: 'vacation',
});
const view = (absences: Absence[]) => ({ project, members, projectId: 'p1', absences });

describe('workdays', () => {
  it('пропускает субботу и воскресенье', () => {
    expect(workdays('2026-11-06', '2026-11-10')).toEqual([
      '2026-11-06',
      '2026-11-09',
      '2026-11-10',
    ]);
  });
  it('пустой для периода из выходных и для перевёрнутого периода', () => {
    expect(workdays('2026-11-07', '2026-11-08')).toEqual([]);
    expect(workdays('2026-11-10', '2026-11-09')).toEqual([]);
  });
});

describe('teamOf', () => {
  it('владелец и участники своего проекта, без чужих', () => {
    expect(teamOf(view([])).sort()).toEqual(['u1', 'u2']);
  });
});

describe('sprintAvailability', () => {
  it('без отсутствий доступность 100 %', () => {
    const a = sprintAvailability(view([]), sprint);
    expect(a).toMatchObject({ totalDays: 20, availableDays: 20, ratio: 1, absences: [] });
  });
  it('вычитает рабочие дни отпуска внутри спринта', () => {
    // Игорь: пн 16 – пт 20 = 5 дней; период шире спринта обрезается
    const a = sprintAvailability(view([absence('a1', 'u2', '2026-11-16', '2026-12-31')]), sprint);
    expect(a.availableDays).toBe(15);
    expect(a.ratio).toBe(0.75);
    expect(a.absences).toEqual([
      expect.objectContaining({ days: 5, start: '2026-11-16', end: '2026-11-20' }),
    ]);
  });
  it('пересекающиеся отсутствия одного человека не считаются дважды', () => {
    const a = sprintAvailability(
      view([
        absence('a1', 'u2', '2026-11-09', '2026-11-12'),
        absence('a2', 'u2', '2026-11-11', '2026-11-13'),
      ]),
      sprint,
    );
    expect(a.availableDays).toBe(20 - 5);
  });
  it('выходные в отсутствии не считаются, чужой проект и вне спринта игнорируются', () => {
    const a = sprintAvailability(
      view([
        absence('a1', 'u1', '2026-11-14', '2026-11-15'),
        absence('a2', 'u3', '2026-11-09', '2026-11-20'),
        absence('a3', 'u2', '2026-12-01', '2026-12-05'),
      ]),
      sprint,
    );
    expect(a.ratio).toBe(1);
    expect(a.absences).toEqual([]);
  });
  it('без команды доступность 1', () => {
    const a = sprintAvailability(
      { project: { ...project, ownerId: null }, members: [], projectId: 'p1', absences: [] },
      sprint,
    );
    expect(a.ratio).toBe(1);
    expect(a.totalDays).toBe(0);
  });
});

describe('adjustedCapacity', () => {
  const base = { value: 16, sprints: 2, velocities: [14, 18] };
  it('умножает ёмкость на долю доступных дней', () => {
    const a = sprintAvailability(view([absence('a1', 'u2', '2026-11-16', '2026-11-20')]), sprint);
    const c = adjustedCapacity(base, a);
    expect(c.value).toBe(12);
    expect(c.base).toBe(16);
    expect(c.availability).toBe(a);
  });
  it('неизвестная ёмкость остаётся неизвестной', () => {
    const a = sprintAvailability(view([]), sprint);
    expect(adjustedCapacity({ value: null, sprints: 0, velocities: [] }, a).value).toBeNull();
  });
});

describe('отсутствия: добавление, правка, удаление', () => {
  const v = { people, absences: [absence('a1', 'u1', '2026-11-09', '2026-11-10')] } as Pick<
    View,
    'people' | 'absences'
  >;
  const ok = { personId: 'u1', start: '2026-11-09', end: '2026-11-13', kind: 'vacation' as const };

  it('добавляет с новым id', () => {
    const r = addAbsence(v, ok, testCtx());
    expect(r.ok && r.changes.absences?.[0]).toMatchObject(ok);
  });
  it('проверяет поля', () => {
    const bad = addAbsence(
      v,
      { personId: 'x', start: 'вчера', end: '2026-13-40', kind: 'vacation' },
      testCtx(),
    );
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(['end', 'personId', 'start']);
    const reversed = addAbsence(v, { ...ok, end: '2026-11-01' }, testCtx());
    expect(!reversed.ok && reversed.errors.end).toMatch(/раньше/);
    const weekend = addAbsence(v, { ...ok, start: '2026-11-14', end: '2026-11-15' }, testCtx());
    expect(!weekend.ok && weekend.errors.end).toMatch(/рабочих/);
  });
  it('правит и удаляет; неизвестный id — ошибка; без изменений — пусто', () => {
    expect(updateAbsence(v, 'a1', { ...ok, end: '2026-11-10' }).ok).toBe(true);
    const same = updateAbsence(v, 'a1', {
      personId: 'u1',
      start: '2026-11-09',
      end: '2026-11-10',
      kind: 'vacation',
    });
    expect(same.ok && same.changes).toEqual({});
    expect(updateAbsence(v, 'zz', ok).ok).toBe(false);
    const del = deleteAbsence(v, 'a1');
    expect(del.ok && del.changes.deleteAbsenceIds).toEqual(['a1']);
    expect(deleteAbsence(v, 'zz').ok).toBe(false);
  });
});
