import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { backupsClient, type FolderListing } from '../../app/backups-client';
import type { BackupCounts, BackupEntry } from '../../domain/backups';
import { StorageError } from '../../storage';
import { useNotices } from '../../state/notices';
import { Dialog } from '../../ui/Dialog';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { Loading } from '../../ui/Loading';

export const BACKUPS_KEY = ['backups'];

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function countsText(c: BackupCounts | null): string {
  return c ? `задач ${c.issues}, спринтов ${c.sprints}, людей ${c.people}` : '—';
}

function message(e: unknown, fallback: string): string {
  return e instanceof StorageError ? [e.message, ...e.details].join(': ') : fallback;
}

/** Окно выбора папки на компьютере, где работает сервер: только папки, без файлов. */
function FolderPicker({
  start,
  onPick,
  onClose,
}: {
  start: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState<string | undefined>(start || undefined);
  const listing = useQuery<FolderListing>({
    queryKey: ['backup-folders', path ?? null],
    queryFn: () => backupsClient.folders(path),
    retry: false,
  });
  const data = listing.data;
  return (
    <Dialog title="Выбор папки для копий" onClose={onClose}>
      <p className="muted">
        Это папки компьютера, на котором работает трекер. Выберите папку (например, внутри Dropbox,
        OneDrive или Яндекс.Диска — тогда копии попадут в облако) и нажмите «Выбрать эту папку».
      </p>
      {listing.isPending && <Loading />}
      {listing.isError && (
        <ErrorMessage message={message(listing.error, 'Папку не удалось открыть')} />
      )}
      {data && (
        <>
          <p>
            <strong>{data.path === '' ? 'Диски' : data.path}</strong>
          </p>
          <ul className="folder-list">
            {data.parent !== null && (
              <li>
                <button type="button" className="plain" onClick={() => setPath(data.parent ?? '')}>
                  ↑ Вверх
                </button>
              </li>
            )}
            {data.folders.map((f) => (
              <li key={f.path}>
                <button type="button" className="plain" onClick={() => setPath(f.path)}>
                  📁 {f.name}
                </button>
              </li>
            ))}
            {data.folders.length === 0 && <li className="muted">Вложенных папок нет</li>}
          </ul>
        </>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="primary"
          disabled={!data || data.path === ''}
          onClick={() => data && onPick(data.path)}
        >
          Выбрать эту папку
        </button>{' '}
        <button type="button" onClick={onClose}>
          Отмена
        </button>
      </div>
    </Dialog>
  );
}

function EntryRow({ e }: { e: BackupEntry }) {
  return (
    <tr className={e.ok ? undefined : 'row-error'}>
      <td>{fmtDateTime(e.at)}</td>
      <td>{e.reason}</td>
      <td>{e.ok ? '✓ проверена' : `✗ ошибка: ${e.message}`}</td>
      <td>{countsText(e.counts)}</td>
    </tr>
  );
}

/** Блок «Резервные копии» на экране «Настройки» (только администратор, ADR-012). */
export function BackupsPanel() {
  const queryClient = useQueryClient();
  const push = useNotices((s) => s.push);
  const status = useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: backupsClient.status,
    // пока идёт копирование, состояние обновляется само
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });
  const [dir, setDir] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  const after = (s: unknown) => {
    queryClient.setQueryData(BACKUPS_KEY, s);
  };
  const run = useMutation({
    mutationFn: backupsClient.runNow,
    onSuccess: (s) => {
      after(s);
      push(s.last?.ok ? 'Копия сделана и проверена' : `Копия не создана: ${s.last?.message ?? 'ошибка'}`);
    },
    onError: (e) => push(message(e, 'Не удалось сделать копию')),
  });
  const save = useMutation({
    mutationFn: (d: string) => backupsClient.setDir(d),
    onSuccess: (s) => {
      after(s);
      setDir(null);
      setDirError(null);
      push(s.last?.ok ? 'Папка для копий изменена, первая копия сделана' : 'Папка изменена, но копия не создалась');
    },
    onError: (e) => setDirError(message(e, 'Папку не удалось сохранить')),
  });
  const excel = useMutation({
    mutationFn: backupsClient.downloadExcel,
    onError: (e) => push(message(e, 'Не удалось скачать Excel')),
  });

  const s = status.data;
  const shownDir = dir ?? s?.dir ?? '';
  const lastOk = s?.lastOkAt ? fmtDateTime(s.lastOkAt) : null;

  return (
    <section aria-labelledby="backups-title" className="backups">
      <h2 id="backups-title">Резервные копии</h2>
      <p className="muted">Видно только администратору.</p>
      {status.isPending && <Loading />}
      {status.isError && <ErrorMessage message="Не удалось загрузить состояние копий" />}
      {s && (
        <>
          <div className="backup-state">
            <p>
              <strong>Последняя копия: {lastOk ?? 'нет'}</strong>{' '}
              {s.last && (
                <span className={`chip ${s.last.ok ? '' : 'chip-error'}`}>
                  {s.last.ok ? '✓ проверена' : '✗ ошибка'}
                </span>
              )}
            </p>
            <p>
              Следующая:{' '}
              {s.nextAt ? `${fmtDateTime(s.nextAt)} (каждый день в ${s.time})` : 'автокопирование выключено'}
            </p>
          </div>

          <form
            className="backup-dir"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(shownDir);
            }}
          >
            <label htmlFor="backup-dir">Папка для копий</label>
            <div className="backup-dir-row">
              <input
                id="backup-dir"
                value={shownDir}
                onChange={(e) => setDir(e.target.value)}
                aria-describedby="backup-dir-note"
                spellCheck={false}
              />
              <button type="button" onClick={() => setPicking(true)}>
                Обзор…
              </button>
              <button
                type="submit"
                className="primary"
                aria-label="Сохранить папку копий"
                disabled={save.isPending || dir === null || dir === s.dir}
              >
                Сохранить
              </button>
            </div>
            <p id="backup-dir-note" className="hint">
              Полный путь, например D:\Dropbox\tracker-backups. Папка проверяется (в неё должно быть
              можно записать), после сохранения сразу делается первая копия. Прежние копии остаются
              на старом месте.
            </p>
            {dirError && (
              <p className="field-error" role="alert">
                {dirError}
              </p>
            )}
          </form>
          {picking && (
            <FolderPicker
              start={s.dir}
              onClose={() => setPicking(false)}
              onPick={(p) => {
                setDir(p);
                setPicking(false);
              }}
            />
          )}

          <p>
            <button
              type="button"
              className="primary"
              disabled={run.isPending || s.running}
              onClick={() => run.mutate()}
            >
              {run.isPending || s.running ? 'Копирую…' : 'Сделать копию сейчас'}
            </button>{' '}
            <button type="button" disabled={excel.isPending || !lastOk} onClick={() => excel.mutate()}>
              Скачать Excel
            </button>{' '}
            <span className="muted">{lastOk ? `tracker.xlsx из копии от ${lastOk}` : 'копий пока нет'}</span>
          </p>

          <h3>Последние копии</h3>
          {s.recent.length === 0 ? (
            <p className="muted">Копий ещё не делали.</p>
          ) : (
            <table className="totals" aria-label="Последние копии">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Причина</th>
                  <th>Результат</th>
                  <th>Состав</th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((e) => (
                  <EntryRow key={`${e.at}-${e.reason}`} e={e} />
                ))}
              </tbody>
            </table>
          )}
          <p className="muted">
            Хранятся {s.keepDaily} последних ежедневных и {s.keepMonthly} ежемесячных копий. В каждой:
            tracker.xlsx (для чтения), tracker.json (для восстановления) и копия базы. Восстановление —
            из командной строки: <code>npm run restore &lt;папка копии&gt;</code>.
          </p>
        </>
      )}
    </section>
  );
}
