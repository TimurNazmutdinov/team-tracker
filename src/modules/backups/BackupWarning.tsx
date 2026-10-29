import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { backupsClient } from '../../app/backups-client';
import { SERVER_MODE } from '../../app/create-storage';
import { useSession } from '../../state/session';
import { BACKUPS_KEY } from './BackupsPanel';

/** Заметное предупреждение администратору, если копия не создана или давно не делалась (ADR-012). */
export function BackupWarning() {
  const { key } = useParams();
  const isAdmin = useSession((s) => s.account?.role === 'admin');
  const status = useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: backupsClient.status,
    enabled: SERVER_MODE && isAdmin,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });
  const warning = status.data?.warning;
  if (!SERVER_MODE || !isAdmin || !warning) return null;
  return (
    <div className="backup-warning" role="alert">
      <strong>⚠ {warning}.</strong>{' '}
      {key ? (
        <Link to={`/projects/${key}/settings`}>Открыть «Настройки → Резервные копии»</Link>
      ) : (
        'Откройте проект → «Настройки» → «Резервные копии».'
      )}
    </div>
  );
}
