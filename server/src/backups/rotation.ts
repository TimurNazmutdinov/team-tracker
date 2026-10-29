// Имена комплектов и ротация (ADR-012). Комплект — папка ГГГГ-ММ-ДД_ЧЧ-ММ по местному времени.
// Ротация трогает только папки с таким именем: чужие файлы и комплекты `before-restore_…` не удаляются.

export const BUNDLE_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})$/;
export const SAFETY_PREFIX = 'before-restore_';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function bundleName(d: Date, prefix = ''): string {
  return `${prefix}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/** Время создания комплекта по имени папки (местное), null — имя не комплект. */
export function bundleDate(name: string): Date | null {
  const m = BUNDLE_RE.exec(
    name.startsWith(SAFETY_PREFIX) ? name.slice(SAFETY_PREFIX.length) : name,
  );
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return new Date(y, mo - 1, d, h, mi);
}

/**
 * Какие комплекты удалить: остаются последний комплект каждого из `keepDaily` последних дней и
 * последний комплект каждого из `keepMonthly` последних месяцев; остальное удаляется.
 */
export function planRotation(names: string[], keepDaily: number, keepMonthly: number): string[] {
  const bundles = names
    .filter((n) => BUNDLE_RE.test(n))
    .sort()
    .reverse(); // новые первыми
  const keep = new Set<string>();
  const days = new Set<string>();
  const months = new Set<string>();
  for (const name of bundles) {
    const day = name.slice(0, 10);
    const month = name.slice(0, 7);
    if (!days.has(day)) {
      days.add(day);
      if (days.size <= keepDaily) keep.add(name);
    }
    if (!months.has(month)) {
      months.add(month);
      if (months.size <= keepMonthly) keep.add(name);
    }
  }
  return bundles.filter((n) => !keep.has(n));
}
