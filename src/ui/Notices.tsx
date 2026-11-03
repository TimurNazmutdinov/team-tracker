import { Link } from 'react-router';
import { useNotices, type NoticeKind } from '../state/notices';

const MARK: Record<NoticeKind, string> = { success: '✓', info: 'ℹ', warn: '⚠', error: '✕' };

/** Всплывающие сообщения в правом нижнем углу поверх страницы (D-7): страница не сдвигается. */
export function Notices() {
  const { notices, dismiss, hold, release } = useNotices();
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <p
          key={n.id}
          className={`notice notice-${n.kind}`}
          role={n.kind === 'error' ? 'alert' : undefined}
          onMouseEnter={() => hold(n.id)}
          onMouseLeave={() => release(n.id)}
          onFocus={() => hold(n.id)}
          onBlur={() => release(n.id)}
        >
          <span className="notice-mark" aria-hidden="true">
            {MARK[n.kind]}
          </span>
          <span className="notice-text">{n.text}</span>
          {n.link && (
            <Link to={n.link.to} className="notice-link" onClick={() => dismiss(n.id)}>
              {n.link.label}
            </Link>
          )}
          <button
            type="button"
            className="plain"
            onClick={() => dismiss(n.id)}
            aria-label="Закрыть уведомление"
            title="Закрыть"
          >
            ×
          </button>
        </p>
      ))}
    </div>
  );
}
