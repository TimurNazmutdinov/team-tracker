import { Link, Navigate } from 'react-router';
import type { Project } from '../../domain/schema';
import { useIssues, useProjects, useSprints } from '../../state/queries';
import { Async } from '../../ui/Async';
import { PageHeader } from '../../ui/PageHeader';
import { StageNote } from '../../ui/StageNote';

function ProjectCard({ project }: { project: Project }) {
  const issues = useIssues(project.id);
  const sprints = useSprints(project.id);
  return (
    <li className="card">
      <h2>
        <Link to={`/projects/${project.key}/backlog`}>{project.name}</Link>
      </h2>
      <p>
        <span className="chip">{project.key}</span>
      </p>
      <p className="muted">
        Задач: {issues.data?.length ?? '…'} · Спринтов: {sprints.data?.length ?? '…'}
      </p>
    </li>
  );
}

/** Экран «Проекты» (/projects): список проектов. */
export function ProjectsPage() {
  const projects = useProjects();
  return (
    <>
      <PageHeader title="Проекты" />
      <Async query={projects}>
        {(list) => (
          <ul className="cards">
            {list.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </ul>
        )}
      </Async>
      <StageNote stage={4} what="создание проекта" />
    </>
  );
}

/** Главная (/): если проект один, сразу открывается его бэклог (ADR-004, п. 6). */
export function HomePage() {
  const projects = useProjects();
  return (
    <Async query={projects}>
      {(list) => {
        const only = list.length === 1 ? list[0] : undefined;
        return only ? <Navigate to={`/projects/${only.key}/backlog`} replace /> : <ProjectsPage />;
      }}
    </Async>
  );
}
