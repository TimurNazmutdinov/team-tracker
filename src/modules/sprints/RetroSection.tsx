import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { RETRO_LABELS, retroOf } from '../../domain/retro';
import { RETRO_KINDS, type RetroKind, type Sprint } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { useCurrentUser, usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { useIssues, usePeople, useRetroItems } from '../../state/queries';
import { Loading } from '../../ui/Loading';

/**
 * Ретроспектива спринта (wireframes.md, 21.3): «что хорошо», «что улучшить», «действия». Добавляет любой,
 * удаляет автор, тимлид и администратор; действие превращается в задачу бэклога.
 */
export function RetroSection({
  projectId,
  projectKey,
  sprint,
  readOnly = false,
}: {
  projectId: string;
  projectKey: string;
  sprint: Sprint;
  readOnly?: boolean;
}) {
  const retro = useRetroItems(projectId);
  const people = usePeople();
  const issues = useIssues(projectId);
  if (!retro.data || !people.data || !issues.data) return <Loading />;
  const items = retroOf({ retroItems: retro.data }, sprint.id);
  return (
    <section className="retro" aria-label="Ретроспектива">
      <div className="retro-columns">
        {RETRO_KINDS.map((kind) => (
          <RetroColumn
            key={kind}
            kind={kind}
            projectId={projectId}
            projectKey={projectKey}
            sprint={sprint}
            readOnly={readOnly}
            items={items.filter((i) => i.kind === kind)}
            names={new Map(people.data.map((p) => [p.id, p.name]))}
            numbers={new Map(issues.data.map((i) => [i.id, i.number]))}
          />
        ))}
      </div>
    </section>
  );
}

function RetroColumn({
  kind,
  projectId,
  projectKey,
  sprint,
  readOnly,
  items,
  names,
  numbers,
}: {
  kind: RetroKind;
  projectId: string;
  projectKey: string;
  sprint: Sprint;
  readOnly: boolean;
  items: ReturnType<typeof retroOf>;
  names: Map<string, string>;
  numbers: Map<string, number>;
}) {
  const actions = useActions(projectId);
  const me = useCurrentUser();
  const role = usePermissions().role;
  const push = useNotices((s) => s.push);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const result = await actions.addRetroItem({ sprintId: sprint.id, kind, text });
    if (result.ok) {
      setText('');
      setError(undefined);
    } else setError(result.errors.text ?? result.errors.form);
  };
  const remove = async (id: string) => {
    const result = await actions.deleteRetroItem(id);
    if (!result.ok) push(Object.values(result.errors).join('. '));
  };
  const toIssue = async (id: string) => {
    const result = await actions.retroToIssue(id);
    if (result.ok) {
      const created = result.changes.issues?.[0];
      push(created ? `Создана задача ${projectKey}-${created.number}` : 'Задача создана');
    } else push(Object.values(result.errors).join('. '));
  };
  const title = RETRO_LABELS[kind];
  const inputLabel = `${title}: новая запись`;

  return (
    <div className="retro-column">
      <h3>{title}</h3>
      <ul className="plain-list">
        {items.map((item) => {
          const number = item.issueId ? numbers.get(item.issueId) : undefined;
          const canDelete =
            !readOnly && (item.authorId === me?.id || role === 'lead' || role === 'admin');
          return (
            <li key={item.id} className="retro-item">
              <p>{item.text}</p>
              <p className="muted small">{names.get(item.authorId) ?? 'Неизвестный'}</p>
              {number !== undefined && (
                <Link to={`/projects/${projectKey}/issues/${number}`} className="issue-key">
                  {projectKey}-{number}
                </Link>
              )}
              {kind === 'action' && !readOnly && item.issueId === null && (
                <button type="button" onClick={() => void toIssue(item.id)}>
                  → в задачу
                </button>
              )}{' '}
              {canDelete && (
                <button
                  type="button"
                  className="plain"
                  aria-label={`Удалить запись: ${item.text}`}
                  onClick={() => void remove(item.id)}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
        {items.length === 0 && <li className="muted">Пока пусто</li>}
      </ul>
      {!readOnly && (
        <form onSubmit={(e) => void add(e)} noValidate>
          <label className="visually-hidden" htmlFor={`retro-${kind}`}>
            {inputLabel}
          </label>
          <input
            id={`retro-${kind}`}
            type="text"
            value={text}
            placeholder="Новая запись"
            aria-invalid={error ? true : undefined}
            onChange={(e) => setText(e.target.value)}
          />{' '}
          <button type="submit">+ Добавить</button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
