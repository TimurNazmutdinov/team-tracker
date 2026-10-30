import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { containerItems, type Result } from './actions';
import { bulkUpdate, isEmptyPatch } from './bulk';
import { parseDataset } from './dataset';
import type { Dataset } from './schema';
import { applyChanges, replayErrors, testCtx, viewOf } from './testing';

const ds = seed as unknown as Dataset;
const view = () => viewOf(ds);
const byNumber = (n: number) => {
  const found = ds.issues.find((i) => i.number === n);
  if (!found) throw new Error(`нет DEMO-${n}`);
  return found;
};

function applied(base: Dataset, r: Result): Dataset {
  if (!r.ok) throw new Error(`ожидался успех: ${JSON.stringify(r.errors)}`);
  const next = applyChanges(base, r.changes);
  const parsed = parseDataset(next);
  expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  expect(replayErrors(next)).toEqual([]);
  return next;
}

describe('bulkUpdate', () => {
  it('меняет статус нескольких задач и пишет по одной записи истории на задачу', () => {
    const ids = [byNumber(5).id, byNumber(10).id, byNumber(4).id]; // To Do, To Do, In Progress
    const r = bulkUpdate(view(), ids, { status: 'Review' }, 'u1', testCtx());
    const next = applied(ds, r);
    for (const id of ids) expect(next.issues.find((i) => i.id === id)?.status).toBe('Review');
    const added = next.history.slice(ds.history.length);
    expect(added).toHaveLength(3);
    expect(added.every((h) => h.field === 'status' && h.to === 'Review')).toBe(true);
    expect(new Set(added.map((h) => h.issueId)).size).toBe(3);
  });

  it('задачи без изменений не получают записей', () => {
    const ids = [byNumber(8).id, byNumber(4).id]; // DEMO-8 уже в Review
    const r = bulkUpdate(view(), ids, { status: 'Review' }, 'u1', testCtx());
    const next = applied(ds, r);
    expect(next.history.length - ds.history.length).toBe(1);
  });

  it('исполнитель, приоритет и метка', () => {
    const ids = [byNumber(5).id, byNumber(10).id];
    const r = bulkUpdate(
      view(),
      ids,
      { assigneeId: 'u4', priority: 'Highest', addLabel: ' срочно ' },
      'u1',
      testCtx(),
    );
    const next = applied(ds, r);
    for (const id of ids) {
      const i = next.issues.find((x) => x.id === id);
      expect(i).toMatchObject({ assigneeId: 'u4', priority: 'Highest' });
      expect(i?.labels).toContain('срочно');
    }
    // метка не дублируется при повторе
    const again = applied(
      next,
      bulkUpdate(viewOf(next), ids, { addLabel: 'срочно' }, 'u1', testCtx()),
    );
    expect(
      again.issues.find((i) => i.id === ids[0])?.labels.filter((l) => l === 'срочно'),
    ).toHaveLength(1);
  });

  it('перенос в спринт: задачи встают в конец списка по порядку и пишутся в историю', () => {
    const ids = [byNumber(5).id, byNumber(10).id]; // из идущего спринта в запланированный
    const before = containerItems(view(), 's3').length;
    const r = bulkUpdate(view(), ids, { sprintId: 's3' }, 'u1', testCtx());
    const next = applied(ds, r);
    const list = containerItems(viewOf(next), 's3');
    expect(list).toHaveLength(before + 2);
    expect(list.slice(-2).map((i) => i.id)).toEqual(ids);
    expect(
      next.history.slice(ds.history.length).filter((h) => h.field === 'sprintId'),
    ).toHaveLength(2);
  });

  it('всё или ничего: если одну задачу изменить нельзя, не меняется ни одна', () => {
    const closed = ds.issues.find((i) => i.sprintId === 's1');
    if (!closed) throw new Error('нет задачи в закрытом спринте');
    const ids = [byNumber(5).id, closed.id];
    const r = bulkUpdate(view(), ids, { priority: 'Low' }, 'u1', testCtx());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.form).toContain('Не изменена ни одна задача');
    expect(!r.ok && r.errors.form).toContain('DEMO-');
  });

  it('подзадачу в другой спринт отдельно перенести нельзя', () => {
    const sub = ds.issues.find((i) => i.type === 'Sub-task' && i.sprintId === 's2');
    if (!sub) throw new Error('нет подзадачи');
    const r = bulkUpdate(view(), [sub.id], { sprintId: 's3' }, 'u1', testCtx());
    expect(r.ok).toBe(false);
  });

  it('пустой набор задач или пустое изменение — без изменений', () => {
    const empty = bulkUpdate(view(), [], { status: 'Done' }, 'u1', testCtx());
    expect(empty.ok && empty.changes).toEqual({});
    const noop = bulkUpdate(view(), [byNumber(5).id], {}, 'u1', testCtx());
    expect(noop.ok && noop.changes).toEqual({});
    expect(isEmptyPatch({ addLabel: '  ' })).toBe(true);
    expect(isEmptyPatch({ assigneeId: null })).toBe(false);
  });

  it('неизвестная задача — ошибка', () => {
    const r = bulkUpdate(view(), ['нет'], { status: 'Done' }, 'u1', testCtx());
    expect(r.ok).toBe(false);
  });
});
