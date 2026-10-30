import { describe, expect, it } from 'vitest';
import { checklistItems, checklistProgress, toggleChecklistItem } from './checklist';

const text = [
  'Критерии:',
  '- [x] Страница открывается',
  '- [ ] Видна сумма',
  '  * [ ] вложенный пункт',
  '1. [X] нумерованный',
  '- обычный пункт',
  '- [] не пункт',
  '',
  '```',
  '- [ ] внутри кода',
  '```',
  '- [ ] после кода',
].join('\n');

describe('чек-лист', () => {
  it('находит пункты по порядку, пропуская код и обычные списки', () => {
    expect(checklistItems(text).map((i) => [i.checked, i.text])).toEqual([
      [true, 'Страница открывается'],
      [false, 'Видна сумма'],
      [false, 'вложенный пункт'],
      [true, 'нумерованный'],
      [false, 'после кода'],
    ]);
  });

  it('считает прогресс', () => {
    expect(checklistProgress(text)).toEqual({ done: 2, total: 5 });
    expect(checklistProgress('без пунктов')).toEqual({ done: 0, total: 0 });
    expect(checklistProgress('')).toEqual({ done: 0, total: 0 });
  });

  it('переключает пункт в обе стороны и не трогает остальное', () => {
    const on = toggleChecklistItem(text, 1);
    expect(on.split('\n')[2]).toBe('- [x] Видна сумма');
    expect(toggleChecklistItem(on, 1)).toBe(text);
    const off = toggleChecklistItem(text, 3);
    expect(off.split('\n')[4]).toBe('1. [ ] нумерованный');
    // пункт внутри блока кода не переключается: пятый пункт — «после кода»
    expect(toggleChecklistItem(text, 4).split('\n')[11]).toBe('- [x] после кода');
    expect(toggleChecklistItem(text, 4).split('\n')[9]).toBe('- [ ] внутри кода');
  });

  it('неверный номер и перевод строк Windows', () => {
    expect(toggleChecklistItem(text, 9)).toBe(text);
    expect(toggleChecklistItem(text, -1)).toBe(text);
    const crlf = '- [ ] один\r\n- [x] два';
    expect(checklistItems(crlf).map((i) => i.text)).toEqual(['один', 'два']);
    expect(toggleChecklistItem(crlf, 0)).toBe('- [x] один\r\n- [x] два');
  });
});
