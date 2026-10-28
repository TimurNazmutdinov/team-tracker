import { useState, type FormEvent } from 'react';
import { authClient } from '../../app/auth-client';
import { StorageError } from '../../storage';
import { useSession } from '../../state/session';
import { TextField } from '../../ui/fields';

/** Смена пароля после входа с временным паролем (ADR-011): пока она не сделана, работать нельзя. */
export function ChangePasswordPage() {
  const account = useSession((s) => s.account);
  const setAccount = useSession((s) => s.set);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== repeat) {
      setErrors(['Новый пароль и повтор не совпадают']);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      await authClient.changePassword(current, next);
      setAccount(await authClient.me());
    } catch (err) {
      setErrors(
        err instanceof StorageError
          ? [err.message, ...err.details]
          : [err instanceof Error ? err.message : 'Не удалось сменить пароль'],
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await authClient.logout().catch(() => undefined);
    setAccount(null);
  };

  return (
    <main className="login" id="main">
      <h1>Смените пароль</h1>
      <p>
        {account?.name}, вам выдан временный пароль. Придумайте свой — после этого откроется трекер.
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label="Временный пароль"
          name="current"
          type="password"
          value={current}
          onChange={setCurrent}
          required
        />
        <TextField
          label="Новый пароль"
          name="next"
          type="password"
          value={next}
          onChange={setNext}
          required
          hint="Не короче 8 символов"
        />
        <TextField
          label="Повтор нового пароля"
          name="repeat"
          type="password"
          value={repeat}
          onChange={setRepeat}
          required
        />
        {errors.length > 0 && (
          <div className="error" role="alert">
            {errors.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        <button type="submit" className="primary" disabled={busy}>
          Сменить пароль
        </button>{' '}
        <button type="button" onClick={() => void logout()}>
          Выйти
        </button>
      </form>
    </main>
  );
}
