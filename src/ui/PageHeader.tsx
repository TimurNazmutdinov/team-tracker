import { useEffect, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router';
import { useProjectScope } from '../state/project-scope';
import { useProjects } from '../state/queries';

/** Экраны одного проекта: метка показывает проект из адреса, на остальных — выбранные проекты. */
const SINGLE = /^\/projects\/[^/]+\/(sprints|people|settings|issues)(\/|$)/;
const NO_TAG = /^\/(about|projects\/?$)/;
const MAX_TAGS = 4;

function ProjectTag() {
  const { pathname } = useLocation();
  const { key } = useParams();
  const projects = useProjects();
  const { scope } = useProjectScope();
  if (NO_TAG.test(pathname)) return null;
  const list =
    SINGLE.test(pathname) && key
      ? (projects.data ?? []).filter((p) => p.key === key)
      : scope.projects;
  if (list.length === 0) return null;
  const shown = list.slice(0, MAX_TAGS);
  return (
    <span className="project-tags" title="Проекты на этом экране">
      {shown.map((p) => (
        <span key={p.id} className="chip project-tag" title={p.name}>
          {p.key}
          {list.length === 1 && <span className="project-name"> · {p.name}</span>}
        </span>
      ))}
      {list.length > MAX_TAGS && <span className="muted">+{list.length - MAX_TAGS}</span>}
    </span>
  );
}

/** Заголовок экрана; заодно выставляет заголовок вкладки браузера и показывает метку проекта. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — team-tracker`;
  }, [title]);
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <ProjectTag />
      {children}
    </header>
  );
}
