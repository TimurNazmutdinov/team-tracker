export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error" role="alert">
      <p>Не получилось выполнить действие: {message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}
