import { useRouteError } from 'react-router';

export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'неизвестная ошибка';
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
