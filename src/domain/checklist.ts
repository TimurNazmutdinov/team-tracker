// Чек-листы в Markdown (ADR-017): строки «- [ ] текст» и «- [x] текст» — пункты с отметкой.
// Чистые функции над текстом; пункты внутри блоков кода (```) не считаются.

const ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](\s.*|)$/;

export interface ChecklistItem {
  /** Номер строки в тексте, с нуля. */
  line: number;
  checked: boolean;
  text: string;
}

/** Пункты чек-листа по порядку; внутри блоков кода пропускаются. */
export function checklistItems(text: string): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  let fence: string | null = null;
  text.split('\n').forEach((raw, line) => {
    const row = raw.replace(/\r$/, '');
    const marker = /^\s*(```+|~~~+)/.exec(row)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0] ?? null;
      else if (marker[0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const m = ITEM.exec(row);
    if (m) out.push({ line, checked: m[2] !== ' ', text: (m[3] ?? '').trim() });
  });
  return out;
}

export interface ChecklistProgress {
  done: number;
  total: number;
}

export function checklistProgress(text: string): ChecklistProgress {
  const items = checklistItems(text);
  return { done: items.filter((i) => i.checked).length, total: items.length };
}

/** Переключает отметку пункта с номером `index` (по порядку); неверный номер — текст без изменений. */
export function toggleChecklistItem(text: string, index: number): string {
  const item = checklistItems(text)[index];
  if (!item) return text;
  const lines = text.split('\n');
  const row = lines[item.line] ?? '';
  lines[item.line] = row.replace(/\[( |x|X)\]/, item.checked ? '[ ]' : '[x]');
  return lines.join('\n');
}
