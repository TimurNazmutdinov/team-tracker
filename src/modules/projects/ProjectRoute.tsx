import { Outlet, useOutletContext, useParams } from 'react-router';
import type { Project } from '../../domain/schema';
import { useProject } from '../../state/queries';
import { Async } from '../../ui/Async';
import { NotFound } from '../../ui/NotFound';

/** Загружает проект из адреса (/projects/:key/…) и отдаёт его вложенным экранам. */
export function ProjectRoute() {
  const { key = '' } = useParams();
  const query = useProject(key);
  return (
    <Async query={query}>
      {(project) => (project ? <Outlet context={project} /> : <NotFound what="Проект" />)}
    </Async>
  );
}

export function useCurrentProject(): Project {
  return useOutletContext<Project>();
}
