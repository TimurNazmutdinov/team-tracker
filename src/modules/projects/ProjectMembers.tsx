import { useState } from 'react';
import type { View } from '../../domain/actions';
import { PROJECT_ROLE_LABELS, isProjectRole, projectTeam } from '../../domain/members';
import { PROJECT_ROLES, type ProjectRole } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { useCurrentUser, usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { Avatar } from '../tasks/IssueBits';

/**
 * Владелец и участники проекта (wireframes.md, 19.3, ADR-016). Участников меняют администратор и
 * владелец проекта; владельца — только администратор.
 */
export function ProjectMembers({ view }: { view: View }) {
  const actions = useActions(view.projectId);
  const perms = usePermissions();
  const me = useCurrentUser();
  const push = useNotices((s) => s.push);
  const [person, setPerson] = useState('');
  const [role, setRole] = useState<ProjectRole>('developer');
  const isAdmin = perms.role === 'admin';
  const isOwner = perms.role === 'product' && me?.id === view.project.ownerId;
  const canManage = isAdmin || isOwner;
  const team = projectTeam(view.project, view.members, view.people);
  const taken = new Set(team.map((t) => t.person.id));
  const candidates = view.people.filter((p) => !taken.has(p.id));

  const report = (result: Awaited<ReturnType<typeof actions.addMember>>) => {
    if (!result.ok) push(Object.values(result.errors).join('. '));
    return result.ok;
  };

  return (
    <section className="about-block" aria-labelledby="members-title">
      <h2 id="members-title">Участники проекта</h2>
      <label className="owner-field">
        Владелец продукта
        <select
          value={view.project.ownerId ?? ''}
          disabled={!isAdmin}
          onChange={(e) => void actions.setOwner(e.target.value || null).then(report)}
        >
          <option value="">Не назначен</option>
          {view.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {!isAdmin && <span className="muted small"> меняет только администратор</span>}
      </label>

      <table aria-label="Участники и роли в проекте">
        <thead>
          <tr>
            <th scope="col">Участник</th>
            <th scope="col">Роль в проекте</th>
            <th scope="col">
              <span className="visually-hidden">Действия</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {team.map((t) => (
            <tr key={t.person.id}>
              <td>
                <Avatar person={t.person} /> {t.person.name}
              </td>
              <td>
                {t.role === 'owner' || t.memberId === null ? (
                  'Владелец продукта'
                ) : (
                  <select
                    aria-label={`Роль: ${t.person.name}`}
                    value={t.role}
                    disabled={!canManage}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (isProjectRole(next) && t.memberId)
                        void actions.setMemberRole(t.memberId, next).then(report);
                    }}
                  >
                    {PROJECT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {PROJECT_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td>
                {t.memberId !== null && canManage && (
                  <button
                    type="button"
                    onClick={() => void actions.removeMember(t.memberId ?? '').then(report)}
                  >
                    Убрать
                  </button>
                )}
              </td>
            </tr>
          ))}
          {team.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                Участников пока нет.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <form
          className="member-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!person) return;
            void actions.addMember(person, role).then((result) => {
              if (report(result)) setPerson('');
            });
          }}
        >
          <label>
            Человек
            <select value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Выберите человека</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Роль
            <select
              value={role}
              onChange={(e) => isProjectRole(e.target.value) && setRole(e.target.value)}
            >
              {PROJECT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {PROJECT_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary" disabled={!person}>
            + Добавить
          </button>
        </form>
      )}
      {!canManage && (
        <p className="muted small">Участников меняют администратор и владелец проекта.</p>
      )}
    </section>
  );
}
