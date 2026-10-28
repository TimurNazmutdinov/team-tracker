import { canHavePoints } from './hierarchy';
import type { Issue } from './schema';

export interface EpicProgress {
  /** Сколько задач учтено (прямые потомки Epic типа Story, Task, Bug). */
  count: number;
  /** Сумма story points этих задач; задачи без оценки считаются как 0. */
  total: number;
  /** Сумма story points задач в статусе Done. */
  done: number;
  /** Доля выполненного, целые проценты; 0, если points нет. */
  percent: number;
}

/**
 * Прогресс Epic: у самого Epic points нет, поэтому он вычисляется по прямым потомкам Story, Task и Bug.
 * Нигде не хранится и не входит в velocity и burndown.
 */
export function epicProgress(issues: Issue[], epicId: string): EpicProgress {
  const children = issues.filter((i) => i.parentId === epicId && canHavePoints(i.type));
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
