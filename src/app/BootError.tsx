import { StorageError } from '../storage';
import { clearSavedData } from './create-storage';

/** Экран ошибки запуска: данные повреждены. Предлагает сбросить сохранённые изменения. */
export function BootError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'неизвестная ошибка';
  const details = error instanceof StorageError ? error.details : [];
  const onClear = () => {
    clearSavedData();
    window.location.reload();
  };
  return (
    <main className="boot-error" role="alert">
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
