import { describe, expect, it } from 'vitest';
import type { View } from './actions';
import { DOD_MAX, dodItems, dodRequired, updateDod } from './dod';

const project = (dod: string) => ({ dod });

describe('Definition of Done', () => {
  it('берёт пункты чек-листа, игнорируя прочий текст и отметки', () => {
    expect(
      dodItems(project('Заголовок\n- [ ] Первое\n- [x] Второе\nпросто строка\n- [ ]')),
    ).toEqual(['Первое', 'Второе']);
    expect(dodItems(project(''))).toEqual([]);
  });

  it('подтверждение нужно только при переходе в Done и непустом списке', () => {
    const p = project('- [ ] Тесты');
    expect(dodRequired(p, 'In Progress', 'Done')).toBe(true);
    expect(dodRequired(p, { status: 'Review' }, 'Done')).toBe(true);
    expect(dodRequired(p, 'Done', 'Done')).toBe(false);
    expect(dodRequired(p, 'Done', 'Review')).toBe(false);
    expect(dodRequired(p, 'To Do', 'Review')).toBe(false);
    expect(dodRequired(project(''), 'Review', 'Done')).toBe(false);
  });

  it('сохраняет список; без изменений — пусто; слишком длинный — ошибка', () => {
    const view = { project: { id: 'p1', dod: '- [ ] A' } } as unknown as View;
    const changed = updateDod(view, '- [ ] A\n- [ ] B');
    expect(changed.ok && changed.changes.projects?.[0]?.dod).toBe('- [ ] A\n- [ ] B');
    const same = updateDod(view, '- [ ] A');
    expect(same.ok && same.changes).toEqual({});
    const long = updateDod(view, 'x'.repeat(DOD_MAX + 1));
    expect(!long.ok && long.errors.dod).toBeTruthy();
  });
});
