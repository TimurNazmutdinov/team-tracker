import type { Changes } from './changes';
import { isParticipant } from './members';
import type { Dataset, Issue, Project } from './schema';

// Права по ролям (docs/capabilities.md §2, ADR-010). Один источник для сервера, который проверяет
// каждое изменение, и для интерфейса, который скрывает недоступные действия.

export const ROLES = ['developer', 'product', 'lead', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  developer: 'Разработчик',
  product: 'Продакт',
  lead: 'Тимлид / scrum-мастер',
  admin: 'Администратор',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export type Action =
  | 'status.own' // сменить статус своей задачи
  | 'status.other' // сменить статус чужой или неназначенной задачи
  | 'backlog.rank' // приоритет и порядок задач
  | 'sprint.items' // добавлять и убирать задачи в спринте
  | 'sprint.manage' // создавать, запускать, закрывать спринты, настройки спринтов
  | 'project.create' // создавать проекты и управлять людьми
  | 'users.manage' // менять роли учёток
  | 'backups.manage' // резервные копии: состояние, копия сейчас, Excel
  | 'system.diagnose' // журнал ошибок и диагностика (ADR-015)
  | 'project.members' // владелец и участники проекта: администратор и владелец проекта (ADR-016)
  | 'project.templates'; // шаблоны задач проекта (ADR-017)

const MATRIX: Record<Action, readonly Role[]> = {
  'status.own': ROLES,
  'status.other': ['product', 'lead', 'admin'],
  'backlog.rank': ['product', 'lead', 'admin'],
  'sprint.items': ['product', 'lead', 'admin'],
  'sprint.manage': ['lead', 'admin'],
  'project.create': ['admin'],
  'users.manage': ['admin'],
  'backups.manage': ['admin'],
  'system.diagnose': ['admin'],
  'project.members': ['admin', 'product'],
  'project.templates': ['lead', 'admin'],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

/** Можно ли менять статус задачи: своя — исполнитель совпадает с пользователем (ADR-010). */
export function canChangeStatus(role: Role, userId: string, issue: Pick<Issue, 'assigneeId'>) {
  return can(role, issue.assigneeId === userId ? 'status.own' : 'status.other');
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

  for (const p of changes.projects ?? []) {
    const before = current.projects.find((x) => x.id === p.id);
    if (!before) {
      if (!can(role, 'project.create')) deny('Создавать проекты может только администратор');
      continue;
    }
    const kind = changedProjectFields(before, p);
    if (kind === 'core' && !can(role, 'project.create'))
      deny('Менять ключ и название проекта может только администратор');
    if (kind === 'sprints' && !can(role, 'sprint.manage'))
      deny('Настройки спринтов меняют тимлид и администратор');
  }

  if (
    ((changes.templates ?? []).length > 0 || (changes.deleteTemplateIds ?? []).length > 0) &&
    !can(role, 'project.templates')
  )
    deny('Шаблоны задач меняют тимлид и администратор');

  // Участники проекта: администратор или владелец этого проекта (ADR-016)
  const memberProjects = new Set<string>();
  for (const m of changes.members ?? []) memberProjects.add(m.projectId);
  for (const id of changes.deleteMemberIds ?? []) {
    const known = current.members.find((m) => m.id === id);
    if (known) memberProjects.add(known.projectId);
  }
  for (const projectId of memberProjects) {
    const project = current.projects.find((p) => p.id === projectId);
    const own = role === 'product' && project?.ownerId === userId;
    if (role !== 'admin' && !own)
      deny('Участников проекта меняют администратор и владелец проекта');
  }

  if ((changes.people ?? []).length > 0 && !can(role, 'project.create'))
    deny('Управлять людьми может только администратор');

  for (const s of changes.sprints ?? []) {
    const before = current.sprints.find((x) => x.id === s.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(s)) {
      if (!can(role, 'sprint.manage'))
        deny('Создавать, запускать и закрывать спринты могут тимлид и администратор');
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
      if (issue.reporterId !== userId) deny('Автор задачи — только текущий пользователь');
      if (issue.sprintId !== null && !can(role, 'sprint.items'))
        deny('Добавлять задачи в спринт могут продакт, тимлид и администратор');
      continue;
    }
    if (before.status !== issue.status && !canChangeStatus(role, userId, before))
      deny('Менять статус чужой задачи разработчик не может');
    if (
      (before.priority !== issue.priority || before.order !== issue.order) &&
      !can(role, 'backlog.rank')
    )
      deny('Менять приоритет и порядок задач разработчик не может');
    if (before.sprintId !== issue.sprintId && !can(role, 'sprint.items'))
      deny('Добавлять и убирать задачи в спринте разработчик не может');
    if (
      (before.sprintId !== issue.sprintId ||
        before.priority !== issue.priority ||
        before.order !== issue.order) &&
      foreign(issue.projectId)
    )
      deny(FOREIGN);
  }

  for (const c of changes.comments ?? [])
    if (c.authorId !== userId) deny('Автор комментария — только текущий пользователь');
  for (const h of changes.history ?? [])
    if (h.authorId !== userId) deny('Автор записи истории — только текущий пользователь');

  return out;
}
