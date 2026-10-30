import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { authClient } from '../../app/auth-client';
import { SERVER_MODE } from '../../app/create-storage';
import {
  ACTION_GROUPS,
  ACTION_LABELS,
  NEW_ROLE_PREFIX,
  type Action,
  type RoleDef,
} from '../../domain/roles';
import { useRoleActions } from '../../state/actions';
import { useNotices } from '../../state/notices';
import { useRoles } from '../../state/queries';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { Loading } from '../../ui/Loading';

/**
 * Роли и права (wireframes.md, 24.4): столбец — роль с названием-полем, строки — функции, галочки —
 * что разрешено. Роль «Администратор» защищена. Сохраняется одним нажатием.
 */
export function RolesMatrix() {
  const roles = useRoles();
  if (!roles.data) return <Loading />;
  // при смене сохранённых ролей таблица пересоздаётся с актуальным черновиком
  return <Matrix key={JSON.stringify(roles.data)} current={roles.data} />;
}

function Matrix({ current }: { current: RoleDef[] }) {
  const actions = useRoleActions();
  const push = useNotices((s) => s.push);
  const users = useQuery({
    queryKey: ['users'],
    queryFn: authClient.users,
    enabled: SERVER_MODE,
  });
  const [draft, setDraft] = useState<RoleDef[]>(structuredClone(current));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [counter, setCounter] = useState(1);
  const [busy, setBusy] = useState(false);

  const usedBy = (id: string) => (users.data ?? []).filter((u) => u.role === id).length;
  const change = (id: string, patch: Partial<RoleDef>) =>
    setDraft(draft.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const toggle = (role: RoleDef, action: Action) =>
    change(role.id, {
      permissions: role.permissions.includes(action)
        ? role.permissions.filter((a) => a !== action)
        : [...role.permissions, action],
    });
  const add = (from?: RoleDef) => {
    setDraft([
      ...draft,
      {
        id: `${NEW_ROLE_PREFIX}${counter}`,
        name: from ? `${from.name} (копия)` : 'Новая роль',
        permissions: from ? [...from.permissions] : [],
        system: false,
      },
    ]);
    setCounter(counter + 1);
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);

  const save = async () => {
    setBusy(true);
    const result = await actions.saveRoles(current, draft);
    setBusy(false);
    if (result.ok) {
      setErrors({});
      push('Роли и права сохранены');
    } else setErrors(result.errors);
  };

  return (
    <section className="settings-card roles-matrix" aria-labelledby="roles-title">
      <h2 id="roles-title">Роли и права</h2>
      <p className="muted">
        Название роли — любое; галочки задают, что роли разрешено. Просмотр данных доступен всем
        ролям, роль без галочек — только чтение.
      </p>
      <div className="table-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col">Функция</th>
              {draft.map((r) => (
                <th key={r.id} scope="col">
                  <input
                    type="text"
                    aria-label={`Название роли: ${r.name}`}
                    value={r.name}
                    disabled={r.system}
                    maxLength={40}
                    aria-invalid={errors[r.id] ? true : undefined}
                    title={r.system ? 'Роль «Администратор» защищена' : 'Название роли'}
                    onChange={(e) => change(r.id, { name: e.target.value })}
                  />
                  {errors[r.id] && (
                    <span className="field-error" role="alert">
                      {errors[r.id]}
                    </span>
                  )}
                  {SERVER_MODE && !r.id.startsWith(NEW_ROLE_PREFIX) && (
                    <span className="muted small">учёток: {usedBy(r.id)}</span>
                  )}
                  <span className="matrix-actions">
                    <button
                      type="button"
                      title="Создать роль с такими же правами"
                      onClick={() => add(r)}
                    >
                      Копия
                    </button>
                    {!r.system && (
                      <button
                        type="button"
                        title={
                          usedBy(r.id) > 0
                            ? 'Роль назначена учёткам: сначала смените им роль'
                            : 'Удалить роль'
                        }
                        disabled={usedBy(r.id) > 0}
                        aria-label={`Удалить роль ${r.name}`}
                        onClick={() => setDraft(draft.filter((x) => x.id !== r.id))}
                      >
                        Удалить
                      </button>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {ACTION_GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr className="matrix-group">
                <th colSpan={draft.length + 1} scope="colgroup">
                  {g.title}
                </th>
              </tr>
              {g.actions.map((action) => (
                <tr key={action}>
                  <th scope="row">{ACTION_LABELS[action]}</th>
                  {draft.map((r) => (
                    <td key={r.id}>
                      <input
                        type="checkbox"
                        aria-label={`${r.name}: ${ACTION_LABELS[action]}`}
                        checked={r.system || r.permissions.includes(action)}
                        disabled={r.system}
                        onChange={() => toggle(r, action)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {errors['form'] && <ErrorMessage message={errors['form']} />}
      <div className="form-actions">
        <button type="button" onClick={() => add()}>
          + Новая роль
        </button>
        <button
          type="button"
          className="primary"
          disabled={!dirty || busy}
          onClick={() => void save()}
        >
          Сохранить
        </button>
        {dirty && <span className="muted">Есть несохранённые изменения</span>}
      </div>
    </section>
  );
}
