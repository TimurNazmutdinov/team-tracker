import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import {
  createIssue,
  moveIssue,
  updateIssue,
  createProject,
  addComment,
  type NewIssueInput,
  type Result,
} from './actions';
import type { Changes } from './changes';
import { can, canChangeStatus, isRole, ROLES, violations, type Role } from './permissions';
import type { Dataset } from './schema';
import { closeSprint, createSprint } from './sprints';
import { updateSprintSettings } from './settings';
import { testCtx, viewOf } from './testing';

const ds = seed as unknown as Dataset;

function changesOf(r: Result): Changes {
  if (!r.ok) throw new Error(`ожидался успех: ${JSON.stringify(r.errors)}`);
  return r.changes;
}

const newIssue = (patch: Partial<NewIssueInput> = {}): NewIssueInput => ({
  type: 'Task',
  title: 'Новая',
  description: '',
  acceptance: '',
  parentId: null,
  priority: 'Medium',
  points: null,
  assigneeId: null,
  labels: [],
  dueDate: null,
  sprintId: null,
  ...patch,
});

const check = (role: Role, userId: string, c: Changes) => violations(role, userId, ds, c);

describe('матрица прав', () => {
  it('совпадает с capabilities.md §2', () => {
    const rows: [Parameters<typeof can>[1], Role[]][] = [
      ['status.own', ['developer', 'product', 'lead', 'admin']],
      ['status.other', ['product', 'lead', 'admin']],
      ['backlog.rank', ['product', 'lead', 'admin']],
      ['sprint.items', ['product', 'lead', 'admin']],
      ['sprint.manage', ['lead', 'admin']],
      ['project.create', ['admin']],
      ['users.manage', ['admin']],
      ['backups.manage', ['admin']],
    ];
    for (const [action, allowed] of rows)
      expect(ROLES.filter((r) => can(r, action))).toEqual(ROLES.filter((r) => allowed.includes(r)));
  });

  it('isRole и «своя» задача', () => {
    expect(isRole('lead')).toBe(true);
    expect(isRole('boss')).toBe(false);
    expect(canChangeStatus('developer', 'u2', { assigneeId: 'u2' })).toBe(true);
    expect(canChangeStatus('developer', 'u2', { assigneeId: 'u3' })).toBe(false);
    expect(canChangeStatus('developer', 'u2', { assigneeId: null })).toBe(false);
    expect(canChangeStatus('product', 'u2', { assigneeId: null })).toBe(true);
  });
});

describe('violations', () => {
  const own = ds.issues.find(
    (i) => i.assigneeId === 'u2' && i.sprintId === 's2' && i.type !== 'Sub-task',
  );
  const other = ds.issues.find(
    (i) => i.assigneeId === 'u3' && i.sprintId === 's2' && i.type !== 'Sub-task',
  );
  if (!own || !other) throw new Error('в seed нет нужных задач');

  const status = (id: string) =>
    changesOf(updateIssue(viewOf(ds), id, { status: 'Review' }, 'u2', testCtx()));

  it('статус: своя — все, чужая — не разработчик', () => {
    expect(check('developer', 'u2', status(own.id))).toEqual([]);
    expect(check('developer', 'u2', status(other.id))).toHaveLength(1);
    for (const role of ['product', 'lead', 'admin'] as const)
      expect(check(role, 'u2', status(other.id))).toEqual([]);
  });

  it('правка полей, оценка, комментарии и создание задачи — всем', () => {
    const edit = changesOf(
      updateIssue(
        viewOf(ds),
        other.id,
        { title: 'Новое', points: 3, labels: ['a'] },
        'u2',
        testCtx(),
      ),
    );
    const comment = changesOf(addComment(viewOf(ds), other.id, 'u2', 'привет', testCtx()));
    const created = changesOf(createIssue(viewOf(ds), newIssue(), 'u2', testCtx()));
    for (const c of [edit, comment, created]) expect(check('developer', 'u2', c)).toEqual([]);
  });

  it('приоритет и порядок — не разработчик', () => {
    const prio = changesOf(
      updateIssue(viewOf(ds), own.id, { priority: 'Highest' }, 'u2', testCtx()),
    );
    const move = changesOf(
      moveIssue(viewOf(ds), own.id, { sprintId: 's2', index: 0 }, 'u2', testCtx()),
    );
    expect(check('developer', 'u2', prio)).toHaveLength(1);
    expect(check('product', 'u2', prio)).toEqual([]);
    if (move.issues) expect(check('developer', 'u2', move)).toHaveLength(1);
  });

  it('состав спринта — не разработчик; задача сразу в спринте — тоже', () => {
    const toBacklog = changesOf(
      updateIssue(viewOf(ds), own.id, { sprintId: null }, 'u2', testCtx()),
    );
    expect(check('developer', 'u2', toBacklog)).toHaveLength(1);
    expect(check('product', 'u2', toBacklog)).toEqual([]);
    const inSprint = changesOf(
      createIssue(viewOf(ds), newIssue({ sprintId: 's2' }), 'u2', testCtx()),
    );
    expect(check('developer', 'u2', inSprint)).toHaveLength(1);
    expect(check('product', 'u2', inSprint)).toEqual([]);
  });

  it('спринты и их настройки — тимлид и администратор', () => {
    const sprint = changesOf(
      createSprint(
        viewOf(ds),
        { name: 'Спринт 9', goal: '', start: '2026-12-01', end: '2026-12-14' },
        testCtx(),
      ),
    );
    const close = changesOf(closeSprint(viewOf(ds), 's2', { kind: 'backlog' }, 'u2', testCtx()));
    const settings = changesOf(
      updateSprintSettings(
        viewOf(ds),
        {
          sprintDurationDays: 7,
          sprintPrefix: 'Итерация',
          nextSprintNumber: 9,
          nextSprintStart: null,
        },
        testCtx(),
      ),
    );
    for (const c of [sprint, close, settings]) {
      expect(check('developer', 'u2', c).length).toBeGreaterThan(0);
      expect(check('product', 'u2', c).length).toBeGreaterThan(0);
      expect(check('lead', 'u2', c)).toEqual([]);
      expect(check('admin', 'u2', c)).toEqual([]);
    }
  });

  it('проекты — администратор', () => {
    const project = changesOf(createProject(ds.projects, { key: 'NEW', name: 'Новый' }, testCtx()));
    expect(check('lead', 'u2', project)).toHaveLength(1);
    expect(check('admin', 'u2', project)).toEqual([]);
    const [demo] = ds.projects;
    if (!demo) throw new Error('нет проекта');
    const rename = { projects: [{ ...demo, name: 'Другое' }] };
    expect(check('lead', 'u2', rename)).toHaveLength(1);
  });

  it('люди — администратор; чужое авторство не принимается', () => {
    const person = { people: [{ id: 'u9', name: 'Новый', role: 'Разработчик' }] };
    expect(check('lead', 'u2', person)).toHaveLength(1);
    expect(check('admin', 'u2', person)).toEqual([]);
    const forged = changesOf(addComment(viewOf(ds), own.id, 'u3', 'привет', testCtx()));
    expect(check('admin', 'u2', forged)).toEqual([
      'Автор комментария — только текущий пользователь',
    ]);
    const forgedIssue = changesOf(createIssue(viewOf(ds), newIssue(), 'u3', testCtx()));
    expect(check('admin', 'u2', forgedIssue).length).toBeGreaterThan(0);
  });
});
