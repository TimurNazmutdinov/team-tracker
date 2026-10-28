import { useNotices } from '../state/notices';

export function Notices() {
  const { notices, dismiss } = useNotices();
  if (notices.length === 0) return null;
  return (
    <div className="notices" role="status">
      {notices.map((n) => (
        <p key={n.id} className="notice">
          <span>{n.text}</span>
          <button type="button" onClick={() => dismiss(n.id)} aria-label="Закрыть уведомление">
            ×
          </button>
        </p>
      ))}
    </div>
  );
}
