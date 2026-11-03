import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { epicProgress } from './progress';
import type { Dataset, Issue } from './schema';

const ds = seed as unknown as Dataset;

function issue(patch: Partial<Issue>): Issue {
  const base = ds.issues[0];
  if (!base) throw new Error('нет задач в seed');
  return { ...base, id: 'x', parentId: 'e1', type: 'Task', status: 'To Do', points: 1, ...patch };
}

describe('epicProgress', () => {
  it('считает по демо-данным: Task и Bug эпика DEMO-1', () => {
    expect(epicProgress(ds.issues, 'i1')).toEqual({ count: 12, total: 40, done: 16, percent: 40 });
  });

  it('сумма points, из них в Done и процент', () => {
    const issues = [
      issue({ id: 'a', points: 5, status: 'Done' }),
      issue({ id: 'b', points: 3, type: 'Task', status: 'In Progress' }),
      issue({ id: 'c', points: 2, type: 'Bug', status: 'Done' }),
    ];
    expect(epicProgress(issues, 'e1')).toEqual({ count: 3, total: 10, done: 7, percent: 70 });
  });

  it('процент округляется до целого', () => {
    const issues = [issue({ id: 'a', points: 1, status: 'Done' }), issue({ id: 'b', points: 2 })];
    expect(epicProgress(issues, 'e1').percent).toBe(33);
  });

  it('задачи без оценки считаются как 0 points', () => {
    const issues = [
      issue({ id: 'a', points: null, status: 'Done' }),
      issue({ id: 'b', points: 4 }),
    ];
    expect(epicProgress(issues, 'e1')).toEqual({ count: 2, total: 4, done: 0, percent: 0 });
  });

  it('без потомков и без points — нули, без деления на ноль', () => {
    expect(epicProgress([], 'e1')).toEqual({ count: 0, total: 0, done: 0, percent: 0 });
    expect(epicProgress([issue({ id: 'a', points: null })], 'e1').percent).toBe(0);
  });

  it('не учитывает чужие эпики, подзадачи и вложенные уровни', () => {
    const issues = [
      issue({ id: 'a', points: 5 }),
      issue({ id: 'b', points: 5, parentId: 'e2' }),
      issue({ id: 's', points: 3, type: 'Sub-task', parentId: 'a', status: 'Done' }),
      issue({ id: 'c', points: 9, parentId: 'a', status: 'Done' }),
    ];
    expect(epicProgress(issues, 'e1')).toEqual({ count: 1, total: 5, done: 0, percent: 0 });
  });

  it('учитывает задачи под-эпиков эпика (ADR-024)', () => {
    const issues = [
      issue({ id: 'se', type: 'Sub-epic', parentId: 'e1', points: null }),
      issue({ id: 'a', parentId: 'se', points: 3, status: 'Done' }),
      issue({ id: 'b', parentId: 'e1', points: 2 }),
      issue({ id: 'c', parentId: 'other', points: 8 }),
    ];
    expect(epicProgress(issues, 'e1')).toEqual({ count: 2, total: 5, done: 3, percent: 60 });
    expect(epicProgress(issues, 'se')).toEqual({ count: 1, total: 3, done: 3, percent: 100 });
  });
});
