import { useEffect } from 'react';
import { StorageError } from '../storage';
import { reportError } from './error-log';
import { Logo } from '../ui/Logo';
import { clearSavedData } from './create-storage';

/** Экран ошибки запуска: данные повреждены. Предлагает сбросить сохранённые изменения. */
export function BootError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'неизвестная ошибка';
  const details = error instanceof StorageError ? error.details : [];
  useEffect(() => reportError(error, 'запуск'), [error]);
  const onClear = () => {
    clearSavedData();
    window.location.reload();
  };
  return (
    <main className="boot-error" role="alert">
      <p className="login-logo">
        <Logo size={36} />
      </p>
      <h1>Не удалось загрузить данные</h1>
      <p>{message}</p>
      {details.length > 0 && (
        <ul>
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      <p>Можно удалить сохранённые в браузере изменения и начать с исходных демо-данных.</p>
      <button type="button" onClick={onClear}>
        Сбросить сохранённые данные
      </button>
    </main>
  );
}
