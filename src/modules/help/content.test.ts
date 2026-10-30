import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLES, can } from '../../domain/permissions';
import { ACTIONS } from '../../domain/roles';
import { SCREEN_KEYS } from '../quick/CommandPalette';
import { HOTKEYS, RULES, permissionRows } from './content';

describe('справка', () => {
  it('таблица прав совпадает с проверкой прав и охватывает все функции', () => {
    const rows = permissionRows(DEFAULT_ROLES);
    expect(rows.map((r) => r.action)).toEqual([...ACTIONS]);
    for (const row of rows) {
      for (const role of DEFAULT_ROLES)
        expect(row.allowed[role.id]).toBe(can(DEFAULT_ROLES, role.id, row.action));
    }
    // у администратора есть всё
    expect(rows.every((r) => r.allowed['admin'])).toBe(true);
  });

  it('таблица строится по настроенным ролям, в том числе новым', () => {
    const roles = [
      ...DEFAULT_ROLES,
      { id: 'viewer', name: 'Наблюдатель', permissions: [], system: false },
    ];
    const rows = permissionRows(roles);
    expect(rows.every((r) => r.allowed['viewer'] === false)).toBe(true);
  });

  it('клавиши и правила заполнены, названия не повторяются', () => {
    expect(HOTKEYS.every((h) => h.keys && h.action)).toBe(true);
    expect(new Set(HOTKEYS.map((h) => h.keys)).size).toBe(HOTKEYS.length);
    expect(RULES.every((r) => r.title && r.text.length > 20)).toBe(true);
    expect(new Set(RULES.map((r) => r.title)).size).toBe(RULES.length);
  });

  it('упомянутые в справке клавиши G + буква есть среди горячих клавиш палитры', () => {
    const letters = HOTKEYS.filter((h) => h.keys.startsWith('G, затем')).map((h) =>
      h.keys.slice(-1),
    );
    expect(letters.sort()).toEqual(
      Object.keys(SCREEN_KEYS)
        .map((k) => k.toUpperCase())
        .sort(),
    );
  });
});
