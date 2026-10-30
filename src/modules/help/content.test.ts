import { describe, expect, it } from 'vitest';
import { ROLES, can } from '../../domain/permissions';
import { SCREEN_KEYS } from '../quick/CommandPalette';
import { ACTION_LABELS, HOTKEYS, RULES, permissionRows } from './content';

describe('справка', () => {
  it('таблица прав совпадает с проверкой прав и охватывает все действия', () => {
    const rows = permissionRows();
    expect(rows).toHaveLength(Object.keys(ACTION_LABELS).length);
    for (const row of rows) {
      for (const role of ROLES) expect(row.allowed[role]).toBe(can(role, row.action));
    }
    // у администратора есть всё
    expect(rows.every((r) => r.allowed.admin)).toBe(true);
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
