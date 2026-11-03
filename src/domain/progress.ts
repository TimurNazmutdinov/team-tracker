import { canHavePoints } from './hierarchy';
import type { Issue } from './schema';

export interface EpicProgress {
  /** Сколько задач учтено (Task и Bug эпика и его под-эпиков). */
  count: number;
  /** Сумма story points этих задач; задачи без оценки считаются как 0. */
  total: number;
  /** Сумма story points задач в статусе Done. */
  done: number;
  /** Доля выполненного, целые проценты; 0, если points нет. */
  percent: number;
}

/**
 * Прогресс эпика или под-эпика: у них points нет, поэтому он вычисляется по Task и Bug внутри —
 * прямым и вложенным в под-эпики (ADR-024). Нигде не хранится и не входит в velocity и burndown.
 */
export function epicProgress(issues: Issue[], epicId: string): EpicProgress {
  const containers = new Set([epicId]);
  for (const i of issues) if (i.parentId === epicId && i.type === 'Sub-epic') containers.add(i.id);
  const children = issues.filter(
    (i) => i.parentId !== null && containers.has(i.parentId) && canHavePoints(i.type),
  );
  const total = children.reduce((sum, i) => sum + (i.points ?? 0), 0);
  const done = children
    .filter((i) => i.status === 'Done')
    .reduce((sum, i) => sum + (i.points ?? 0), 0);
  return {
    count: children.length,
    total,
    done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
