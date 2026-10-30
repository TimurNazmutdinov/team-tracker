import { describe, expect, it } from 'vitest';
import type { Issue } from './schema';
import { ancestors, descendants, treeRows } from './tree';

const mk = (id: string, type: Issue['type'], parentId: string | null = null): Issue =>
  ({ id, type, parentId, number: Number(id.replace(/\D/g, '')) || 0, title: id }) as Issue;

const epic = mk('e1', 'Epic');
const story = mk('s1', 'Story', 'e1');
const task = mk('t1', 'Task', 's1');
const sub = mk('u1', 'Sub-task', 't1');
const bug = mk('b1', 'Bug', 'e1');
const solo = mk('x1', 'Task');
const all = [epic, story, task, sub, bug, solo];
const show = (rows: ReturnType<typeof treeRows>) =>
  rows.map((r) => `${'-'.repeat(r.depth)}${r.issue.id}${r.context ? '*' : ''}`);

describe('treeRows', () => {
  it('потомки идут под родителем на своих уровнях', () => {
    expect(show(treeRows(all))).toEqual(['e1', '-s1', '--t1', '---u1', '-b1', 'x1']);
  });

  it('родитель вне списка добавляется строкой-контекстом', () => {
    const rows = treeRows([sub, bug, solo], { all });
    expect(show(rows)).toEqual(['e1*', '-s1*', '--t1*', '---u1', '-b1', 'x1']);
  });

  it('без списка «все» задача без родителя в списке остаётся корнем', () => {
    expect(show(treeRows([sub, bug]))).toEqual(['u1', 'b1']);
  });

  it('свёрнутая задача прячет потомков, число потомков помнит', () => {
    const rows = treeRows(all, { collapsed: new Set(['e1']) });
    expect(show(rows)).toEqual(['e1', 'x1']);
    expect(rows[0]?.children).toBe(2);
  });

  it('порядок соседей — как в списке', () => {
    expect(show(treeRows([bug, story, epic]))).toEqual(['e1', '-b1', '-s1']);
  });
});

describe('ancestors и descendants', () => {
  it('предки от эпика до родителя; у корня их нет', () => {
    expect(ancestors(sub, all).map((i) => i.id)).toEqual(['e1', 's1', 't1']);
    expect(ancestors(epic, all)).toEqual([]);
  });
  it('потомки всех уровней', () => {
    expect(descendants(epic, all).map((i) => i.id)).toEqual(['s1', 'b1', 't1', 'u1']);
    expect(descendants(sub, all)).toEqual([]);
  });
});
