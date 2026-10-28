import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '../../app/auth-client';
import { ROLES, ROLE_LABELS, can, type Role } from '../../domain/permissions';
import { StorageError } from '../../storage';
import { useNotices } from '../../state/notices';
import { useSession } from '../../state/session';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { Loading } from '../../ui/Loading';

/** Учётки и роли (ADR-010): видят все вошедшие, менять роли может только администратор. */
export function Accounts() {
  const me = useSession((s) => s.account);
  const queryClient = useQueryClient();
  const push = useNotices((s) => s.push);
  const users = useQuery({ queryKey: ['users'], queryFn: authClient.users });
  const change = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => authClient.setRole(id, role),
    onSuccess: async () => {
      push('Роль изменена');
      await queryClient.invalidateQueries();
    },
    onError: (e) => push(e instanceof StorageError ? e.message : 'Не удалось изменить роль'),
  });
  const manage = me !== null && can(me.role, 'users.manage');

  return (
    <section aria-labelledby="accounts-title" className="accounts">
      <h2 id="accounts-title">Учётки и роли</h2>
      {users.isPending && <Loading />}
      {users.isError && <ErrorMessage message="Не удалось загрузить учётки" />}
      {users.data && (
        <table className="totals" aria-label="Учётки">
          <thead>
            <tr>
              <th>Имя</th>
              {manage && <th>Почта</th>}
              <th>Роль</th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                {manage && <td>{u.email}</td>}
                <td>
                  {manage ? (
                    <select
                      aria-label={`Роль: ${u.name}`}
                      value={u.role}
                      disabled={change.isPending}
                      onChange={(e) => change.mutate({ id: u.id, role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABELS[u.role]
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
