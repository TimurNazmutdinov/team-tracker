import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import type { FieldErrors } from '../../domain/actions';
import type { Project } from '../../domain/schema';
import { useProjectActions } from '../../state/actions';
import { useNotices } from '../../state/notices';
import { useIssues, useProjects, useSprints } from '../../state/queries';
import { Async } from '../../ui/Async';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { PageHeader } from '../../ui/PageHeader';
import { TextField } from '../../ui/fields';

function ProjectCard({ project }: { project: Project }) {
  const issues = useIssues(project.id);
  const sprints = useSprints(project.id);
  const active = sprints.data?.find((s) => s.state === 'active');
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
      {active && (
        <p className="muted">
          {active.name} идёт до {active.end.split('-').reverse().join('.')}
        </p>
      )}
    </li>
  );
}

/** Форма «Новый проект» (F-01): ключ и название с проверкой. */
function NewProjectForm({ onDone }: { onDone: () => void }) {
  const actions = useProjectActions();
  const navigate = useNavigate();
  const push = useNotices((s) => s.push);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await actions.createProject({ key, name });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    push(`Проект ${key.trim()} создан`);
    onDone();
    void navigate(`/projects/${key.trim()}/backlog`);
  };

  return (
    <form
      className="new-project"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="new-project-title"
    >
      <h2 id="new-project-title">Новый проект</h2>
      <div className="form-row">
        <TextField
          name="key"
          label="Ключ задач"
          required
          value={key}
          onChange={setKey}
          error={errors.key}
        />
        <TextField
          name="name"
          label="Название"
          required
          value={name}
          onChange={setName}
          error={errors.name}
        />
      </div>
      {errors.form && <ErrorMessage message={errors.form} />}
      <button type="submit" className="primary">
        Создать
      </button>{' '}
      <button type="button" onClick={onDone}>
        Отмена
      </button>
    </form>
  );
}

/** Экран «Проекты» (/projects): список проектов и создание нового. */
export function ProjectsPage() {
  const projects = useProjects();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader title="Проекты">
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          + Новый проект
        </button>
      </PageHeader>
      <Async query={projects}>
        {(list) => (
          <ul className="cards">
            {list.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </ul>
        )}
      </Async>
      {creating && <NewProjectForm onDone={() => setCreating(false)} />}
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
