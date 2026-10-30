import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  aboutClient,
  clientBuild,
  downloadDiagnostics,
  type LogRecord,
} from '../../app/about-client';
import { backupsClient } from '../../app/backups-client';
import { SERVER_MODE } from '../../app/create-storage';
import { errorRing } from '../../app/error-log';
import type { BackupStatus } from '../../domain/backups';
import { usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { PageHeader } from '../../ui/PageHeader';

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

const DATABASES = { pglite: 'встроенная база PGlite', postgres: 'PostgreSQL' } as const;

function BackupBlock({ status }: { status: BackupStatus }) {
  const last = status.last;
  return (
    <section className="about-block" aria-labelledby="about-backups">
      <h2 id="about-backups">Резервные копии</h2>
      {last ? (
        <p>
          <strong>Последняя копия: {stamp(last.at)}</strong>{' '}
          <span className={`chip ${last.ok ? 'status-done' : 'hot'}`}>
            {last.ok ? '✓ проверена' : '✗ ошибка'}
          </span>
          {!last.ok && last.message && <span className="muted"> {last.message}</span>}
        </p>
      ) : (
        <p>Копий пока нет.</p>
      )}
      {status.nextAt && <p className="muted">Следующая: {stamp(status.nextAt)}.</p>}
      <p>
        <Link to="/projects">Резервные копии — в настройках проекта</Link>
      </p>
    </section>
  );
}

/** Экран «О программе» (wireframes.md, раздел 18): версия, копии, диагностика и журнал ошибок. */
export function AboutPage() {
  const perms = usePermissions();
  const push = useNotices((s) => s.push);
  const canDiagnose = perms.can('system.diagnose');
  const [busy, setBusy] = useState(false);

  const about = useQuery({
    queryKey: ['about'],
    queryFn: aboutClient.about,
    enabled: SERVER_MODE,
  });
  const backups = useQuery({
    queryKey: ['about-backups'],
    queryFn: backupsClient.status,
    enabled: SERVER_MODE && canDiagnose,
  });
  const log = useQuery({
    queryKey: ['about-log'],
    queryFn: aboutClient.log,
    enabled: SERVER_MODE && canDiagnose,
  });

  const entries: LogRecord[] = SERVER_MODE
    ? (log.data ?? [])
    : errorRing
        .list()
        .slice()
        .reverse()
        .map((e) => ({ ...e, source: 'client' as const }));

  const collect = async () => {
    setBusy(true);
    try {
      await downloadDiagnostics();
    } catch (e) {
      push(e instanceof Error ? e.message : 'Не удалось собрать диагностику');
    } finally {
      setBusy(false);
    }
  };

  const server = about.data;
  const mismatch = server && server.version !== clientBuild.version;

  return (
    <>
      <PageHeader title="О программе" />
      <section className="about-block" aria-labelledby="about-version">
        <h2 id="about-version">Team Tracker {clientBuild.version}</h2>
        <dl className="about-list">
          <dt>Сборка</dt>
          <dd>{stamp(server?.buildDate ?? clientBuild.buildDate)}</dd>
          <dt>Режим</dt>
          <dd>
            {SERVER_MODE
              ? `сервер${server ? ` · ${DATABASES[server.database]}` : ''}`
              : 'демо в браузере (данные хранятся в браузере)'}
          </dd>
          {server && (
            <>
              <dt>Окружение</dt>
              <dd>
                Node {server.node.replace(/^v/, '')} · {server.platform}
              </dd>
              <dt>Сервер запущен</dt>
              <dd>{stamp(server.startedAt)}</dd>
            </>
          )}
        </dl>
        {mismatch && (
          <p className="warn" role="status">
            Версии клиента ({clientBuild.version}) и сервера ({server.version}) различаются:
            обновите страницу (Ctrl+F5).
          </p>
        )}
      </section>

      {canDiagnose && (
        <>
          {SERVER_MODE && backups.data && <BackupBlock status={backups.data} />}
          <section className="about-block" aria-labelledby="about-diag">
            <h2 id="about-diag">Диагностика</h2>
            <p>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void collect()}
              >
                Собрать диагностику
              </button>
            </p>
            <p className="muted small">
              В архиве: версия и сборка, настройки без секретов (пароли и строка подключения не
              включаются), последние записи журнала ошибок
              {SERVER_MODE ? ', состояние копий' : ''}. Данных задач и людей в архиве нет.
            </p>
          </section>
          <section className="about-block" aria-labelledby="about-log">
            <h2 id="about-log">Журнал ошибок</h2>
            {entries.length === 0 ? (
              <p className="muted">Записей нет.</p>
            ) : (
              <ul className="log-list">
                {entries.map((e, n) => (
                  <li key={`${e.at}-${n}`}>
                    <time dateTime={e.at}>{stamp(e.at)}</time>
                    <span className="chip">{e.source === 'server' ? 'сервер' : 'клиент'}</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {SERVER_MODE && (
              <p className="muted small">Файлы: DATA_DIR/logs (ротация: до 5 файлов по 1 МБ).</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
