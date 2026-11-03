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

  it('правило 6: Task не вкладывается в Task', () => {
    const ds = fresh();
    must(ds.issues.find((i) => i.id === 'i9')).parentId = 'i4';
    expect(errorsOf(ds).join('\n')).toContain('недопустимый родитель');
  });

  it('ADR-024: старый тип Story читается как Task (данные и копии прежних версий)', () => {
    const ds = fresh() as unknown as {
      issues: { id: string; type: string }[];
      templates: { id: string; type: string }[];
    };
    const story = ds.issues.find((i) => i.id === 'i4');
    const tpl = ds.templates.find((t) => t.id === 'tpl1');
    if (story) story.type = 'Story';
    if (tpl) tpl.type = 'Story';
    const r = parseDataset(ds);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.issues.find((i) => i.id === 'i4')?.type).toBe('Task');
      expect(r.data.templates.find((t) => t.id === 'tpl1')?.type).toBe('Task');
    }
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
    expect(isValidParent('Task', 'Task')).toBe(false);
    expect(isValidParent('Task', 'Sub-epic')).toBe(true);
    expect(isValidParent('Sub-epic', 'Epic')).toBe(true);
    expect(isValidParent('Sub-epic', null)).toBe(false);
    expect(isValidParent('Sub-task', 'Sub-epic')).toBe(false);
    expect(isValidParent('Sub-task', 'Task')).toBe(true);
    expect(isValidParent('Sub-task', null)).toBe(false);
  });

  it('points только у Task и Bug', () => {
    expect(canHavePoints('Task')).toBe(true);
    expect(canHavePoints('Sub-epic')).toBe(false);
    expect(canHavePoints('Epic')).toBe(false);
    expect(canHavePoints('Sub-task')).toBe(false);
  });
});
