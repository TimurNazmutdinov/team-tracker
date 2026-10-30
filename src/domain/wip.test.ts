import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import type { Result } from './actions';
import { parseDataset } from './dataset';
import { violations } from './permissions';
import type { Dataset, Project } from './schema';
import { applyChanges, viewOf } from './testing';
import { updateWipSettings, wipAfterMove, wipLimit, wipMessage, wipOverflows } from './wip';

const ds = seed as unknown as Dataset;
const view = () => viewOf(ds);
const project = (patch: Partial<Project>): Project => ({ ...view().project, ...patch });
const on = project({ wipEnabled: true, wipLimits: { 'In Progress': 3, Review: 2 } });

function applied(r: Result): Dataset {
  if (!r.ok) throw new Error(`ожидался успех: ${JSON.stringify(r.errors)}`);
  const next = applyChanges(ds, r.changes);
  const parsed = parseDataset(next);
  expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  return next;
}

describe('WIP-лимиты', () => {
  it('по умолчанию выключены и ничего не предупреждают', () => {
    const p = view().project;
    expect(p.wipEnabled).toBe(false);
    expect(wipLimit(p, 'In Progress')).toBeUndefined();
    expect(wipOverflows(p, { 'In Progress': 99 })).toEqual([]);
    expect(wipAfterMove(p, { 'In Progress': 99 }, 'In Progress')).toBeNull();
  });

  it('при включении показывает превышение колонок с лимитом', () => {
    expect(wipLimit(on, 'In Progress')).toBe(3);
    expect(wipLimit(on, 'To Do')).toBeUndefined();
    expect(wipOverflows(on, { 'To Do': 50, 'In Progress': 4, Review: 2 })).toEqual([
      { column: 'In Progress', count: 4, limit: 3 },
    ]);
    // ровно по лимиту — не превышение
    expect(wipOverflows(on, { 'In Progress': 3 })).toEqual([]);
  });

  it('перенос в колонку: предупреждение, если станет больше лимита', () => {
    expect(wipAfterMove(on, { 'In Progress': 3 }, 'In Progress')).toEqual({
      column: 'In Progress',
      count: 4,
      limit: 3,
    });
    expect(wipAfterMove(on, { 'In Progress': 2 }, 'In Progress')).toBeNull();
    expect(wipAfterMove(on, { Review: 1 }, 'Review', 2)?.count).toBe(3);
    expect(wipAfterMove(on, { 'To Do': 40 }, 'To Do')).toBeNull();
    expect(wipMessage({ column: 'Review', count: 3, limit: 2 })).toBe(
      'WIP-лимит колонки «Review»: 3 из 2',
    );
  });
});

describe('updateWipSettings', () => {
  it('включает лимиты; пустое поле — без лимита', () => {
    const next = applied(
      updateWipSettings(view(), {
        enabled: true,
        limits: { 'In Progress': ' 3 ', Review: '', 'To Do': '' },
      }),
    );
    expect(next.projects[0]).toMatchObject({ wipEnabled: true, wipLimits: { 'In Progress': 3 } });
  });

  it('проверяет значения', () => {
    for (const bad of ['0', '-1', '2.5', 'много', '1000']) {
      const r = updateWipSettings(view(), { enabled: true, limits: { Review: bad } });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.errors.Review).toContain('1 до 999');
    }
  });

  it('те же значения — без изменений', () => {
    const r = updateWipSettings(view(), { enabled: false, limits: {} });
    expect(r.ok && r.changes).toEqual({});
  });
});

describe('права на WIP-настройки', () => {
  it('меняют тимлид и администратор, как настройки спринтов; продакт и разработчик нет', () => {
    const r = updateWipSettings(view(), { enabled: true, limits: { 'In Progress': '3' } });
    if (!r.ok) throw new Error('ожидался успех');
    expect(violations('lead', 'u4', ds, r.changes)).toEqual([]);
    expect(violations('admin', 'u9', ds, r.changes)).toEqual([]);
    expect(violations('product', 'u1', ds, r.changes)).not.toEqual([]);
    expect(violations('developer', 'u2', ds, r.changes)).not.toEqual([]);
  });
});
