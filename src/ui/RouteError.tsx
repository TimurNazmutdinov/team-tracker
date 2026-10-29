import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { reportError } from '../app/error-log';

export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'неизвестная ошибка';
  useEffect(() => reportError(error, 'экран'), [error]);
  return (
    <main className="boot-error" role="alert">
      <h1>Что-то пошло не так</h1>
      <p>{message}</p>
      <p>
        <a href={import.meta.env.BASE_URL}>Вернуться на главную</a>
      </p>
    </main>
  );
}
