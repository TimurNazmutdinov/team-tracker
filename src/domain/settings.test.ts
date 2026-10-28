import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { createProject, type Result } from './actions';
import { parseDataset } from './dataset';
import type { Dataset } from './schema';
import {
  addDays,
  nextSprintDefaults,
  nextSprintName,
  sprintSettingsOf,
  updateSprintSettings,
  type SprintSettings,
} from './settings';
import { closeSprint, createSprint } from './sprints';
import { applyChanges, testCtx, viewOf } from './testing';

const base = seed as unknown as Dataset;

function applied(ds: Dataset, r: Result): Dataset {
  if (!r.ok) throw new Error(`ожидался успех: ${JSON.stringify(r.errors)}`);
  const next = applyChanges(ds, r.changes);
  const parsed = parseDataset(next);
  expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  return next;
}

function errors(r: Result): Record<string, string> {
  if (r.ok) throw new Error('ожидалась ошибка');
  return r.errors;
}

const settings = (patch: Partial<SprintSettings> = {}): SprintSettings => ({
  ...sprintSettingsOf(viewOf(base).project),
  ...patch,
});

describe('updateSprintSettings', () => {
  it('сохраняет длительность, префикс, номер и дату старта', () => {
    const r = updateSprintSettings(
      viewOf(base),
      settings({
        sprintDurationDays: 7,
        sprintPrefix: ' Итерация ',
        nextSprintNumber: 10,
        nextSprintStart: '2026-12-01',
      }),
      testCtx(),
    );
    const next = applied(base, r);
    expect(next.projects[0]).toMatchObject({
      sprintDurationDays: 7,
      sprintPrefix: 'Итерация',
      nextSprintNumber: 10,
      nextSprintStart: '2026-12-01',
    });
  });

  it('проверяет значения и объясняет ошибки', () => {
    const view = viewOf(base);
    const e = (patch: Partial<SprintSettings>) =>
      errors(updateSprintSettings(view, settings(patch), testCtx()));
    expect(e({ sprintDurationDays: 0 }).sprintDurationDays).toContain('от 1 до 90');
    expect(e({ sprintDurationDays: 91 }).sprintDurationDays).toContain('от 1 до 90');
    expect(e({ sprintDurationDays: 2.5 }).sprintDurationDays).toContain('целое');
    expect(e({ sprintPrefix: ' ' }).sprintPrefix).toContain('префикс');
    expect(e({ nextSprintNumber: 0 }).nextSprintNumber).toContain('от 1');
    expect(e({ nextSprintStart: '1.12.2026' }).nextSprintStart).toContain('ГГГГ');
  });

  it('без изменений ничего не пишет', () => {
    const r = updateSprintSettings(viewOf(base), settings(), testCtx());
    expect(r.ok && r.changes).toEqual({});
  });
});

describe('значения для нового спринта', () => {
  it('название по префиксу и номеру, начало после последнего спринта, конец по длительности', () => {
    const d = nextSprintDefaults(viewOf(base), '2026-10-28');
    expect(d).toEqual({ name: 'Спринт 4', goal: '', start: '2026-11-21', end: '2026-12-04' });
  });

  it('заданная дата старта главнее; начало не раньше сегодняшнего дня', () => {
    const withStart = applied(
      base,
      updateSprintSettings(
        viewOf(base),
        settings({ nextSprintStart: '2026-12-07', sprintDurationDays: 7 }),
        testCtx(),
      ),
    );
    expect(nextSprintDefaults(viewOf(withStart), '2026-10-28')).toMatchObject({
      start: '2026-12-07',
      end: '2026-12-13',
    });
    expect(nextSprintDefaults(viewOf(base), '2027-01-11').start).toBe('2027-01-11');
  });

  it('занятое название пропускается', () => {
    const taken = applied(
      base,
      updateSprintSettings(viewOf(base), settings({ nextSprintNumber: 2 }), testCtx()),
    );
    expect(nextSprintName(viewOf(taken))).toEqual({ name: 'Спринт 4', number: 4 });
  });

  it('addDays переходит через границы месяцев и лет', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-30', 13)).toBe('2026-12-13');
  });
});

describe('счётчик номера и дата-подсказка при создании спринта', () => {
  it('предложенное название увеличивает номер, своё — нет', () => {
    const view = viewOf(base);
    const def = nextSprintDefaults(view, '2026-10-28');
    const next = applied(base, createSprint(view, def, testCtx()));
    expect(next.projects[0]?.nextSprintNumber).toBe(5);
    const custom = applied(base, createSprint(view, { ...def, name: 'Особый спринт' }, testCtx()));
    expect(custom.projects[0]?.nextSprintNumber).toBe(4);
  });

  it('заданная дата старта гасится после использования', () => {
    const withStart = applied(
      base,
      updateSprintSettings(viewOf(base), settings({ nextSprintStart: '2026-12-07' }), testCtx()),
    );
    const view = viewOf(withStart);
    const next = applied(
      withStart,
      createSprint(view, nextSprintDefaults(view, '2026-10-28'), testCtx()),
    );
    expect(next.projects[0]?.nextSprintStart).toBeNull();
  });

  it('новый спринт при закрытии тоже учитывается', () => {
    const view = viewOf(base);
    const def = nextSprintDefaults(view, '2026-10-28');
    const next = applied(
      base,
      closeSprint(view, 's2', { kind: 'new', sprint: def }, 'u1', testCtx('2026-11-06T18:00:00Z')),
    );
    expect(next.projects[0]?.nextSprintNumber).toBe(5);
  });

  it('новый проект получает настройки по умолчанию', () => {
    const r = createProject(base.projects, { key: 'OPS', name: 'Эксплуатация' }, testCtx());
    expect(r.ok && r.changes.projects?.[0]).toMatchObject({
      sprintDurationDays: 14,
      sprintPrefix: 'Спринт',
      nextSprintNumber: 1,
      nextSprintStart: null,
    });
  });
});
