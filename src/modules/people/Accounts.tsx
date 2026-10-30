import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { authClient } from '../../app/auth-client';
import { DEFAULT_ROLES, can, roleName, type Role } from '../../domain/permissions';
import { useRoles } from '../../state/queries';
import { StorageError } from '../../storage';
import { useNotices } from '../../state/notices';
import { useSession } from '../../state/session';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { Loading } from '../../ui/Loading';
import { TextField } from '../../ui/fields';

// Без похожих символов (0/O, 1/l/I), чтобы пароль можно было продиктовать
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Случайный временный пароль из 12 символов (криптостойкий генератор браузера). */
export function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function message(e: unknown, fallback: string): string {
  return e instanceof StorageError ? [e.message, ...e.details].join(': ') : fallback;
}

/** Выданный временный пароль показывается один раз: на сервере хранится только его хэш. */
export function TemporaryPassword({ who, password }: { who: string; password: string }) {
  return (
    <p className="warn" role="status">
      Временный пароль для {who}: <code>{password}</code>. Передайте его участнику — при первом
      входе он должен будет сменить пароль. Это сообщение исчезнет при обновлении страницы.
    </p>
  );
}

export function NewAccountForm({
  onCreated,
}: {
  onCreated: (who: string, password: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const roles = useRoles().data ?? DEFAULT_ROLES;
  const [chosen, setRole] = useState<Role>('developer');
  // выбранную роль могли удалить в настройках: тогда берётся первая обычная
  const role = roles.some((r) => r.id === chosen)
    ? chosen
    : ((roles.find((r) => !r.system) ?? roles[0])?.id ?? chosen);
  const [password, setPassword] = useState(generatePassword);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      await authClient.createUser({ name, email, password, role });
      onCreated(name.trim(), password);
      setName('');
      setEmail('');
      setPassword(generatePassword());
      await queryClient.invalidateQueries();
    } catch (err) {
      setErrors(
        err instanceof StorageError
          ? [err.message, ...err.details]
          : ['Не удалось создать участника'],
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="new-account" onSubmit={(e) => void submit(e)} noValidate>
      <h3>Новый участник</h3>
      <div className="form-row">
        <TextField label="Имя" name="name" value={name} onChange={setName} required />
        <TextField label="Почта" name="email" value={email} onChange={setEmail} required />
        <TextField
          label="Временный пароль"
          name="password"
          value={password}
          onChange={setPassword}
          hint="Сгенерирован; можно заменить своим (от 8 символов)"
          required
        />
        <div className="field">
          <label htmlFor="new-account-role">Роль</label>
          <select
            id="new-account-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {errors.length > 0 && (
        <div className="error" role="alert">
          {errors.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}
      <button type="submit" className="primary" disabled={busy}>
        Создать участника
      </button>
    </form>
  );
}

/** Учётки и роли (ADR-010, ADR-011): видят все вошедшие; создавать участников и менять роли и пароли — администратор. */
export function Accounts() {
  const roles = useRoles().data ?? DEFAULT_ROLES;
  const me = useSession((s) => s.account);
  const queryClient = useQueryClient();
  const push = useNotices((s) => s.push);
  const [issued, setIssued] = useState<{ who: string; password: string } | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: authClient.users });
  const change = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => authClient.setRole(id, role),
    onSuccess: async () => {
      push('Роль изменена');
      await queryClient.invalidateQueries();
    },
    onError: (e) => push(message(e, 'Не удалось изменить роль')),
  });
  const reset = useMutation({
    mutationFn: ({ id, password }: { id: string; name: string; password: string }) =>
      authClient.resetPassword(id, password),
    onSuccess: async (_, vars) => {
      setIssued({ who: vars.name, password: vars.password });
      await queryClient.invalidateQueries();
    },
    onError: (e) => push(message(e, 'Не удалось выдать пароль')),
  });
  const manage = me !== null && can(roles, me.role, 'users.manage');

  return (
    <section aria-labelledby="accounts-title" className="accounts">
      <h2 id="accounts-title">Учётки и роли</h2>
      {issued && <TemporaryPassword who={issued.who} password={issued.password} />}
      {users.isPending && <Loading />}
      {users.isError && <ErrorMessage message="Не удалось загрузить учётки" />}
      {users.data && (
        <table className="totals" aria-label="Учётки">
          <thead>
            <tr>
              <th>Имя</th>
              {manage && <th>Почта</th>}
              <th>Роль</th>
              {manage && <th>Пароль</th>}
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
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    roleName(roles, u.role)
                  )}
                </td>
                {manage && (
                  <td>
                    {u.mustChangePassword && <span className="chip">временный</span>}{' '}
                    <button
                      type="button"
                      aria-label={`Выдать новый временный пароль: ${u.name}`}
                      disabled={reset.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Выдать ${u.name} новый временный пароль? Текущий пароль перестанет работать, сессии закроются.`,
                          )
                        )
                          reset.mutate({ id: u.id, name: u.name, password: generatePassword() });
                      }}
                    >
                      Сбросить
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {manage && <NewAccountForm onCreated={(who, password) => setIssued({ who, password })} />}
    </section>
  );
}
