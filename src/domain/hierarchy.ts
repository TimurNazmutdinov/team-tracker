import type { IssueType } from './schema';

// ADR-003, п. 6, и ADR-024: Epic → Sub-epic → Task | Bug → Sub-task. Под-эпик — отдельный уровень
// внутри эпика; Task и Bug входят в эпик или в под-эпик. Points только у Task и Bug.

const PARENT_TYPES: Record<IssueType, readonly (IssueType | null)[]> = {
  Epic: [null],
  'Sub-epic': ['Epic'],
  Task: [null, 'Epic', 'Sub-epic'],
  Bug: [null, 'Epic', 'Sub-epic'],
  'Sub-task': ['Task', 'Bug'],
};

const ESTIMATED: readonly IssueType[] = ['Task', 'Bug'];

/** Типы-контейнеры: points не ставятся, прогресс считается по вложенным задачам. */
export const CONTAINER_TYPES: readonly IssueType[] = ['Epic', 'Sub-epic'];

/** Допустим ли родитель такого типа (null — без родителя) для задачи данного типа. */
export function isValidParent(type: IssueType, parentType: IssueType | null): boolean {
  return PARENT_TYPES[type].includes(parentType);
}

/** Ставятся ли story points на задачи этого типа. */
export function canHavePoints(type: IssueType): boolean {
  return ESTIMATED.includes(type);
}

/** Эпик или под-эпик: собирает задачи, своего статуса работы и points у него нет. */
export function isContainer(type: IssueType): boolean {
  return CONTAINER_TYPES.includes(type);
}

/** Обязателен ли родитель (под-эпик — только внутри эпика, подзадача — внутри задачи). */
export function needsParent(type: IssueType): boolean {
  return !PARENT_TYPES[type].includes(null);
}

/** Типы, которые могут быть родителем задачи данного типа. */
export function parentTypes(type: IssueType): IssueType[] {
  return PARENT_TYPES[type].filter((t): t is IssueType => t !== null);
}
