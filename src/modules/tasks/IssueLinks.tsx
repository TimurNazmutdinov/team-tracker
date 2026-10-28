import { useState } from 'react';
import { Link } from 'react-router';
import type { FieldErrors, View } from '../../domain/actions';
import { LINK_TYPES, type Issue, type LinkType } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { SelectField } from '../../ui/fields';
import { StatusChip, TypeIcon } from './IssueBits';

const NAMES: Record<LinkType, [outgoing: string, incoming: string]> = {
  blocks: ['блокирует', 'заблокирована задачей'],
  relates: ['связана с', 'связана с'],
  duplicates: ['дубликат задачи', 'оригинал для'],
};

/** Связи задачи (F-06): blocks, relates, duplicates; предупреждение о блокировке. */
export function IssueLinks({
  issue,
  view,
  projectKey,
}: {
  issue: Issue;
  view: View;
  projectKey: string;
}) {
  const actions = useActions(view.projectId);
  const [type, setType] = useState<LinkType>('blocks');
  const [toId, setToId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const links = view.links.filter((l) => l.fromId === issue.id || l.toId === issue.id);
  const byId = new Map(view.issues.map((i) => [i.id, i]));
  const blockers = links
    .filter((l) => l.type === 'blocks' && l.toId === issue.id)
    .map((l) => byId.get(l.fromId))
    .filter((i): i is Issue => i !== undefined && i.status !== 'Done');

  const add = async () => {
    const result = await actions.addLink(issue.id, toId, type);
    setErrors(result.ok ? {} : result.errors);
    if (result.ok) setToId('');
  };

  return (
    <section aria-labelledby="links-title">
      <h2 id="links-title">Связи</h2>
      {issue.status !== 'Done' && blockers.length > 0 && (
        <p className="warn" role="status">
          Блокируется незавершённой задачей:{' '}
          {blockers.map((b) => `${projectKey}-${b.number}`).join(', ')}.
        </p>
      )}
      {links.length === 0 && <p className="muted">Связей нет</p>}
      <ul className="plain-list">
        {links.map((l) => {
          const outgoing = l.fromId === issue.id;
          const other = byId.get(outgoing ? l.toId : l.fromId);
          if (!other) return null;
          return (
            <li key={l.id} className="link-row">
              <span className="muted">{NAMES[l.type][outgoing ? 0 : 1]}</span>
              <TypeIcon type={other.type} />
              <Link to={`/projects/${projectKey}/issues/${other.number}`} className="issue-key">
                {projectKey}-{other.number}
              </Link>
              <span className="issue-title">{other.title}</span>
              <StatusChip status={other.status} />
              <button
                type="button"
                aria-label={`Удалить связь с ${projectKey}-${other.number}`}
                onClick={() => void actions.removeLink(l.id)}
              >
                Удалить
              </button>
            </li>
          );
        })}
      </ul>
      <div className="link-form">
        <SelectField
          name="linkType"
          label="Тип связи"
          value={type}
          options={LINK_TYPES.map((t) => ({ value: t, label: NAMES[t][0] }))}
          onChange={(v) => setType(v as LinkType)}
          error={errors.type}
        />
        <SelectField
          name="linkTo"
          label="Задача"
          value={toId}
          options={[
            { value: '', label: 'Выберите задачу' },
            ...view.issues
              .filter((i) => i.id !== issue.id)
              .sort((a, b) => a.number - b.number)
              .map((i) => ({ value: i.id, label: `${projectKey}-${i.number} ${i.title}` })),
          ]}
          onChange={setToId}
          error={errors.toId}
        />
        <button type="button" onClick={() => void add()}>
          + Добавить связь
        </button>
      </div>
    </section>
  );
}
