import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { boardSprints, defaultSprint } from '../../domain/board';
import { peopleRows, sprintSnapshots } from '../../domain/totals';
import { useProjectHistory, useView } from '../../state/queries';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { SERVER_MODE } from '../../app/create-storage';
import { AbsencesSection } from './AbsencesSection';
import { Accounts } from './Accounts';
import { useCurrentProject } from '../projects/ProjectRoute';
import { treeRows } from '../../domain/tree';
import { Avatar, PointsBadge, StatusChip, TypeIcon } from '../tasks/IssueBits';

/** Экран «Люди» (wireframes.md, раздел 11): нагрузка участников в выбранном спринте и их задачи. */
export function PeoplePage() {
  const project = useCurrentProject();
  const view = useView(project.id);
  const history = useProjectHistory(project.id);
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!view || !history.data) {
    return (
      <>
        <PageHeader title="Люди" scope />
        <Loading />
      </>
    );
  }
  const sprints = boardSprints(view.sprints);
  const def = defaultSprint(view.sprints);
  const sprint = view.sprints.find((s) => s.id === params.get('sprint')) ?? def;
  const snaps = sprint ? sprintSnapshots(sprint, view.issues, history.data) : [];
  const rows = peopleRows(snaps, view.people);
  const selected =
    rows.find((r) => r.personId === selectedId) ?? rows.find((r) => r.count > 0) ?? rows[0];
  const tasks = snaps.filter((s) => s.assigneeId === (selected?.personId ?? null));

  return (
    <>
      <PageHeader title="Люди" scope>
        {sprint && (
          <label className="inline-select" title="Спринт, по которому считается нагрузка">
            Спринт
            <select
              value={sprint.id}
              onChange={(e) =>
                setParams(e.target.value === def?.id ? {} : { sprint: e.target.value })
              }
            >
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </PageHeader>
      {!sprint && (
        <p className="empty">В проекте нет спринтов: нагрузка считается по задачам спринта.</p>
      )}
      <table className="totals people" aria-label="Нагрузка участников">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Роль</th>
            <th>Задач</th>
            <th>sp</th>
            <th>Done, sp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const person = view.people.find((p) => p.id === r.personId);
            const isSelected = r.personId === selected?.personId;
            return (
              <tr key={r.personId ?? 'none'} className={isSelected ? 'selected' : undefined}>
                <td>
                  <button
                    type="button"
                    className="plain"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(r.personId)}
                  >
                    <Avatar person={person} /> {r.name}
                  </button>
                </td>
                <td>{person?.role ?? '—'}</td>
                <td>{r.count}</td>
                <td>{r.points}</td>
                <td>{r.done}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected && (
        <section aria-labelledby="person-tasks-title">
          <h2 id="person-tasks-title">Задачи: {selected.name}</h2>
          {tasks.length === 0 && <p className="muted">В этом спринте задач нет.</p>}
          <ul className="plain-list">
            {treeRows(
              tasks.map((x) => x.issue),
              { all: view.issues },
            ).map(({ issue, depth, context }) => {
              const snap = tasks.find((x) => x.issue.id === issue.id);
              return (
                <li
                  key={issue.id}
                  className={`link-row tree-row${context ? ' context' : ''}`}
                  data-depth={depth}
                  style={{ '--depth': depth } as React.CSSProperties}
                >
                  <TypeIcon type={issue.type} />
                  <Link
                    to={`/projects/${project.key}/issues/${issue.number}`}
                    className="issue-key"
                  >
                    {project.key}-{issue.number}
                  </Link>
                  <span className="issue-title">{issue.title}</span>
                  {snap ? (
                    <>
                      <StatusChip status={snap.status} />
                      <PointsBadge points={snap.points} />
                    </>
                  ) : (
                    <span
                      className="muted small"
                      title="Не задача этого человека; показана как родитель"
                    >
                      родитель
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <AbsencesSection view={view} />
      {SERVER_MODE && <Accounts />}
    </>
  );
}
