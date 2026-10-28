import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { parseDataset } from './dataset';
import { canHavePoints, isValidParent } from './hierarchy';
import type { Dataset } from './schema';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('нет записи в seed');
  return value;
}

function fresh(): Dataset {
  return structuredClone(seed) as unknown as Dataset;
}

function errorsOf(ds: unknown): string[] {
  const r = parseDataset(ds);
  return r.ok ? [] : r.errors;
}

describe('parseDataset', () => {
  it('принимает data/seed.json', () => {
    const r = parseDataset(seed);
    expect(r.ok).toBe(true);
  });

  it('отклоняет данные неверной структуры', () => {
    const ds = fresh();
    must(ds.projects[0]).key = 'demo';
    expect(errorsOf(ds).join('\n')).toContain('projects.0.key');
    expect(errorsOf({ projects: [] }).length).toBeGreaterThan(0);
    expect(errorsOf(null).length).toBeGreaterThan(0);
  });

  it('находит ссылку на несуществующую запись', () => {
    const ds = fresh();
    must(ds.issues[0]).assigneeId = 'u999';
    expect(errorsOf(ds).join('\n')).toContain('u999');
  });

  it('правило 6: Task не вкладывается в Story', () => {
    const ds = fresh();
    must(ds.issues.find((i) => i.id === 'i9')).parentId = 'i4';
    expect(errorsOf(ds).join('\n')).toContain('недопустимый родитель');
  });

  it('правило 6: у Sub-task points нет', () => {
    const ds = fresh();
    must(ds.issues.find((i) => i.id === 'i14')).points = 1;
    expect(errorsOf(ds).join('\n')).toContain('points не ставятся');
  });

  it('правило 9: Sub-task в спринте родителя', () => {
    const ds = fresh();
    must(ds.issues.find((i) => i.id === 'i14')).sprintId = 's1';
    expect(errorsOf(ds).join('\n')).toContain('том же спринте');
  });

  it('closedAt задан ровно у закрытого спринта', () => {
    const ds = fresh();
    must(ds.sprints.find((s) => s.state === 'closed')).closedAt = null;
    expect(errorsOf(ds).join('\n')).toContain('closedAt');
  });
});

describe('hierarchy', () => {
  it('допустимые родители', () => {
    expect(isValidParent('Epic', null)).toBe(true);
    expect(isValidParent('Epic', 'Epic')).toBe(false);
    expect(isValidParent('Task', 'Epic')).toBe(true);
    expect(isValidParent('Task', 'Story')).toBe(false);
    expect(isValidParent('Sub-task', 'Task')).toBe(true);
    expect(isValidParent('Sub-task', null)).toBe(false);
  });

  it('points только у Story, Task и Bug', () => {
    expect(canHavePoints('Story')).toBe(true);
    expect(canHavePoints('Epic')).toBe(false);
    expect(canHavePoints('Sub-task')).toBe(false);
  });
});
