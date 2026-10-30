import type { Changes } from './changes';
import type { Ctx, FieldErrors, Result, View } from './actions';
import type { Person, Project, ProjectMember, ProjectRole } from './schema';
import { PROJECT_ROLES } from './schema';

// Владелец и участники проекта (ADR-016): чистые функции, возвращающие набор изменений или ошибки.

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  product: 'Продакт',
  lead: 'Тимлид',
  developer: 'Разработчик',
};

const fail = (errors: FieldErrors): Result => ({ ok: false, errors });

export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === 'string' && (PROJECT_ROLES as readonly string[]).includes(value);
}

/** Участвует ли человек в проекте: владелец или участник. */
export function isParticipant(
  project: Project,
  members: ProjectMember[],
  personId: string,
): boolean {
  return (
    project.ownerId === personId ||
    members.some((m) => m.projectId === project.id && m.personId === personId)
  );
}

/** Проекты, где человек владелец или участник («Мои проекты»). */
export function myProjects(
  projects: Project[],
  members: ProjectMember[],
  personId: string | null,
): Project[] {
  if (personId === null) return [];
  return projects.filter((p) => isParticipant(p, members, personId));
}

/** Участники проекта с людьми, владелец первым; люди, которых уже нет в справочнике, пропускаются. */
export function projectTeam(
  project: Project,
  members: ProjectMember[],
  people: Person[],
): { person: Person; role: ProjectRole | 'owner'; memberId: string | null }[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: { person: Person; role: ProjectRole | 'owner'; memberId: string | null }[] = [];
  const owner = project.ownerId ? byId.get(project.ownerId) : undefined;
  if (owner) out.push({ person: owner, role: 'owner', memberId: null });
  for (const m of members.filter((x) => x.projectId === project.id)) {
    const person = byId.get(m.personId);
    if (person) out.push({ person, role: m.role, memberId: m.id });
  }
  return out;
}

export function addMember(
  view: View,
  input: { personId: string; role: ProjectRole },
  ctx: Ctx,
): Result {
  if (!view.people.some((p) => p.id === input.personId))
    return fail({ personId: 'Выберите человека из списка' });
  if (!isProjectRole(input.role)) return fail({ role: 'Выберите роль в проекте' });
  if (view.project.ownerId === input.personId)
    return fail({ personId: 'Этот человек уже владелец проекта' });
  if (view.members.some((m) => m.projectId === view.projectId && m.personId === input.personId))
    return fail({ personId: 'Этот человек уже участник проекта' });
  return {
    ok: true,
    changes: {
      members: [
        { id: ctx.newId(), projectId: view.projectId, personId: input.personId, role: input.role },
      ],
    },
  };
}

export function setMemberRole(view: View, memberId: string, role: ProjectRole): Result {
  const member = view.members.find((m) => m.id === memberId && m.projectId === view.projectId);
  if (!member) return fail({ form: 'Участник не найден' });
  if (!isProjectRole(role)) return fail({ role: 'Выберите роль в проекте' });
  if (member.role === role) return { ok: true, changes: {} };
  return { ok: true, changes: { members: [{ ...member, role }] } };
}

export function removeMember(view: View, memberId: string): Result {
  const member = view.members.find((m) => m.id === memberId && m.projectId === view.projectId);
  if (!member) return fail({ form: 'Участник не найден' });
  return { ok: true, changes: { deleteMemberIds: [member.id] } };
}

/**
 * Смена владельца. Новый владелец перестаёт быть участником (его роль владельца важнее), прежний
 * остаётся участником с ролью продакта, чтобы не потерять доступ к проекту.
 */
export function setOwner(view: View, personId: string | null, ctx: Ctx): Result {
  if (personId !== null && !view.people.some((p) => p.id === personId))
    return fail({ ownerId: 'Выберите человека из списка' });
  if (personId === view.project.ownerId) return { ok: true, changes: {} };
  const changes: Changes = {
    projects: [{ ...view.project, ownerId: personId }],
  };
  const former = view.project.ownerId;
  const becomes =
    personId === null
      ? undefined
      : view.members.find((m) => m.projectId === view.projectId && m.personId === personId);
  if (becomes) changes.deleteMemberIds = [becomes.id];
  if (former !== null && former !== personId) {
    changes.members = [
      { id: ctx.newId(), projectId: view.projectId, personId: former, role: 'product' },
    ];
  }
  return { ok: true, changes };
}
