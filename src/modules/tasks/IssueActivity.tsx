import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { FieldErrors, View } from '../../domain/actions';
import type { History, Issue, Status } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { useComments, useHistory } from '../../state/queries';
import { Async } from '../../ui/Async';
import { TextArea } from '../../ui/fields';
import { Avatar, StatusChip } from './IssueBits';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

function Comments({ issue, view }: { issue: Issue; view: View }) {
  const actions = useActions(view.projectId);
  const comments = useComments(issue.id);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const result = await actions.addComment(issue.id, text);
    setErrors(result.ok ? {} : result.errors);
    if (result.ok) setText('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div>
      <Async query={comments}>
        {(list) =>
          list.length === 0 ? (
            <p className="muted">Комментариев пока нет</p>
          ) : (
            <ul className="plain-list">
              {[...list]
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((c) => {
                  const author = view.people.find((p) => p.id === c.authorId);
                  return (
                    <li key={c.id} className="comment">
                      <Avatar person={author} />
                      <div>
                        <p>
                          <strong>{author?.name ?? 'Неизвестный'}</strong>{' '}
                          <span className="muted">{fmtDateTime(c.createdAt)}</span>
                        </p>
                        <p className="pre">{c.text}</p>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )
        }
      </Async>
      <form onSubmit={(e) => void send(e)} onKeyDown={onKeyDown} noValidate>
        <TextArea
          name="comment"
          label="Новый комментарий"
          rows={3}
          value={text}
          onChange={setText}
          error={errors.text}
        />
        {errors.form && (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        )}
        <button type="submit">Отправить</button>{' '}
        <span className="muted">Ctrl+Enter — отправить</span>
      </form>
    </div>
  );
}

function HistoryRow({ entry, view }: { entry: History; view: View }) {
  const author = view.people.find((p) => p.id === entry.authorId);
  const person = (id: string | null) => view.people.find((p) => p.id === id)?.name ?? '—';
  const sprint = (id: string | null) => view.sprints.find((s) => s.id === id)?.name ?? 'Бэклог';
  let what: ReactNode;
  switch (entry.field) {
    case 'created':
      what = (
        <>
          создана, статус <StatusChip status={(entry.to ?? 'Backlog') as Status} />
        </>
      );
      break;
    case 'status':
      what = (
        <>
          статус: {entry.from && <StatusChip status={entry.from as Status} />} →{' '}
          <StatusChip status={(entry.to ?? 'Backlog') as Status} />
        </>
      );
      break;
    case 'sprintId':
      what = `спринт: ${sprint(entry.from)} → ${sprint(entry.to)}`;
      break;
    case 'assigneeId':
      what = `исполнитель: ${person(entry.from)} → ${person(entry.to)}`;
      break;
    case 'points':
      what = `story points: ${entry.from ?? '—'} → ${entry.to ?? '—'}`;
      break;
  }
  return (
    <li className="history-row">
      <span className="muted">{fmtDateTime(entry.at)}</span>
      <strong>{author?.name ?? 'Неизвестный'}</strong>
      <span>{what}</span>
    </li>
  );
}

function HistoryList({ issue, view }: { issue: Issue; view: View }) {
  const history = useHistory(issue.id);
  return (
    <Async query={history}>
      {(list) => (
        <>
          <ul className="plain-list">
            {list
              .map((h, i) => ({ h, i }))
              .sort((a, b) => a.h.at.localeCompare(b.h.at) || a.i - b.i)
              .map(({ h }) => (
                <HistoryRow key={h.id} entry={h} view={view} />
              ))}
          </ul>
          <p className="muted small">
            В истории видны создание задачи и смены статуса, исполнителя, story points и спринта.
            Записи только добавляются: править и удалять их нельзя.
          </p>
        </>
      )}
    </Async>
  );
}

/** Вкладки «Комментарии» и «История» (F-17, F-19). */
export function IssueActivity({ issue, view }: { issue: Issue; view: View }) {
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  const comments = useComments(issue.id);
  const history = useHistory(issue.id);
  return (
    <section aria-label="Комментарии и история">
      <div role="tablist" className="tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'comments'}
          onClick={() => setTab('comments')}
        >
          Комментарии{comments.data ? ` (${comments.data.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          onClick={() => setTab('history')}
        >
          История{history.data ? ` (${history.data.length})` : ''}
        </button>
      </div>
      <div role="tabpanel">
        {tab === 'comments' ? (
          <Comments issue={issue} view={view} />
        ) : (
          <HistoryList issue={issue} view={view} />
        )}
      </div>
    </section>
  );
}
