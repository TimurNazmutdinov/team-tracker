import { Link, useParams } from 'react-router';
import { useSprints } from '../../state/queries';
import { Async } from '../../ui/Async';
import { NotFound } from '../../ui/NotFound';
import { PageHeader } from '../../ui/PageHeader';
import { StageNote } from '../../ui/StageNote';
import { useCurrentProject } from '../projects/ProjectRoute';

const STATE_LABEL = { planned: 'запланирован', active: 'идёт', closed: 'закрыт' } as const;

/** Экран «Спринты»: /projects/:key/sprints и /projects/:key/sprints/:id. */
export function SprintsPage() {
  const project = useCurrentProject();
  const { id } = useParams();
  const sprints = useSprints(project.id);
  return (
    <Async query={sprints}>
      {(list) => {
        const selected = id === undefined ? undefined : list.find((s) => s.id === id);
        if (id !== undefined && !selected) return <NotFound what="Спринт" />;
        return (
          <>
            <PageHeader title={selected ? selected.name : 'Спринты'} />
            {selected && (
              <p>
                {STATE_LABEL[selected.state]} · {selected.start} – {selected.end} · Цель:{' '}
                {selected.goal}
              </p>
            )}
            <ul className="cards">
              {list.map((s) => (
                <li key={s.id} className="card">
                  <h2>
                    <Link to={`/projects/${project.key}/sprints/${s.id}`}>{s.name}</Link>
                  </h2>
                  <p className="muted">{STATE_LABEL[s.state]}</p>
                </li>
              ))}
            </ul>
            <StageNote stage={6} what="состав, итоги, запуск и закрытие спринта" />
          </>
        );
      }}
    </Async>
  );
}
