import type { IssueType } from './schema';

// ADR-003, п. 6: Epic → Story | Task | Bug → Sub-task. Points только у Story, Task и Bug.

const PARENT_TYPES: Record<IssueType, readonly (IssueType | null)[]> = {
  Epic: [null],
  Story: [null, 'Epic'],
  Task: [null, 'Epic'],
  Bug: [null, 'Epic'],
  'Sub-task': ['Story', 'Task', 'Bug'],
};

const ESTIMATED: readonly IssueType[] = ['Story', 'Task', 'Bug'];

/** Допустим ли родитель такого типа (null — без родителя) для задачи данного типа. */
export function isValidParent(type: IssueType, parentType: IssueType | null): boolean {
  return PARENT_TYPES[type].includes(parentType);
}

/** Ставятся ли story points на задачи этого типа. */
export function canHavePoints(type: IssueType): boolean {
  return ESTIMATED.includes(type);
}
