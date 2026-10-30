import { z } from 'zod';

// Роли и права (ADR-021). Роль — запись с произвольным названием и набором разрешённых функций;
// просмотр данных доступен всем ролям. Роль «Администратор» защищена: у неё всегда все права.

/** Функции, которые роли разрешают галочками: один источник для сервера и интерфейса. */
export const ACTIONS = [
  'issue.create', // создавать задачи
  'issue.edit', // править поля и описание задач, связи
  'issue.comment', // комментировать и вести ретроспективу
  'status.own', // сменить статус своей задачи
  'status.other', // сменить статус чужой или неназначенной задачи
  'backlog.rank', // приоритет и порядок задач
  'sprint.items', // добавлять и убирать задачи в спринте
  'sprint.manage', // создавать, запускать, закрывать спринты, настройки проекта
  'project.templates', // шаблоны задач проекта (ADR-017)
  'people.availability', // отсутствия людей (ADR-018)
  'project.create', // создавать проекты и управлять людьми
  'project.members', // владелец и участники проекта (ADR-016)
  'users.manage', // учётки и роли
  'backups.manage', // резервные копии: состояние, копия сейчас, Excel
  'system.diagnose', // журнал ошибок и диагностика (ADR-015)
] as const;

export type Action = (typeof ACTIONS)[number];

export const ADMIN_ROLE = 'admin';

export const roleSchema = z.object({
  /** Идентификатор: у встроенных ролей — developer, product, lead, admin; у новых — случайный. */
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  permissions: z.array(z.enum(ACTIONS)),
  /** Защищённая роль (администратор): права не снимаются, роль не удаляется. */
  system: z.boolean().default(false),
});

export type RoleDef = z.infer<typeof roleSchema>;

/** Роли по умолчанию: повторяют прежние четыре роли (ADR-010). */
export const DEFAULT_ROLES: RoleDef[] = [
  {
    id: 'developer',
    name: 'Разработчик',
    permissions: ['issue.create', 'issue.edit', 'issue.comment', 'status.own'],
    system: false,
  },
  {
    id: 'product',
    name: 'Продакт',
    permissions: [
      'issue.create',
      'issue.edit',
      'issue.comment',
      'status.own',
      'status.other',
      'backlog.rank',
      'sprint.items',
      'project.members',
    ],
    system: false,
  },
  {
    id: 'lead',
    name: 'Тимлид / scrum-мастер',
    permissions: [
      'issue.create',
      'issue.edit',
      'issue.comment',
      'status.own',
      'status.other',
      'backlog.rank',
      'sprint.items',
      'sprint.manage',
      'project.templates',
      'people.availability',
    ],
    system: false,
  },
  { id: ADMIN_ROLE, name: 'Администратор', permissions: [...ACTIONS], system: true },
];

/** Названия функций для таблицы прав и справки; тип Record не даёт пропустить функцию. */
export const ACTION_LABELS: Record<Action, string> = {
  'issue.create': 'Создавать задачи',
  'issue.edit': 'Редактировать поля, описание и связи задач',
  'issue.comment': 'Комментировать и вести ретроспективу',
  'status.own': 'Менять статус своих задач',
  'status.other': 'Менять статус чужих задач',
  'backlog.rank': 'Менять приоритет и порядок задач',
  'sprint.items': 'Добавлять и убирать задачи в спринте',
  'sprint.manage': 'Создавать, запускать и закрывать спринты, настройки проекта',
  'project.templates': 'Шаблоны задач, WIP и Definition of Done',
  'people.availability': 'Отпуска и больничные людей',
  'project.create': 'Создавать проекты и управлять людьми',
  'project.members': 'Владелец и участники проекта',
  'users.manage': 'Учётки и роли',
  'backups.manage': 'Резервные копии',
  'system.diagnose': 'Журнал ошибок и диагностика',
};

export const ACTION_GROUPS: { title: string; actions: Action[] }[] = [
  {
    title: 'Задачи',
    actions: ['issue.create', 'issue.edit', 'issue.comment', 'status.own', 'status.other'],
  },
  {
    title: 'Планирование',
    actions: [
      'backlog.rank',
      'sprint.items',
      'sprint.manage',
      'project.templates',
      'people.availability',
    ],
  },
  {
    title: 'Администрирование',
    actions: [
      'project.create',
      'project.members',
      'users.manage',
      'backups.manage',
      'system.diagnose',
    ],
  },
];

/** Признак ещё не сохранённой роли в черновике таблицы прав; при сохранении заменяется настоящим id. */
export const NEW_ROLE_PREFIX = 'new-';

export interface RolesChange {
  roles: RoleDef[];
  deleteRoleIds: string[];
}

export type RolesResult =
  { ok: true; changes: RolesChange } | { ok: false; errors: Record<string, string> };

/**
 * Изменения таблицы ролей по черновику: новые роли, изменённые права и названия, удалённые роли.
 * Защищённая роль в изменения не попадает (её права и название неизменны). Ошибки — по id роли.
 */
export function rolesChanges(
  current: readonly RoleDef[],
  draft: readonly RoleDef[],
  newId: () => string,
): RolesResult {
  const errors: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const role of draft) {
    const name = role.name.trim();
    if (name.length === 0 || name.length > 40) errors[role.id] = 'Название — от 1 до 40 символов';
    else if (seen.has(name.toLowerCase())) errors[role.id] = 'Такое название уже есть';
    seen.set(name.toLowerCase(), role.id);
  }
  const kept = new Set(draft.map((r) => r.id));
  for (const role of current) {
    if (role.system && !kept.has(role.id)) errors['form'] = 'Роль «Администратор» удалить нельзя';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const roles: RoleDef[] = [];
  for (const role of draft) {
    const before = current.find((r) => r.id === role.id);
    if (before?.system) continue;
    const next: RoleDef = {
      id: before ? role.id : newId(),
      name: role.name.trim(),
      permissions: ACTIONS.filter((a) => role.permissions.includes(a)),
      system: false,
    };
    const same =
      before !== undefined &&
      before.name === next.name &&
      JSON.stringify(ACTIONS.filter((a) => before.permissions.includes(a))) ===
        JSON.stringify(next.permissions);
    if (!same) roles.push(next);
  }
  const deleteRoleIds = current.filter((r) => !r.system && !kept.has(r.id)).map((r) => r.id);
  return { ok: true, changes: { roles, deleteRoleIds } };
}
