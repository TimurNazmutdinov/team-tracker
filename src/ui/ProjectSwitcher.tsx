import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { usePermissions } from '../state/current-user';
import { useProjects } from '../state/queries';

/** Чип проекта в шапке: текущий проект, быстрый выбор другого, «Все проекты…» (wireframes.md, 24.1). */
export function ProjectSwitcher({ current }: { current: string }) {
  const projects = useProjects();
  const perms = usePermissions();
  const location = useLocation();
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

  // на вкладке проекта остаёмся на той же вкладке выбранного проекта
  const section = /^\/projects\/[^/]+\/(backlog|board|sprints|reports|people|settings)/.exec(
    location.pathname,
  )?.[1];
  const target = (key: string) => `/projects/${key}/${section ?? 'backlog'}`;

  return (
    <div className="project-switcher" ref={root}>
      <button
        type="button"
        className="project-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Переключить проект"
        onClick={() => setOpen(!open)}
      >
        {current} ▾
      </button>
      {open && (
        <ul
          className="switcher-pop plain-list"
          role="menu"
          aria-label="Проекты"
          onClick={() => setOpen(false)}
        >
          {(projects.data ?? []).map((p) => (
            <li key={p.id} role="none">
              <Link
                role="menuitem"
                to={target(p.key)}
                aria-current={p.key === current ? 'true' : undefined}
              >
                {p.key === current ? '✓ ' : ''}
                {p.key} · {p.name}
              </Link>
            </li>
          ))}
          <li role="none" className="switcher-sep">
            <Link role="menuitem" to="/projects">
              Все проекты…
            </Link>
          </li>
          {perms.can('project.create') && (
            <li role="none">
              <Link role="menuitem" to="/projects">
                + Новый проект
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
