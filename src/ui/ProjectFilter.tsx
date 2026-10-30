import { useEffect, useRef, useState } from 'react';
import { MINE, ALL, customPref } from '../domain/projectScope';
import { isParticipant } from '../domain/members';
import { useCurrentUser } from '../state/current-user';
import { useMembers } from '../state/queries';
import { useProjectScope } from '../state/project-scope';

/**
 * Кнопка «Проекты: …» с окном выбора (wireframes.md, 19.1): наборы «Мои / Все / Выбрать» и флажки
 * проектов. Выбор применяется сразу, запоминается для пользователя и попадает в адрес страницы.
 */
export function ProjectFilter() {
  const { scope, all, label, choose, ready } = useProjectScope();
  const members = useMembers();
  const me = useCurrentUser();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!ready || all.length === 0) return null;
  const selected = new Set(scope.projects.map((p) => p.key));
  const mode = scope.pref.mode;
  const toggle = (key: string) => {
    const keys = new Set(selected);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    void choose(customPref([...keys]));
  };

  return (
    <div className="project-filter" ref={root}>
      <button
        type="button"
        className="filter-button"
        aria-haspopup="dialog"
        title="Какие проекты показывать на экране: свои, все или выбранные"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Проекты: {label} ▾
      </button>
      {open && (
        <div className="filter-pop" role="dialog" aria-label="Выбор проектов">
          <fieldset>
            <legend>Набор</legend>
            <label>
              <input
                type="radio"
                name="scope-mode"
                checked={mode === 'mine'}
                onChange={() => void choose(MINE)}
              />
              Мои проекты
            </label>
            <label>
              <input
                type="radio"
                name="scope-mode"
                checked={mode === 'all'}
                onChange={() => void choose(ALL)}
              />
              Все проекты
            </label>
            <label>
              <input
                type="radio"
                name="scope-mode"
                checked={mode === 'custom'}
                onChange={() => void choose(customPref([...selected]))}
              />
              Выбрать
            </label>
          </fieldset>
          <ul className="filter-list">
            {all.map((p) => (
              <li key={p.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(p.key)}
                    onChange={() => toggle(p.key)}
                  />
                  <strong>{p.key}</strong> <span>{p.name}</span>
                  {me && members.data && isParticipant(p, members.data, me.id) && (
                    <span className="chip">мой</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Выбор запоминается для вас и виден в адресе страницы: ?projects=
            {[...selected].join(',') || mode}
          </p>
        </div>
      )}
    </div>
  );
}
