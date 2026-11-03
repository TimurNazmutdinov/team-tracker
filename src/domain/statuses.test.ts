import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATUSES,
  addStatus,
  archiveStatus,
  boardStatuses,
  categoryOf,
  isDoneStatus,
  moveStatus,
  renameStatus,
  setStatusCategory,
  statusRuleErrors,
  type StatusDef,
} from './statuses';

let seq = 0;
const newId = () => `n${++seq}`;
/** Колонки после правки: изменённые записи поверх прежних. */
const apply = (base: readonly StatusDef[], changed: StatusDef[]) =>
  base
    .map((s) => changed.find((c) => c.id === s.id) ?? s)
    .concat(changed.filter((c) => !base.some((s) => s.id === c.id)));
const names = (list: readonly StatusDef[]) => boardStatuses(list).map((s) => s.name);

describe('колонки досок (D-1, ADR-024)', () => {
  it('по умолчанию — прежние пять статусов; Backlog вне доски', () => {
    expect(names(DEFAULT_STATUSES)).toEqual(['To Do', 'In Progress', 'Review', 'Done']);
    expect(categoryOf(DEFAULT_STATUSES, 'Review')).toBe('progress');
    expect(isDoneStatus(DEFAULT_STATUSES, 'Done')).toBe(true);
  });

  it('новая колонка встаёт перед первой «готово», название уникально', () => {
    const r = addStatus(DEFAULT_STATUSES, { name: 'Тестирование' }, newId);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const next = apply(DEFAULT_STATUSES, r.statuses);
    expect(names(next)).toEqual(['To Do', 'In Progress', 'Review', 'Тестирование', 'Done']);
    expect(addStatus(next, { name: 'тестирование' }, newId).ok).toBe(false);
    expect(addStatus(next, { name: '  ' }, newId).ok).toBe(false);
  });

  it('переименование не меняет id: задачи и история остаются на месте', () => {
    const r = renameStatus(DEFAULT_STATUSES, 'Done', 'Готово');
    if (!r.ok) throw new Error('ожидался успех');
    expect(r.statuses).toEqual([{ ...DEFAULT_STATUSES[4], name: 'Готово' }]);
  });

  it('сдвиг влево, вправо и на место', () => {
    const left = moveStatus(DEFAULT_STATUSES, 'Review', { delta: -1 });
    if (!left.ok) throw new Error('ожидался успех');
    expect(names(apply(DEFAULT_STATUSES, left.statuses))).toEqual([
      'To Do',
      'Review',
      'In Progress',
      'Done',
    ]);
    const first = moveStatus(DEFAULT_STATUSES, 'Done', { to: 0 });
    if (!first.ok) throw new Error('ожидался успех');
    expect(names(apply(DEFAULT_STATUSES, first.statuses))[0]).toBe('Done');
    const edge = moveStatus(DEFAULT_STATUSES, 'To Do', { delta: -1 });
    expect(edge.ok && edge.statuses).toEqual([]);
  });

  it('тип колонки: должны остаться «не начато» и «готово»', () => {
    expect(setStatusCategory(DEFAULT_STATUSES, 'Done', 'progress').ok).toBe(false);
    expect(setStatusCategory(DEFAULT_STATUSES, 'Review', 'done').ok).toBe(true);
    expect(setStatusCategory(DEFAULT_STATUSES, 'Backlog', 'todo').ok).toBe(false);
  });

  it('удаление — отметкой archived, нужна колонка для переноса задач', () => {
    const r = archiveStatus(DEFAULT_STATUSES, 'Review', 'In Progress');
    if (!r.ok) throw new Error('ожидался успех');
    const next = apply(DEFAULT_STATUSES, r.statuses);
    expect(names(next)).toEqual(['To Do', 'In Progress', 'Done']);
    expect(next.find((s) => s.id === 'Review')?.name).toBe('Review');
    expect(archiveStatus(DEFAULT_STATUSES, 'Done', 'Done').ok).toBe(false);
    expect(archiveStatus(DEFAULT_STATUSES, 'Done', 'Review').ok).toBe(false);
    expect(archiveStatus(DEFAULT_STATUSES, 'Backlog', 'To Do').ok).toBe(false);
  });

  it('правила набора колонок', () => {
    expect(statusRuleErrors(DEFAULT_STATUSES)).toEqual([]);
    const noDone = DEFAULT_STATUSES.map((s) => (s.id === 'Done' ? { ...s, archived: true } : s));
    expect(statusRuleErrors(noDone).join(' ')).toContain('готово');
  });
});
