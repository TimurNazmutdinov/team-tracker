import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import type { Result } from './actions';
import { parseDataset } from './dataset';
import {
  PROJECT_ROLE_LABELS,
  addMember,
  isParticipant,
  myProjects,
  projectTeam,
  removeMember,
  setMemberRole,
  setOwner,
} from './members';
import { violations } from './permissions';
import type { Dataset } from './schema';
import { applyChanges, replayErrors, testCtx, viewOf } from './testing';

const ds = seed as unknown as Dataset;
const view = () => viewOf(ds);

function applied(base: Dataset, r: Result): Dataset {
  if (!r.ok) throw new Error(`ожидался успех: ${JSON.stringify(r.errors)}`);
  const next = applyChanges(base, r.changes);
  const parsed = parseDataset(next);
  expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  expect(replayErrors(next)).toEqual([]);
  return next;
}

const errors = (r: Result) => {
  if (r.ok) throw new Error('ожидалась ошибка');
  return r.errors;
};

describe('участие в проекте', () => {
  it('seed: владелец и три участника', () => {
    const v = view();
    expect(v.project.ownerId).toBe('u1');
    expect(isParticipant(v.project, v.members, 'u1')).toBe(true); // владелец
    expect(isParticipant(v.project, v.members, 'u2')).toBe(true); // участник
    expect(isParticipant(v.project, v.members, 'u9')).toBe(false);
  });

  it('«Мои проекты» — владелец или участник', () => {
    const v = view();
    expect(myProjects([v.project], v.members, 'u3').map((p) => p.key)).toEqual(['DEMO']);
    expect(myProjects([v.project], v.members, 'zz')).toEqual([]);
    expect(myProjects([v.project], v.members, null)).toEqual([]);
  });

  it('команда: владелец первым, затем участники с ролями', () => {
    const v = view();
    const team = projectTeam(v.project, v.members, v.people);
    expect(team[0]).toMatchObject({ role: 'owner', person: { id: 'u1' } });
    expect(team.slice(1).map((t) => [t.person.id, t.role])).toEqual([
      ['u2', 'developer'],
      ['u3', 'developer'],
      ['u4', 'lead'],
    ]);
    expect(PROJECT_ROLE_LABELS.lead).toBe('Тимлид');
  });
});

describe('addMember', () => {
  it('добавляет участника', () => {
    // u4 уже участник: возьмём набор без него
    const base = applied(ds, removeMember(view(), 'm3'));
    const next = applied(
      base,
      addMember(viewOf(base), { personId: 'u4', role: 'product' }, testCtx()),
    );
    expect(next.members.find((m) => m.personId === 'u4')).toMatchObject({ role: 'product' });
  });

  it('отклоняет владельца, повтор, неизвестного человека и роль', () => {
    const v = view();
    const add = (personId: string, role: string) =>
      errors(addMember(v, { personId, role: role as never }, testCtx()));
    expect(add('u1', 'developer').personId).toContain('владелец');
    expect(add('u2', 'developer').personId).toContain('уже участник');
    expect(add('нет', 'developer').personId).toContain('Выберите');
  });
});

describe('роль и удаление участника', () => {
  it('меняет роль и не пишет изменений, если роль та же', () => {
    const v = view();
    const next = applied(ds, setMemberRole(v, 'm1', 'lead'));
    expect(next.members.find((m) => m.id === 'm1')?.role).toBe('lead');
    const same = setMemberRole(v, 'm1', 'developer');
    expect(same.ok && same.changes).toEqual({});
    expect(errors(setMemberRole(v, 'нет', 'lead')).form).toContain('не найден');
    expect(errors(setMemberRole(v, 'm1', 'король' as never)).role).toContain('роль');
  });

  it('убирает участника', () => {
    const next = applied(ds, removeMember(view(), 'm2'));
    expect(next.members.map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(errors(removeMember(view(), 'нет')).form).toContain('не найден');
  });
});

describe('setOwner', () => {
  it('новый владелец перестаёт быть участником, прежний становится участником-продактом', () => {
    const next = applied(ds, setOwner(view(), 'u2', testCtx()));
    const project = next.projects[0];
    expect(project?.ownerId).toBe('u2');
    expect(next.members.some((m) => m.personId === 'u2')).toBe(false);
    expect(next.members.find((m) => m.personId === 'u1')).toMatchObject({ role: 'product' });
  });

  it('можно снять владельца; тот же владелец — без изменений; неизвестный — ошибка', () => {
    const cleared = applied(ds, setOwner(view(), null, testCtx()));
    expect(cleared.projects[0]?.ownerId).toBeNull();
    const same = setOwner(view(), 'u1', testCtx());
    expect(same.ok && same.changes).toEqual({});
    expect(errors(setOwner(view(), 'нет', testCtx())).ownerId).toContain('Выберите');
  });
});

describe('права на участников и задачи чужих проектов', () => {
  const change = (r: Result) => {
    if (!r.ok) throw new Error('ожидался успех');
    return r.changes;
  };

  it('участников меняют администратор и владелец проекта, остальные нет', () => {
    const c = change(setMemberRole(view(), 'm1', 'lead'));
    expect(violations('admin', 'u9', ds, c)).toEqual([]);
    expect(violations('product', 'u1', ds, c)).toEqual([]); // владелец проекта
    expect(violations('product', 'u8', ds, c)).not.toEqual([]); // продакт другого проекта
    expect(violations('lead', 'u4', ds, c)).not.toEqual([]);
    const removal = change(removeMember(view(), 'm1'));
    expect(violations('product', 'u1', ds, removal)).toEqual([]);
    expect(violations('developer', 'u2', ds, removal)).not.toEqual([]);
  });

  it('владельца проекта меняет только администратор', () => {
    const c = change(setOwner(view(), 'u2', testCtx()));
    expect(violations('admin', 'u9', ds, c)).toEqual([]);
    expect(violations('product', 'u1', ds, c)).not.toEqual([]);
  });

  it('продакт меняет порядок и спринты только в своих проектах', () => {
    const v = view();
    const issue = v.issues.find((i) => i.sprintId === null && i.type === 'Task');
    if (!issue) throw new Error('нет задачи в бэклоге');
    const moved = { issues: [{ ...issue, order: issue.order + 1 }] };
    expect(violations('product', 'u1', ds, moved)).toEqual([]); // владелец
    expect(violations('product', 'u2', ds, moved)).toEqual([]); // участник
    const denied = violations('product', 'u8', ds, moved); // чужой продакт
    expect(denied.join(' ')).toContain('только в своих проектах');
    // тимлид и администратор не ограничены проектом
    expect(violations('lead', 'u8', ds, moved)).toEqual([]);
    expect(violations('admin', 'u8', ds, moved)).toEqual([]);
  });

  it('чужой продакт не создаёт задачу сразу в спринте, а в бэклоге — может', () => {
    const v = view();
    const base = v.issues[0];
    if (!base) throw new Error('нет задач');
    const fresh = { ...base, id: 'new-1', number: 999, sprintId: 's2', reporterId: 'u8' };
    expect(violations('product', 'u8', ds, { issues: [fresh] }).join(' ')).toContain(
      'своих проектах',
    );
    expect(violations('product', 'u8', ds, { issues: [{ ...fresh, sprintId: null }] })).toEqual([]);
  });
});
