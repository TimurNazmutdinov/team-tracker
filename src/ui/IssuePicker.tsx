import { useId, useState } from 'react';
import type { Issue } from '../domain/schema';
import { scoreIssue } from '../domain/search';
import { TypeIcon } from '../modules/tasks/IssueBits';

/** Выбор задачи поиском по ключу и названию (связи в окне «Создать», D-3). */
export function IssuePicker({
  label,
  issues,
  projectKey,
  value,
  onChange,
}: {
  label: string;
  issues: readonly Issue[];
  projectKey: string;
  value: string;
  onChange: (issueId: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const chosen = issues.find((i) => i.id === value);
  const keyOf = (i: Issue) => `${projectKey}-${i.number}`;

  if (chosen) {
    return (
      <div className="field issue-picker">
        <span className="label">{label}</span>
        <span className="picked">
          <TypeIcon type={chosen.type} /> <strong>{keyOf(chosen)}</strong> {chosen.title}
          <button
            type="button"
            className="plain"
            aria-label={`Выбрать другую задачу вместо ${keyOf(chosen)}`}
            title="Выбрать другую задачу"
            onClick={() => onChange('')}
          >
            ×
          </button>
        </span>
      </div>
    );
  }

  // тот же поиск, что в палитре Ctrl+K: по ключу и словам названия, по основе слова
  const matches = (
    query.trim()
      ? issues
          .map((i) => ({ i, score: scoreIssue(i, keyOf(i), query) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || b.i.number - a.i.number)
          .map((x) => x.i)
      : issues
  ).slice(0, 8);

  return (
    <div className="field issue-picker">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={query}
        placeholder="Ключ или название задачи"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="suggest-list" aria-label="Найденные задачи">
          {matches.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(i.id);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <TypeIcon type={i.type} /> <strong>{keyOf(i)}</strong> {i.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
