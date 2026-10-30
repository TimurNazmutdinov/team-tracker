import { describe, expect, it } from 'vitest';
import { can } from './permissions';
import {
  ACTIONS,
  ACTION_GROUPS,
  ACTION_LABELS,
  DEFAULT_ROLES,
  NEW_ROLE_PREFIX,
  rolesChanges,
  type RoleDef,
} from './roles';

const copy = () => structuredClone(DEFAULT_ROLES);
let n = 0;
const newId = () => `r${++n}`;

describe('роли по умолчанию', () => {
  it('администратор защищён и может всё, остальные — нет', () => {
    const admin = DEFAULT_ROLES.filter((r) => r.system);
    expect(admin.map((r) => r.id)).toEqual(['admin']);
    expect(ACTIONS.every((a) => can(DEFAULT_ROLES, 'admin', a))).toBe(true);
    expect(can(DEFAULT_ROLES, 'developer', 'sprint.manage')).toBe(false);
  });
  it('у каждой функции есть название и группа, ни одна не повторяется', () => {
    expect(Object.keys(ACTION_LABELS).sort()).toEqual([...ACTIONS].sort());
    const grouped = ACTION_GROUPS.flatMap((g) => g.actions);
    expect([...grouped].sort()).toEqual([...ACTIONS].sort());
  });
  it('системная роль работает, даже если в данных у неё мало прав', () => {
    const weak: RoleDef[] = [{ id: 'admin', name: 'А', permissions: [], system: true }];
    expect(can(weak, 'admin', 'users.manage')).toBe(true);
  });
});

describe('rolesChanges', () => {
  it('без правок изменений нет', () => {
    const r = rolesChanges(DEFAULT_ROLES, copy(), newId);
    expect(r).toEqual({ ok: true, changes: { roles: [], deleteRoleIds: [] } });
  });

  it('новая роль получает настоящий id; удалённая попадает в удаление', () => {
    const draft = copy().filter((r) => r.id !== 'product');
    draft.push({
      id: `${NEW_ROLE_PREFIX}1`,
      name: '  Наблюдатель ',
      permissions: [],
      system: false,
    });
    const r = rolesChanges(DEFAULT_ROLES, draft, newId);
    if (!r.ok) throw new Error('ожидался успех');
    expect(r.changes.deleteRoleIds).toEqual(['product']);
    expect(r.changes.roles).toHaveLength(1);
    expect(r.changes.roles[0]).toMatchObject({
      name: 'Наблюдатель',
      permissions: [],
      system: false,
    });
    expect(r.changes.roles[0]?.id).not.toContain(NEW_ROLE_PREFIX);
  });

  it('правки названия и прав попадают в изменения, порядок прав нормализуется', () => {
    const draft = copy();
    const dev = draft.find((x) => x.id === 'developer');
    if (!dev) throw new Error('нет роли');
    dev.name = 'Инженер';
    dev.permissions = ['status.own', 'issue.create'];
    const r = rolesChanges(DEFAULT_ROLES, draft, newId);
    if (!r.ok) throw new Error('ожидался успех');
    expect(r.changes.roles).toEqual([
      {
        id: 'developer',
        name: 'Инженер',
        permissions: ['issue.create', 'status.own'],
        system: false,
      },
    ]);
  });

  it('защищённая роль не меняется, даже если черновик пытается её изменить', () => {
    const draft = copy();
    const admin = draft.find((x) => x.system);
    if (admin) {
      admin.name = 'Босс';
      admin.permissions = [];
    }
    const r = rolesChanges(DEFAULT_ROLES, draft, newId);
    expect(r).toEqual({ ok: true, changes: { roles: [], deleteRoleIds: [] } });
  });

  it('защищённую роль удалить нельзя', () => {
    const r = rolesChanges(
      DEFAULT_ROLES,
      copy().filter((x) => !x.system),
      newId,
    );
    expect(!r.ok && r.errors['form']).toMatch(/нельзя/);
  });

  it('проверяет названия: пустое, длинное, повторяющееся без учёта регистра', () => {
    const draft = copy();
    const [a, b, c] = draft;
    if (!a || !b || !c) throw new Error('мало ролей');
    a.name = '  ';
    b.name = 'x'.repeat(41);
    c.name = 'АДМИНИСТРАТОР';
    const r = rolesChanges(DEFAULT_ROLES, draft, newId);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual([a.id, b.id, 'admin'].sort());
    }
  });
});
