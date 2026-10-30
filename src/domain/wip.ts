import type { Ctx, FieldErrors, Result, View } from './actions';
import { WIP_COLUMNS, type Project, type WipColumn } from './schema';

// WIP-лимиты колонок доски (ADR-017): настройка проекта, по умолчанию выключена. Превышение —
// предупреждение, а не запрет.

export const WIP_MAX = 999;

export type WipLimits = Partial<Record<WipColumn, number>>;

export interface WipInput {
  enabled: boolean;
  /** Лимиты как введены в полях: пусто — без лимита. */
  limits: Partial<Record<WipColumn, string>>;
}

export interface WipOverflow {
  column: WipColumn;
  count: number;
  limit: number;
}

/** Лимит колонки; undefined — лимита нет или WIP выключен. */
export function wipLimit(project: Pick<Project, 'wipEnabled' | 'wipLimits'>, column: string) {
  if (!project.wipEnabled) return undefined;
  return (project.wipLimits as WipLimits)[column as WipColumn];
}

/** Колонки, в которых задач больше лимита. */
export function wipOverflows(
  project: Pick<Project, 'wipEnabled' | 'wipLimits'>,
  counts: Partial<Record<string, number>>,
): WipOverflow[] {
  const out: WipOverflow[] = [];
  for (const column of WIP_COLUMNS) {
    const limit = wipLimit(project, column);
    const count = counts[column] ?? 0;
    if (limit !== undefined && count > limit) out.push({ column, count, limit });
  }
  return out;
}

/** Превысит ли лимит колонки перенос в неё ещё одной задачи; null — не превысит. */
export function wipAfterMove(
  project: Pick<Project, 'wipEnabled' | 'wipLimits'>,
  counts: Partial<Record<string, number>>,
  column: string,
  adding = 1,
): WipOverflow | null {
  const limit = wipLimit(project, column);
  if (limit === undefined) return null;
  const count = (counts[column] ?? 0) + adding;
  return count > limit ? { column: column as WipColumn, count, limit } : null;
}

export function wipMessage(o: WipOverflow): string {
  return `WIP-лимит колонки «${o.column}»: ${o.count} из ${o.limit}`;
}

/** Сохраняет настройки WIP проекта; пустое поле лимита — колонка без лимита. */
export function updateWipSettings(view: View, input: WipInput, _ctx?: Ctx): Result {
  const errors: FieldErrors = {};
  const limits: WipLimits = {};
  for (const column of WIP_COLUMNS) {
    const raw = (input.limits[column] ?? '').trim();
    if (raw === '') continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > WIP_MAX) {
      errors[column] = `Целое число от 1 до ${WIP_MAX} или пусто`;
      continue;
    }
    limits[column] = n;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const project = view.project;
  if (
    project.wipEnabled === input.enabled &&
    JSON.stringify(project.wipLimits) === JSON.stringify(limits)
  )
    return { ok: true, changes: {} };
  return {
    ok: true,
    changes: { projects: [{ ...project, wipEnabled: input.enabled, wipLimits: limits }] },
  };
}
