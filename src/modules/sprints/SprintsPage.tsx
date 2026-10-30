import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { boardSprints, defaultSprint } from '../../domain/board';
import type { View } from '../../domain/actions';
import { STATUSES, type Sprint, type Status } from '../../domain/schema';
import { sprintSnapshots, summarize } from '../../domain/totals';
import { useActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { useProjectHistory, useView } from '../../state/queries';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { Loading } from '../../ui/Loading';
import { NotFound } from '../../ui/NotFound';
import { PageHeader } from '../../ui/PageHeader';
import { TextArea } from '../../ui/fields';
import { useCurrentProject } from '../projects/ProjectRoute';
import { TotalsTable } from '../reports/TotalsTable';
import { Avatar, PointsBadge, StatusChip, TypeIcon } from '../tasks/IssueBits';
import { RetroSection } from './RetroSection';
import { CloseSprintDialog } from './CloseSprintDialog';
import { SprintFormDialog } from './SprintFormDialog';

const STATE_LABEL = { planned: 'запланирован', active: 'идёт', closed: 'закрыт' } as const;
const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const fmtFull = (d: string) => `${fmt(d)}.${d.slice(0, 4)}`;

type DialogKind = 'create' | 'edit' | 'close' | null;

/** Экран «Спринты»: /projects/:key/sprints и /projects/:key/sprints/:id (wireframes.md, раздел 6). */
export function SprintsPage() {
  const project = useCurrentProject();
  const { id } = useParams();
  const navigate = useNavigate();
  const view = useView(project.id);
  const history = useProjectHistory(project.id);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const canManage = usePermissions().can('sprint.manage');

  if (!view || !history.data) {
    return (
      <>
        <PageHeader title="Спринты" />
        <Loading />
      </>
    );
  }
  const sprints = boardSprints(view.sprints);
  const selected = id === undefined ? undefined : view.sprints.find((s) => s.id === id);
  if (id === undefined) {
    const def = defaultSprint(view.sprints);
    if (def) return <Navigate to={`/projects/${project.key}/sprints/${def.id}`} replace />;
  } else if (!selected) {
    return <NotFound what="Спринт" />;
  }

  return (
    <>
      <PageHeader title="Спринты" />
      <div className="sprints-layout">
        <nav className="sprint-list" aria-label="Спринты проекта">
          {sprints.map((s) => (
            <Link
              key={s.id}
              to={`/projects/${project.key}/sprints/${s.id}`}
              className={`sprint-card${s.id === selected?.id ? ' selected' : ''}`}
              aria-current={s.id === selected?.id ? 'page' : undefined}
            >
              <strong>{s.name}</strong>
              <span className={`chip state-${s.state}`}>{STATE_LABEL[s.state]}</span>
              <span className="muted">
                {fmt(s.start)} – {fmt(s.end)}
              </span>
            </Link>
          ))}
          {sprints.length === 0 && <p className="muted">Спринтов пока нет</p>}
          {canManage && (
            <button
              type="button"
              title="Создать спринт с настройками проекта по умолчанию"
              onClick={() => setDialog('create')}
            >
              + Новый спринт
            </button>
          )}
        </nav>
        {selected ? (
          <SprintDetail
            key={selected.id}
            view={view}
            sprint={selected}
            history={history.data}
            projectKey={project.key}
            onDialog={setDialog}
          />
        ) : (
          <div className="empty">
            <p>
              В проекте нет спринтов. Создайте первый: название, даты и длительность подставятся из
              настроек проекта.
            </p>
          </div>
        )}
      </div>
      {dialog === 'create' && (
        <SprintFormDialog
          view={view}
          onClose={() => setDialog(null)}
          onSaved={(sprintId) => void navigate(`/projects/${project.key}/sprints/${sprintId}`)}
        />
      )}
      {dialog === 'edit' && selected && (
        <SprintFormDialog view={view} sprint={selected} onClose={() => setDialog(null)} />
      )}
      {dialog === 'close' && selected && (
        <CloseSprintDialog
          view={view}
          sprint={selected}
          projectKey={project.key}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function SprintDetail({
  view,
  sprint,
  history,
  projectKey,
  onDialog,
}: {
  view: View;
  sprint: Sprint;
  history: Parameters<typeof sprintSnapshots>[2];
  projectKey: string;
  onDialog: (d: DialogKind) => void;
}) {
  const actions = useActions(view.projectId);
  const canManage = usePermissions().can('sprint.manage');
  const push = useNotices((s) => s.push);
  const [error, setError] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goal, setGoal] = useState(sprint.goal);
  const [goalError, setGoalError] = useState<string | undefined>();
  const snaps = sprintSnapshots(sprint, view.issues, history);
  const summary = summarize(snaps, view.people);
  const readOnly = sprint.state === 'closed';
  const total = summary.total.points;

  const start = async () => {
    const result = await actions.startSprint(sprint.id);
    if (result.ok) {
      setError(null);
      push(`Спринт «${sprint.name}» запущен`);
    } else setError(Object.values(result.errors).join('. '));
  };

  const saveGoal = async () => {
    const result = await actions.updateSprint(sprint.id, { goal });
    if (result.ok) {
      setEditingGoal(false);
      setGoalError(undefined);
    } else setGoalError(result.errors.goal ?? result.errors.form);
  };

  return (
    <section className="sprint-detail" aria-label={sprint.name}>
      <header className="sprint-head">
        <h2>{sprint.name}</h2>
        <span className={`chip state-${sprint.state}`}>{STATE_LABEL[sprint.state]}</span>
        <span className="spacer" />
        <Link
          className="button"
          title="Итоги спринта на одной странице: Excel и печать"
          to={`/projects/${projectKey}/sprints/${sprint.id}/report`}
        >
          Отчёт спринта →
        </Link>
        {!readOnly && canManage && (
          <button
            type="button"
            title="Изменить название, даты и цель спринта"
            onClick={() => onDialog('edit')}
          >
            Изменить
          </button>
        )}
        {canManage && sprint.state === 'planned' && (
          <button
            type="button"
            className="primary"
            title="Начать спринт: задачи появятся на доске"
            onClick={() => void start()}
          >
            Запустить спринт
          </button>
        )}
        {canManage && sprint.state === 'active' && (
          <button
            type="button"
            className="primary"
            title="Закрыть спринт: выбрать, куда перенести незавершённые задачи"
            onClick={() => onDialog('close')}
          >
            Закрыть спринт
          </button>
        )}
      </header>
      {error && <ErrorMessage message={error} />}
      <p className="muted">
        {fmtFull(sprint.start)} – {fmtFull(sprint.end)}
        {sprint.closedAt && (
          <>
            {' '}
            · закрыт{' '}
            {new Date(sprint.closedAt).toLocaleString('ru-RU', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </>
        )}
      </p>
      {editingGoal ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveGoal();
          }}
        >
          <TextArea
            name="goal"
            label="Цель"
            rows={2}
            value={goal}
            onChange={setGoal}
            error={goalError}
          />
          <button type="submit" className="primary">
            Сохранить
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setEditingGoal(false);
              setGoal(sprint.goal);
              setGoalError(undefined);
            }}
          >
            Отмена
          </button>
        </form>
      ) : (
        <p>
          Цель: {sprint.goal || <span className="muted">не задана</span>}{' '}
          {!readOnly && canManage && (
            <button
              type="button"
              className="plain"
              aria-label="Изменить цель"
              onClick={() => setEditingGoal(true)}
            >
              ✎
            </button>
          )}
        </p>
      )}
      {readOnly && (
        <p className="warn" role="status">
          Спринт закрыт: состав и итоги заморожены на момент закрытия.
        </p>
      )}

      <h3>
        Прогресс: {summary.total.done} из {total} sp в Done
      </h3>
      {total === 0 ? (
        <p className="muted">В спринте нет задач с оценкой.</p>
      ) : (
        <div
          className="progress-bar"
          role="img"
          aria-label={`Story points по статусам: ${STATUSES.map((s) => `${s} ${summary.byStatus[s]}`).join(', ')}`}
        >
          {(['Done', 'Review', 'In Progress', 'To Do', 'Backlog'] as Status[])
            .filter((s) => summary.byStatus[s] > 0)
            .map((s) => (
              <span
                key={s}
                className={`seg status-${s.toLowerCase().replace(' ', '-')}`}
                style={{ width: `${(summary.byStatus[s] / total) * 100}%` }}
                title={`${s}: ${summary.byStatus[s]} sp`}
              >
                {(summary.byStatus[s] / total) * 100 > 12 ? `${s} ${summary.byStatus[s]}` : ''}
              </span>
            ))}
        </div>
      )}

      <h3>Итоги по людям</h3>
      <TotalsTable summary={summary} people={view.people} />

      <h3>Ретроспектива</h3>
      <RetroSection projectId={view.projectId} projectKey={projectKey} sprint={sprint} />

      <h3>Состав спринта</h3>
      <ul className="plain-list">
        {snaps.map((s) => (
          <li key={s.issue.id} className="link-row">
            <TypeIcon type={s.issue.type} />
            <Link to={`/projects/${projectKey}/issues/${s.issue.number}`} className="issue-key">
              {projectKey}-{s.issue.number}
            </Link>
            <span className="issue-title">{s.issue.title}</span>
            <StatusChip status={s.status} />
            <PointsBadge points={s.points} />
            <Avatar person={view.people.find((p) => p.id === s.assigneeId)} />
          </li>
        ))}
        {snaps.length === 0 && (
          <li className="muted">В спринте нет задач. Добавьте их в бэклоге.</li>
        )}
      </ul>
    </section>
  );
}
