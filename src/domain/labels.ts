import type { Issue } from './schema';

// Метки задач (D-2, ADR-024): подсказки при вводе, группы по приставке, фильтры-чипы.

export interface LabelStat {
  label: string;
  /** Сколько задач с этой меткой. */
  count: number;
}

const byRu = (a: string, b: string) => a.localeCompare(b, 'ru');

/** Метки задач с числом использований: частые первыми, затем по алфавиту. */
export function labelStats(issues: readonly Issue[]): LabelStat[] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    for (const label of issue.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || byRu(a.label, b.label));
}

/**
 * Группа метки по приставке до двоеточия: «система: Fabric» → группа «система», значение «Fabric».
 * Метка без приставки — без группы.
 */
export function labelGroup(label: string): { group: string | null; value: string } {
  const at = label.indexOf(':');
  if (at <= 0) return { group: null, value: label };
  const group = label.slice(0, at).trim();
  const value = label.slice(at + 1).trim();
  return group && value ? { group, value } : { group: null, value: label };
}

/** Подсказки при вводе метки: сначала начинающиеся с введённого, затем содержащие; без уже выбранных. */
export function suggestLabels(
  stats: readonly LabelStat[],
  query: string,
  chosen: readonly string[],
  limit = 6,
): LabelStat[] {
  const q = query.trim().toLocaleLowerCase('ru');
  const taken = new Set(chosen.map((c) => c.toLocaleLowerCase('ru')));
  const free = stats.filter((s) => !taken.has(s.label.toLocaleLowerCase('ru')));
  if (!q) return free.slice(0, limit);
  const lower = (s: LabelStat) => s.label.toLocaleLowerCase('ru');
  const starts = free.filter((s) => lower(s).startsWith(q));
  const contains = free.filter((s) => !lower(s).startsWith(q) && lower(s).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Добавить метку к списку: без пустых и без повторов (регистр не важен). */
export function withLabel(labels: readonly string[], label: string): string[] {
  const clean = label.trim();
  if (!clean) return [...labels];
  const lower = clean.toLocaleLowerCase('ru');
  return labels.some((l) => l.toLocaleLowerCase('ru') === lower) ? [...labels] : [...labels, clean];
}
