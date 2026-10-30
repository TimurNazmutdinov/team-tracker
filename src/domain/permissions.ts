import type { Changes } from './changes';
import { isParticipant } from './members';
import type { Action, RoleDef } from './roles';
import type { Dataset, Issue, Project } from './schema';

// Права по ролям (docs/capabilities.md §2, ADR-010). Один источник для сервера, который проверяет
// каждое изменение, и для интерфейса, который скрывает недоступные действия.

export { ACTIONS, ADMIN_ROLE, DEFAULT_ROLES, type Action, type RoleDef } from './roles';

/** Идентификатор роли учётки (ADR-021): у встроенных ролей — developer, product, lead, admin. */
export type Role = string;

type Roles = readonly RoleDef[];

/** Название роли по идентификатору; для неизвестной — сам идентификатор. */
export function roleName(roles: Roles, role: Role): string {
  return roles.find((r) => r.id === role)?.name ?? role;
}

export function can(roles: Roles, role: Role, action: Action): boolean {
  const def = roles.find((r) => r.id === role);
  if (!def) return false;
  return def.system || def.permissions.includes(action);
}

/** Можно ли менять статус задачи: своя — исполнитель совпадает с пользователем (ADR-010). */
export function canChangeStatus(
  roles: Roles,
  role: Role,
  userId: string,
  issue: Pick<Issue, 'assigneeId'>,
) {
  return can(roles, role, issue.assigneeId === userId ? 'status.own' : 'status.other');
}

/** Поля проекта, которые меняют настройки и нумерацию спринтов, а не сам проект. */
const SPRINT_SETTING_FIELDS = [
  'sprintDurationDays',
  'sprintPrefix',
  'nextSprintNumber',
  'nextSprintStart',
  // WIP-лимиты настраивает тот же, кто настраивает спринты (ADR-017)
  'wipEnabled',
  'wipLimits',
  // Definition of Done правит тот же, кто настраивает спринты (ADR-018)
  'dod',
] as const;

function differs<T extends object>(a: T, b: T, fields: readonly (keyof T)[]): boolean {
  return fields.some((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}

function changedProjectFields(before: Project, after: Project): 'core' | 'sprints' | null {
  const core = (Object.keys(after) as (keyof Project)[]).filter(
    (k) => !(SPRINT_SETTING_FIELDS as readonly string[]).includes(k),
  );
  if (differs(before, after, core)) return 'core';
  return differs(before, after, SPRINT_SETTING_FIELDS) ? 'sprints' : null;
}

/** Поля задачи, которые правит «Редактировать»; статус, приоритет, порядок и спринт имеют свои права. */
const CONTENT_FIELDS = [
  'type',
  'title',
  'description',
  'acceptance',
  'points',
  'assigneeId',
  'parentId',
  'labels',
  'dueDate',
] as const;

function changedContent(before: Issue, after: Issue): boolean {
  return CONTENT_FIELDS.some((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
}

/**
 * Нарушения прав в наборе изменений: что пользователь менять не вправе. Пустой список — можно.
 * `current` — данные до изменения. Авторство записей истории и комментариев и reporterId новых
 * задач должны совпадать с пользователем: сервер не принимает чужое имя.
 */
export function violations(
  role: Role,
  userId: string,
  current: Dataset,
  changes: Changes,
): string[] {
  const out: string[] = [];
  const deny = (message: string) => {
    if (!out.includes(message)) out.push(message);
  };
  const roles = current.roles;
  const may = (action: Action) => can(roles, role, action);

  for (const p of changes.projects ?? []) {
    const before = current.projects.find((x) => x.id === p.id);
    if (!before) {
      if (!may('project.create')) deny('Создавать проекты ваша роль не позволяет');
      continue;
    }
    const kind = changedProjectFields(before, p);
    if (kind === 'core' && !may('project.create'))
      deny('Менять ключ и название проекта ваша роль не позволяет');
    if (kind === 'sprints' && !may('sprint.manage'))
      deny('Менять настройки проекта ваша роль не позволяет');
  }

  if (
    ((changes.templates ?? []).length > 0 || (changes.deleteTemplateIds ?? []).length > 0) &&
    !may('project.templates')
  )
    deny('Менять шаблоны задач, WIP-лимиты и Definition of Done ваша роль не позволяет');

  if (
    ((changes.absences ?? []).length > 0 || (changes.deleteAbsenceIds ?? []).length > 0) &&
    !may('people.availability')
  )
    deny('Менять отсутствия людей ваша роль не позволяет');

  for (const r of changes.retroItems ?? []) {
    if (r.authorId !== userId && !current.retroItems.some((x) => x.id === r.id))
      deny('Автор записи ретроспективы — только текущий пользователь');
  }
  for (const id of changes.deleteRetroItemIds ?? []) {
    const known = current.retroItems.find((x) => x.id === id);
    if (known && known.authorId !== userId && !may('sprint.manage'))
      deny('Удалять чужие записи ретроспективы ваша роль не позволяет');
  }

  // Роли меняют те, у кого есть право на учётки и роли; защищённая роль неизменна (ADR-021)
  if ((changes.roles ?? []).length > 0 || (changes.deleteRoleIds ?? []).length > 0) {
    if (!may('users.manage')) deny('Менять роли ваша роль не позволяет');
    for (const r of changes.roles ?? []) {
      const before = current.roles.find((x) => x.id === r.id);
      if (r.system !== (before?.system ?? false)) deny('Признак защищённой роли менять нельзя');
      if (before?.system && JSON.stringify(before) !== JSON.stringify(r))
        deny('Роль «Администратор» защищена: менять её нельзя');
    }
    for (const id of changes.deleteRoleIds ?? []) {
      if (current.roles.find((x) => x.id === id)?.system) deny('Защищённую роль удалить нельзя');
    }
  }

  // Участники проекта: администратор или владелец этого проекта (ADR-016)
  const memberProjects = new Set<string>();
  for (const m of changes.members ?? []) memberProjects.add(m.projectId);
  for (const id of changes.deleteMemberIds ?? []) {
    const known = current.members.find((m) => m.id === id);
    if (known) memberProjects.add(known.projectId);
  }
  for (const projectId of memberProjects) {
    const project = current.projects.find((p) => p.id === projectId);
    // продакт — только владелец проекта; остальным с этим правом проект не важен
    const allowed = may('project.members') && (role !== 'product' || project?.ownerId === userId);
    if (!allowed) deny('Менять участников проекта ваша роль не позволяет');
  }

  if ((changes.people ?? []).length > 0 && !may('project.create'))
    deny('Управлять людьми ваша роль не позволяет');

  for (const s of changes.sprints ?? []) {
    const before = current.sprints.find((x) => x.id === s.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(s)) {
      if (!may('sprint.manage'))
        deny('Создавать, запускать и закрывать спринты ваша роль не позволяет');
    }
  }

  // Продакт меняет состав и порядок задач только в своих проектах (ADR-016)
  const foreign = (projectId: string): boolean => {
    if (role !== 'product') return false;
    const project = current.projects.find((p) => p.id === projectId);
    return !project || !isParticipant(project, current.members, userId);
  };
  const FOREIGN = 'Продакт меняет состав и порядок задач только в своих проектах';

  for (const issue of changes.issues ?? []) {
    const before = current.issues.find((x) => x.id === issue.id);
    if (!before) {
      if (issue.sprintId !== null && foreign(issue.projectId)) deny(FOREIGN);
      if (!may('issue.create')) deny('Создавать задачи ваша роль не позволяет');
      if (issue.reporterId !== userId) deny('Автор задачи — только текущий пользователь');
      if (issue.sprintId !== null && !may('sprint.items'))
        deny('Добавлять задачи в спринт ваша роль не позволяет');
      continue;
    }
    if (changedContent(before, issue) && !may('issue.edit'))
      deny('Редактировать задачи ваша роль не позволяет');
    if (before.status !== issue.status && !canChangeStatus(roles, role, userId, before))
      deny('Менять статус этой задачи ваша роль не позволяет');
    if (
      (before.priority !== issue.priority || before.order !== issue.order) &&
      !may('backlog.rank')
    )
      deny('Менять приоритет и порядок задач ваша роль не позволяет');
    if (before.sprintId !== issue.sprintId && !may('sprint.items'))
      deny('Добавлять и убирать задачи в спринте ваша роль не позволяет');
    if (
      (before.sprintId !== issue.sprintId ||
        before.priority !== issue.priority ||
        before.order !== issue.order) &&
      foreign(issue.projectId)
    )
      deny(FOREIGN);
  }

  if ((changes.comments ?? []).length > 0 && !may('issue.comment'))
    deny('Комментировать ваша роль не позволяет');
  if ((changes.retroItems ?? []).length > 0 && !may('issue.comment'))
    deny('Вести ретроспективу ваша роль не позволяет');
  if (
    ((changes.links ?? []).length > 0 || (changes.deleteLinkIds ?? []).length > 0) &&
    !may('issue.edit')
  )
    deny('Менять связи задач ваша роль не позволяет');
  for (const c of changes.comments ?? [])
    if (c.authorId !== userId) deny('Автор комментария — только текущий пользователь');
  for (const h of changes.history ?? [])
    if (h.authorId !== userId) deny('Автор записи истории — только текущий пользователь');

  return out;
}
