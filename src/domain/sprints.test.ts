import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { updateIssue, type Result } from './actions';
import { parseDataset } from './dataset';
import {
  closeSprint,
  closeSummary,
  createSprint,
  startSprint,
  updateSprint,
  type SprintInput,
} from './sprints';
import type { Dataset } from './schema';
import { applyChanges, replayErrors, testCtx, viewOf } from './testing';

const base = seed as unknown as Dataset;

function must<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('нет записи');
  return value;
}

function applied(ds: Dataset, r: Result): Dataset {
  if (!r.ok) throw new Error(`ожидался успех: ${JSON.stringify(r.errors)}`);
  const next = applyChanges(ds, r.changes);
  const parsed = parseDataset(next);
  expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  expect(replayErrors(next)).toEqual([]);
  return next;
}

function errors(r: Result): Record<string, string> {
  if (r.ok) throw new Error('ожидалась ошибка');
  return r.errors;
}

const input: SprintInput = {
  name: ' Спринт 4 ',
  goal: ' Отчёты ',
  start: '2026-11-23',
  end: '2026-12-04',
};

/** Набор данных: спринт 3 в состоянии planned есть в seed. */
function withSprint3(): Dataset {
  return base;
}

describe('createSprint', () => {
  it('создаёт запланированный спринт', () => {
    const next = applied(base, createSprint(viewOf(base), input, testCtx()));
    expect(next.sprints.at(-1)).toMatchObject({
      name: 'Спринт 4',
      goal: 'Отчёты',
      start: '2026-11-23',
      end: '2026-12-04',
      state: 'planned',
      closedAt: null,
      projectId: 'p1',
    });
  });

  it('проверяет поля', () => {
    const view = viewOf(base);
    const e = (patch: Partial<SprintInput>) =>
      errors(createSprint(view, { ...input, ...patch }, testCtx()));
    expect(e({ name: ' ' }).name).toContain('название');
    expect(e({ name: 'спринт 2' }).name).toContain('уже есть');
    expect(e({ end: '2026-11-09' }).end).toContain('позже');
    expect(e({ end: '2026-11-01' }).end).toContain('позже');
    expect(e({ start: '09.11.2026' }).start).toContain('ГГГГ');
    expect(e({ end: '2026-02-30' }).end).toContain('ГГГГ');
    expect(e({ goal: 'x'.repeat(501) }).goal).toContain('длиннее');
  });
});

describe('updateSprint', () => {
  it('меняет цель, название и даты', () => {
    const next = applied(
      base,
      updateSprint(viewOf(base), 's2', { goal: ' Новая цель ', end: '2026-11-10' }, testCtx()),
    );
    expect(next.sprints.find((s) => s.id === 's2')).toMatchObject({
      goal: 'Новая цель',
      end: '2026-11-10',
      name: 'Спринт 2',
    });
  });

  it('закрытый спринт только для чтения; ошибки проверки; без изменений ничего не пишет', () => {
    const view = viewOf(base);
    expect(errors(updateSprint(view, 's1', { goal: 'x' }, testCtx())).form).toContain(
      'только для чтения',
    );
    expect(errors(updateSprint(view, 's2', { end: '2026-10-01' }, testCtx())).end).toContain(
      'позже',
    );
    expect(errors(updateSprint(view, 's2', { name: 'Спринт 1' }, testCtx())).name).toContain(
      'уже есть',
    );
    const same = updateSprint(view, 's2', { name: 'Спринт 2' }, testCtx());
    expect(same.ok && same.changes).toEqual({});
  });
});

describe('startSprint', () => {
  it('один активный спринт на проект', () => {
    const ds = withSprint3();
    expect(errors(startSprint(viewOf(ds), 's2')).form).toContain(
      'Запустить можно только запланированный',
    );
    const s3 = must(ds.sprints.find((s) => s.id === 's3'));
    expect(errors(startSprint(viewOf(ds), s3.id)).form).toContain('«Спринт 2»');
    expect(errors(startSprint(viewOf(ds), 'nope')).form).toContain('не найден');
  });

  it('после закрытия идущего запланированный запускается', () => {
    const ds = withSprint3();
    const s3 = must(ds.sprints.find((s) => s.id === 's3'));
    const closed = applied(ds, closeSprint(viewOf(ds), 's2', { kind: 'backlog' }, 'u1', testCtx()));
    const started = applied(closed, startSprint(viewOf(closed), s3.id));
    expect(started.sprints.find((s) => s.id === s3.id)?.state).toBe('active');
  });
});

describe('closeSummary', () => {
  it('на демо-данных: всё не завершено, переносятся 8 задач, 21 sp', () => {
    const s = closeSummary(viewOf(base), 's2');
    expect(s.doneCount).toBe(0);
    expect(s.velocity).toBe(0);
    expect(s.carried.map((i) => i.number)).toEqual([4, 5, 8, 9, 10, 13, 14, 15]);
    expect(s.carriedPoints).toBe(21);
    expect(s.staying).toEqual([]);
  });

  it('velocity — points задач в Done; Done-подзадача незавершённого родителя переносится с ним', () => {
    let ds = applied(base, updateIssue(viewOf(base), 'i4', { status: 'Done' }, 'u1', testCtx()));
    ds = applied(ds, updateIssue(viewOf(ds), 'i14', { status: 'Done' }, 'u1', testCtx()));
    const s = closeSummary(viewOf(ds), 's2');
    expect(s.doneCount).toBe(2);
    expect(s.velocity).toBe(5);
    expect(s.carried.map((i) => i.number)).toContain(14);
    expect(s.carried.map((i) => i.number)).not.toContain(4);
  });

  it('незавершённая подзадача выполненного родителя остаётся в закрытом спринте', () => {
    const ds = applied(base, updateIssue(viewOf(base), 'i9', { status: 'Done' }, 'u1', testCtx()));
    const s = closeSummary(viewOf(ds), 's2');
    expect(s.staying.map((i) => i.number)).toEqual([14, 15]);
    expect(s.carried.map((i) => i.number)).toEqual([4, 5, 8, 10, 13]);
  });
});

describe('closeSprint', () => {
  const ctx = () => testCtx('2026-11-06T18:00:00Z');

  it('в запланированный спринт: closedAt, перенос с подзадачами, события sprintId', () => {
    const ds = withSprint3();
    const s3 = must(ds.sprints.find((s) => s.id === 's3'));
    const next = applied(
      ds,
      closeSprint(viewOf(ds), 's2', { kind: 'sprint', sprintId: s3.id }, 'u1', ctx()),
    );
    expect(next.sprints.find((s) => s.id === 's2')).toMatchObject({
      state: 'closed',
      closedAt: '2026-11-06T18:00:00Z',
    });
    for (const id of ['i4', 'i5', 'i8', 'i9', 'i10', 'i13', 'i14', 'i15']) {
      expect(next.issues.find((i) => i.id === id)?.sprintId).toBe(s3.id);
    }
    const events = next.history.filter(
      (h) => h.field === 'sprintId' && h.at === '2026-11-06T18:00:00Z',
    );
    expect(events).toHaveLength(8);
    expect(events.every((h) => h.from === 's2' && h.to === s3.id && h.authorId === 'u1')).toBe(
      true,
    );
  });

  it('в бэклог', () => {
    const next = applied(base, closeSprint(viewOf(base), 's2', { kind: 'backlog' }, 'u1', ctx()));
    expect(next.issues.filter((i) => i.sprintId === 's2')).toEqual([]);
    expect(next.issues.find((i) => i.id === 'i9')?.sprintId).toBeNull();
    expect(next.issues.find((i) => i.id === 'i14')?.sprintId).toBeNull();
  });

  it('в новый спринт, который создаётся при закрытии', () => {
    const newSprint = { name: 'Спринт 4', goal: '', start: '2026-11-23', end: '2026-12-04' };
    const next = applied(
      base,
      closeSprint(viewOf(base), 's2', { kind: 'new', sprint: newSprint }, 'u1', ctx()),
    );
    const created = must(next.sprints.find((s) => s.name === 'Спринт 4'));
    expect(created.state).toBe('planned');
    expect(next.issues.find((i) => i.id === 'i4')?.sprintId).toBe(created.id);
  });

  it('выполненные задачи остаются в закрытом спринте, он замораживается', () => {
    const ds = applied(
      base,
      updateIssue(viewOf(base), 'i4', { status: 'Done' }, 'u1', testCtx('2026-11-05T10:00:00Z')),
    );
    const next = applied(ds, closeSprint(viewOf(ds), 's2', { kind: 'backlog' }, 'u1', ctx()));
    expect(next.issues.find((i) => i.id === 'i4')?.sprintId).toBe('s2');
    expect(
      errors(updateIssue(viewOf(next), 'i4', { status: 'In Progress' }, 'u1', ctx())).form,
    ).toContain('закрыт');
    expect(updateIssue(viewOf(next), 'i5', { status: 'In Progress' }, 'u1', ctx()).ok).toBe(true);
  });

  it('ошибки: нет цели переноса, неверная цель, не идущий спринт, плохие поля нового спринта', () => {
    const ds = withSprint3();
    const s3 = must(ds.sprints.find((s) => s.id === 's3'));
    const view = viewOf(ds);
    expect(
      errors(closeSprint(view, 's2', { kind: 'sprint', sprintId: 's2' }, 'u1', ctx())).target,
    ).toContain('запланированный');
    expect(
      errors(closeSprint(view, 's2', { kind: 'sprint', sprintId: 's1' }, 'u1', ctx())).target,
    ).toContain('запланированный');
    expect(errors(closeSprint(view, s3.id, { kind: 'backlog' }, 'u1', ctx())).form).toContain(
      'идущий',
    );
    expect(errors(closeSprint(view, 's1', { kind: 'backlog' }, 'u1', ctx())).form).toContain(
      'идущий',
    );
    const bad = errors(
      closeSprint(
        view,
        's2',
        { kind: 'new', sprint: { name: '', goal: '', start: '2026-11-09', end: '2026-11-01' } },
        'u1',
        ctx(),
      ),
    );
    expect(bad.newName).toContain('название');
    expect(bad.newEnd).toContain('позже');
  });

  it('без незавершённых задач цель переноса не нужна', () => {
    let ds = base;
    for (const id of ['i4', 'i5', 'i8', 'i9', 'i10', 'i13', 'i14', 'i15']) {
      ds = applied(
        ds,
        updateIssue(viewOf(ds), id, { status: 'Done' }, 'u1', testCtx('2026-11-05T10:00:00Z')),
      );
    }
    const next = applied(ds, closeSprint(viewOf(ds), 's2', { kind: 'backlog' }, 'u1', ctx()));
    expect(next.history.length).toBe(ds.history.length);
    expect(next.sprints.find((s) => s.id === 's2')?.state).toBe('closed');
  });
});
