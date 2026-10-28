import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import {
  addComment,
  addLink,
  containerItems,
  createIssue,
  createProject,
  moveIssue,
  parentCandidates,
  removeLink,
  updateIssue,
  type NewIssueInput,
  type Result,
} from './actions';
import { parseDataset } from './dataset';
import type { Dataset, Issue } from './schema';
import { applyChanges, replayErrors, testCtx, viewOf } from './testing';

const ds = seed as unknown as Dataset;

function must<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('нет записи');
  return value;
}

function applied(base: Dataset, r: Result): Dataset {
  if (!r.ok) throw new Error(`ожидался успех: ${JSON.stringify(r.errors)}`);
  const next = applyChanges(base, r.changes);
  const parsed = parseDataset(next);
  expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  expect(replayErrors(next)).toEqual([]);
  return next;
}

function errors(r: Result): Record<string, string> {
  if (r.ok) throw new Error('ожидалась ошибка');
  return r.errors;
}

const baseInput: NewIssueInput = {
  type: 'Task',
  title: ' Новая задача ',
  description: '',
  acceptance: '',
  parentId: 'i1',
  priority: 'Medium',
  points: 3,
  assigneeId: 'u3',
  labels: ['бэкенд', ' бэкенд ', ''],
  dueDate: '2026-11-05',
  sprintId: null,
};

const issueOf = (d: Dataset, id: string): Issue => must(d.issues.find((i) => i.id === id));

describe('createIssue', () => {
  it('создаёт задачу в бэклоге: номер, порядок, статус Backlog, событие created', () => {
    const next = applied(ds, createIssue(viewOf(ds), baseInput, 'u1', testCtx()));
    const created = must(next.issues.at(-1));
    expect(created).toMatchObject({
      number: 17,
      status: 'Backlog',
      title: 'Новая задача',
      sprintId: null,
      reporterId: 'u1',
    });
    expect(created.order).toBe(17);
    expect(created.labels).toEqual(['бэкенд']);
    const events = next.history.filter((h) => h.issueId === created.id);
    expect(events.map((h) => [h.field, h.from, h.to])).toEqual([['created', null, 'Backlog']]);
  });

  it('при создании в спринте пишет created и sprintId', () => {
    const next = applied(
      ds,
      createIssue(viewOf(ds), { ...baseInput, sprintId: 's2' }, 'u1', testCtx()),
    );
    const created = must(next.issues.at(-1));
    expect(created.sprintId).toBe('s2');
    expect(next.history.filter((h) => h.issueId === created.id).map((h) => h.field)).toEqual([
      'created',
      'sprintId',
    ]);
  });

  it('проверяет поля и объясняет ошибки', () => {
    const e = errors(
      createIssue(
        viewOf(ds),
        { ...baseInput, title: '  ', dueDate: '2026-10-01', points: -1 },
        'u1',
        testCtx(),
      ),
    );
    expect(e.title).toContain('название');
    expect(e.dueDate).toContain('раньше');
    expect(e.points).toContain('не меньше 0');
    expect(
      errors(createIssue(viewOf(ds), { ...baseInput, title: 'x'.repeat(201) }, 'u1', testCtx()))
        .title,
    ).toContain('длиннее');
  });

  it('правило 6: иерархия и points', () => {
    expect(
      errors(createIssue(viewOf(ds), { ...baseInput, parentId: 'i4' }, 'u1', testCtx())).parentId,
    ).toContain('Task в Story');
    expect(
      errors(
        createIssue(
          viewOf(ds),
          { ...baseInput, type: 'Sub-task', parentId: null },
          'u1',
          testCtx(),
        ),
      ).parentId,
    ).toContain('Sub-task');
    expect(
      errors(
        createIssue(viewOf(ds), { ...baseInput, type: 'Epic', parentId: 'i1' }, 'u1', testCtx()),
      ).parentId,
    ).toContain('Epic');
    expect(
      errors(
        createIssue(
          viewOf(ds),
          { ...baseInput, type: 'Sub-task', parentId: 'i9' },
          'u1',
          testCtx(),
        ),
      ).points,
    ).toContain('не ставятся');
  });

  it('правило 9: Sub-task создаётся в спринте родителя', () => {
    const input = {
      ...baseInput,
      type: 'Sub-task' as const,
      parentId: 'i9',
      points: null,
      sprintId: null,
    };
    const next = applied(ds, createIssue(viewOf(ds), input, 'u1', testCtx()));
    const sub = must(next.issues.at(-1));
    expect(sub.sprintId).toBe('s2');
    expect(next.history.filter((h) => h.issueId === sub.id).map((h) => h.field)).toEqual([
      'created',
      'sprintId',
    ]);
  });

  it('не добавляет в закрытый спринт', () => {
    expect(
      errors(createIssue(viewOf(ds), { ...baseInput, sprintId: 's1' }, 'u1', testCtx())).sprintId,
    ).toContain('закрытый');
  });

  it('parentCandidates: родители по типу', () => {
    const view = viewOf(ds);
    expect(parentCandidates(view, 'Task').map((i) => i.id)).toEqual(['i1']);
    expect(parentCandidates(view, 'Epic')).toEqual([]);
    expect(
      parentCandidates(view, 'Sub-task').every((i) => ['Story', 'Task', 'Bug'].includes(i.type)),
    ).toBe(true);
  });
});

describe('updateIssue', () => {
  it('смена статуса пишет историю; любой переход разрешён', () => {
    const next = applied(ds, updateIssue(viewOf(ds), 'i10', { status: 'Done' }, 'u3', testCtx()));
    expect(issueOf(next, 'i10')).toMatchObject({
      status: 'Done',
      updatedAt: '2026-10-29T10:00:00Z',
    });
    const last = must(next.history.at(-1));
    expect(last).toMatchObject({
      issueId: 'i10',
      field: 'status',
      from: 'To Do',
      to: 'Done',
      authorId: 'u3',
    });
  });

  it('тот же статус — ничего не меняется', () => {
    const r = updateIssue(viewOf(ds), 'i10', { status: 'To Do' }, 'u3', testCtx());
    expect(r.ok && r.changes).toEqual({});
  });

  it('пишет смену исполнителя и points', () => {
    const next = applied(
      ds,
      updateIssue(viewOf(ds), 'i10', { assigneeId: 'u2', points: 5 }, 'u1', testCtx()),
    );
    const events = next.history.filter((h) => h.issueId === 'i10').slice(-2);
    expect(events.map((h) => [h.field, h.from, h.to])).toEqual([
      ['assigneeId', 'u3', 'u2'],
      ['points', '2', '5'],
    ]);
  });

  it('правило 6: points нельзя поставить на Sub-task и Epic', () => {
    expect(errors(updateIssue(viewOf(ds), 'i14', { points: 2 }, 'u1', testCtx())).points).toContain(
      'не ставятся',
    );
    expect(errors(updateIssue(viewOf(ds), 'i1', { points: 2 }, 'u1', testCtx())).points).toContain(
      'не ставятся',
    );
  });

  it('перенос задачи в другой спринт переносит и её подзадачи', () => {
    const next = applied(ds, updateIssue(viewOf(ds), 'i9', { sprintId: null }, 'u1', testCtx()));
    for (const id of ['i9', 'i14', 'i15']) expect(issueOf(next, id).sprintId).toBeNull();
    const events = next.history.filter(
      (h) => h.field === 'sprintId' && h.at === '2026-10-29T10:00:00Z',
    );
    expect(events.map((h) => h.issueId).sort()).toEqual(['i14', 'i15', 'i9']);
  });

  it('правило 9: Sub-task нельзя перенести отдельно, смена родителя переносит её', () => {
    expect(
      errors(updateIssue(viewOf(ds), 'i14', { sprintId: null }, 'u1', testCtx())).sprintId,
    ).toContain('вместе с родителем');
    const next = applied(ds, updateIssue(viewOf(ds), 'i14', { parentId: 'i11' }, 'u1', testCtx()));
    expect(issueOf(next, 'i14')).toMatchObject({ parentId: 'i11', sprintId: null });
  });

  it('родитель по иерархии', () => {
    expect(
      errors(updateIssue(viewOf(ds), 'i9', { parentId: 'i4' }, 'u1', testCtx())).parentId,
    ).toContain('Task в Story');
    expect(
      errors(updateIssue(viewOf(ds), 'i14', { parentId: 'i1' }, 'u1', testCtx())).parentId,
    ).toContain('Sub-task');
  });

  it('правило 4: задачи закрытого спринта только для чтения', () => {
    expect(
      errors(updateIssue(viewOf(ds), 'i7', { status: 'Review' }, 'u1', testCtx())).form,
    ).toContain('закрыт');
    expect(
      errors(moveIssue(viewOf(ds), 'i7', { sprintId: null, index: 0 }, 'u1', testCtx())).form,
    ).toContain('закрыт');
    expect(
      errors(updateIssue(viewOf(ds), 'i10', { sprintId: 's1' }, 'u1', testCtx())).sprintId,
    ).toContain('закрытый');
  });

  it('название, срок и метки без записи в историю', () => {
    const next = applied(
      ds,
      updateIssue(
        viewOf(ds),
        'i10',
        { title: ' Новое ', labels: ['а', 'а'], dueDate: null },
        'u1',
        testCtx(),
      ),
    );
    expect(issueOf(next, 'i10')).toMatchObject({ title: 'Новое', labels: ['а'], dueDate: null });
    expect(next.history.length).toBe(ds.history.length);
    expect(errors(updateIssue(viewOf(ds), 'i10', { title: '' }, 'u1', testCtx())).title).toContain(
      'название',
    );
  });
});

describe('moveIssue', () => {
  it('меняет порядок внутри списка, значения order только переставляются', () => {
    const view = viewOf(ds);
    const before = containerItems(view, 's2');
    const r = moveIssue(
      view,
      must(before.at(-1)).id,
      { sprintId: 's2', index: 0 },
      'u1',
      testCtx(),
    );
    const next = applied(ds, r);
    const after = containerItems(viewOf(next), 's2');
    expect(after.map((i) => i.id)).toEqual([
      must(before.at(-1)).id,
      ...before.slice(0, -1).map((i) => i.id),
    ]);
    expect(after.map((i) => i.order)).toEqual(before.map((i) => i.order));
    expect(next.history.length).toBe(ds.history.length);
  });

  it('перенос в бэклог на позицию: история sprintId и order', () => {
    const next = applied(
      ds,
      moveIssue(viewOf(ds), 'i10', { sprintId: null, index: 0 }, 'u1', testCtx()),
    );
    const backlog = containerItems(viewOf(next), null).map((i) => i.id);
    expect(backlog[0]).toBe('i10');
    expect(issueOf(next, 'i10').sprintId).toBeNull();
    const orders = next.issues.map((i) => i.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('перенос в спринт вместе с подзадачами', () => {
    const next = applied(
      ds,
      moveIssue(viewOf(ds), 'i11', { sprintId: 's2', index: 99 }, 'u1', testCtx()),
    );
    expect(issueOf(next, 'i11').sprintId).toBe('s2');
    expect(containerItems(viewOf(next), 's2').at(-1)?.id).toBe('i11');
  });

  it('Sub-task отдельно не переносится', () => {
    expect(
      errors(moveIssue(viewOf(ds), 'i14', { sprintId: null, index: 0 }, 'u1', testCtx())).form,
    ).toContain('родителем');
  });
});

describe('links, comments, projects', () => {
  it('добавляет и удаляет связь', () => {
    const next = applied(ds, addLink(viewOf(ds), 'i11', 'i10', 'relates', testCtx()));
    const link = must(next.links.at(-1));
    expect(link).toMatchObject({ fromId: 'i11', toId: 'i10', type: 'relates' });
    const view = viewOf(next);
    const removed = applied(next, removeLink(view, link.id));
    expect(removed.links.length).toBe(ds.links.length);
    expect(removeLink(view, 'nope').ok).toBe(false);
  });

  it('связи: сама с собой, повтор, симметричная relates', () => {
    const view = viewOf(ds);
    expect(errors(addLink(view, 'i9', 'i9', 'blocks', testCtx())).toId).toContain('самой собой');
    expect(errors(addLink(view, 'i9', 'i10', 'blocks', testCtx())).toId).toContain('уже есть');
    const withRel = viewOf(applied(ds, addLink(view, 'i11', 'i10', 'relates', testCtx())));
    expect(errors(addLink(withRel, 'i10', 'i11', 'relates', testCtx())).toId).toContain('уже есть');
    expect(addLink(view, 'i10', 'i9', 'blocks', testCtx()).ok).toBe(true);
  });

  it('комментарии: текст обязателен и ограничен', () => {
    const next = applied(ds, addComment(viewOf(ds), 'i9', 'u2', ' Готово ', testCtx()));
    expect(next.comments.at(-1)).toMatchObject({ issueId: 'i9', authorId: 'u2', text: 'Готово' });
    expect(errors(addComment(viewOf(ds), 'i9', 'u2', '  ', testCtx())).text).toContain('пустым');
    expect(errors(addComment(viewOf(ds), 'i9', 'u2', 'x'.repeat(5001), testCtx())).text).toContain(
      'длиннее',
    );
  });

  it('проект: ключ и название', () => {
    const r = createProject(ds.projects, { key: 'OPS', name: ' Эксплуатация ' }, testCtx());
    expect(r.ok && r.changes.projects?.[0]).toMatchObject({ key: 'OPS', name: 'Эксплуатация' });
    expect(errors(createProject(ds.projects, { key: 'demo', name: 'x' }, testCtx())).key).toContain(
      'заглавных',
    );
    expect(errors(createProject(ds.projects, { key: 'DEMO', name: 'x' }, testCtx())).key).toContain(
      'занят',
    );
    expect(errors(createProject(ds.projects, { key: 'OPS', name: '' }, testCtx())).name).toContain(
      'название',
    );
  });
});
