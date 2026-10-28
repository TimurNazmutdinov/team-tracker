import { useState, type FormEvent } from 'react';
import { StorageError } from '../../storage';
import { authClient } from '../../app/auth-client';
import { useSession } from '../../state/session';
import { TextField } from '../../ui/fields';

/** Экран входа и регистрации (ADR-010). Регистрация простая, тестовая: почта, имя, пароль. */
export function LoginPage() {
  const setAccount = useSession((s) => s.set);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const account =
        mode === 'login'
          ? await authClient.login(email, password)
          : await authClient.register(email, password, name);
      setAccount(account);
    } catch (err) {
      setErrors(
        err instanceof StorageError
          ? [err.message, ...err.details]
          : [err instanceof Error ? err.message : 'Не удалось войти'],
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login" id="main">
      <h1>team-tracker</h1>
      <div role="tablist" className="tabs" aria-label="Вход или регистрация">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => setMode('login')}
        >
          Вход
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          onClick={() => setMode('register')}
        >
          Регистрация
        </button>
      </div>
      <form onSubmit={(e) => void submit(e)} noValidate>
        {mode === 'register' && (
          <TextField label="Имя" name="name" value={name} onChange={setName} required />
        )}
        <TextField label="Почта" name="email" value={email} onChange={setEmail} required />
        <TextField
          label="Пароль"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          required
          hint={mode === 'register' ? 'Не короче 8 символов' : undefined}
        />
        {errors.length > 0 && (
          <div className="error" role="alert">
            {errors.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {mode === 'login' ? 'Войти' : 'Создать учётку'}
        </button>
        {mode === 'register' && (
          <p className="muted">
            Первая созданная учётка становится администратором, остальные — разработчиками.
          </p>
        )}
      </form>
    </main>
  );
}
