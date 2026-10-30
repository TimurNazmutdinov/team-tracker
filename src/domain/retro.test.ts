import { describe, expect, it } from 'vitest';
import { viewOf, testCtx, applyChanges } from './testing';
import { addRetroItem, deleteRetroItem, retroOf, retroToIssue } from './retro';
import { parseDataset } from './dataset';
import { checkIntegrity } from './integrity';
import seed from '../../data/seed.json';

const parsed = parseDataset(seed);
if (!parsed.ok) throw new Error('seed не разобран');
const ds = parsed.data;
const view = () => viewOf(ds, 'p1');

describe('ретроспектива', () => {
  it('читает записи спринта по порядку', () => {
    const items = retroOf(view(), 's1');
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((r) => r.createdAt)).toEqual([...items.map((r) => r.createdAt)].sort());
    expect(retroOf(view(), 's3')).toEqual([]);
  });

  it('добавляет запись с автором и временем, обрезая пробелы', () => {
    const r = addRetroItem(
      view(),
      { sprintId: 's2', kind: 'good', text: '  Хороший демо-день ' },
      'u2',
      testCtx(),
    );
    expect(r.ok && r.changes.retroItems?.[0]).toMatchObject({
      projectId: 'p1',
      sprintId: 's2',
      kind: 'good',
      text: 'Хороший демо-день',
      authorId: 'u2',
      issueId: null,
    });
  });

  it('проверяет спринт, список и текст', () => {
    const bad = addRetroItem(
      view(),
      { sprintId: 'zz', kind: 'x' as never, text: ' ' },
      'u1',
      testCtx(),
    );
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(['form', 'kind', 'text']);
    const long = addRetroItem(
      view(),
      { sprintId: 's1', kind: 'good', text: 'я'.repeat(501) },
      'u1',
      testCtx(),
    );
    expect(long.ok).toBe(false);
  });

  it('удаляет существующую запись', () => {
    const id = retroOf(view(), 's1')[0]?.id ?? '';
    const r = deleteRetroItem(view(), id);
    expect(r.ok && r.changes.deleteRetroItemIds).toEqual([id]);
    expect(deleteRetroItem(view(), 'zz').ok).toBe(false);
  });

  it('действие становится задачей бэклога и получает ссылку', () => {
    const action = retroOf(view(), 's1').find((r) => r.kind === 'action');
    expect(action).toBeTruthy();
    const r = retroToIssue(view(), action?.id ?? '', 'u1', testCtx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const issue = r.changes.issues?.[0];
    expect(issue).toMatchObject({
      type: 'Task',
      sprintId: null,
      title: action?.text,
      labels: ['ретро'],
    });
    expect(r.changes.history?.some((h) => h.field === 'created' && h.issueId === issue?.id)).toBe(
      true,
    );
    expect(r.changes.retroItems?.[0]?.issueId).toBe(issue?.id);
    const after = applyChanges(ds, r.changes);
    expect(checkIntegrity(after)).toEqual([]);
    // повторно нельзя
    const again = retroToIssue(viewOf(after, 'p1'), action?.id ?? '', 'u1', testCtx());
    expect(!again.ok && again.errors.form).toMatch(/уже/);
  });

  it('в задачу превращаются только действия; длинный текст уходит в описание', () => {
    const good = retroOf(view(), 's1').find((r) => r.kind === 'good');
    const r = retroToIssue(view(), good?.id ?? '', 'u1', testCtx());
    expect(!r.ok && r.errors.form).toMatch(/только действия/);

    const long = 'д'.repeat(300);
    const added = addRetroItem(
      view(),
      { sprintId: 's1', kind: 'action', text: long },
      'u1',
      testCtx(),
    );
    if (!added.ok) throw new Error('не добавилось');
    const withLong = applyChanges(ds, added.changes);
    const id = added.changes.retroItems?.[0]?.id ?? '';
    const made = retroToIssue(viewOf(withLong, 'p1'), id, 'u1', testCtx());
    expect(made.ok && made.changes.issues?.[0]?.title.length).toBe(200);
    expect(made.ok && made.changes.issues?.[0]?.description).toContain(long);
  });
});
