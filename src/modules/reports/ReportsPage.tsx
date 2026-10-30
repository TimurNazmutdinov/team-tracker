import { Link, useSearchParams } from 'react-router';
import type { Project } from '../../domain/schema';
import { boardSprints } from '../../domain/board';
import { burndown, velocity } from '../../domain/reports';
import { sprintSnapshots, summarize } from '../../domain/totals';
import { useProjectScope } from '../../state/project-scope';
import {
  useProjectHistories,
  useProjectHistory,
  useProjectViews,
  useView,
} from '../../state/queries';
import { ProjectFilter } from '../../ui/ProjectFilter';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { BurndownChart, VelocityChart } from './charts';
import { TotalsTable } from './TotalsTable';

const today = () => new Date().toISOString().slice(0, 10);

/** Отчёты одного проекта (wireframes.md, раздел 10): burndown, velocity, итоги по людям. */
function SingleReport({ project }: { project: Project }) {
  const view = useView(project.id);
  const history = useProjectHistory(project.id);
  const [params, setParams] = useSearchParams();

  if (!view || !history.data) {
    return (
      <>
        <PageHeader title="Отчёты" />
        <Loading />
      </>
    );
  }
  // отчёты строятся по идущим и закрытым спринтам: у запланированного данных ещё нет
  const sprints = boardSprints(view.sprints).filter((s) => s.state !== 'planned');
  const requested = params.get('sprint');
  const sprint = sprints.find((s) => s.id === requested) ?? sprints[0];
  const velocityReport = velocity(view.sprints, view.issues, history.data);

  return (
    <>
      <PageHeader title="Отчёты">
        <ProjectFilter />
        {sprints.length > 0 && (
          <label className="inline-select" title="Спринт для burndown и итогов">
            Спринт
            <select
              value={sprint?.id ?? ''}
              onChange={(e) =>
                setParams((prev) => {
                  const next = new URLSearchParams(prev);
                  if (e.target.value === sprints[0]?.id) next.delete('sprint');
                  else next.set('sprint', e.target.value);
                  return next;
                })
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
      {!sprint ? (
        <p className="empty">Отчёты появятся, когда будет запущен первый спринт.</p>
      ) : (
        <ReportBody
          view={view}
          history={history.data}
          sprint={sprint}
          velocityReport={velocityReport}
        />
      )}
    </>
  );
}

function ReportBody({
  view,
  history,
  sprint,
  velocityReport,
}: {
  view: NonNullable<ReturnType<typeof useView>>;
  history: Parameters<typeof sprintSnapshots>[2];
  sprint: Parameters<typeof sprintSnapshots>[0];
  velocityReport: ReturnType<typeof velocity>;
}) {
  const days = burndown(sprint, view.issues, history, today());
  const summary = summarize(sprintSnapshots(sprint, view.issues, history), view.people);
  const hasPoints = days.some((d) => (d.scope ?? 0) > 0);
  return (
    <>
      <div className="reports-grid">
        <section aria-labelledby="burndown-title">
          <h2 id="burndown-title">Burndown: остаток sp по дням</h2>
          {hasPoints ? (
            <BurndownChart days={days} />
          ) : (
            <p className="muted">В спринте нет задач с оценкой: график построить не из чего.</p>
          )}
          <p className="muted small">
            Календарные дни. Состав спринта на каждый день восстанавливается по истории, поэтому
            добавление и удаление задач видно на графике. У закрытого спринта отчёт заморожен на
            момент закрытия.
          </p>
        </section>
        <section aria-labelledby="velocity-title">
          <h2 id="velocity-title">Velocity: sp в Done по спринтам</h2>
          {velocityReport.bars.length > 0 ? (
            <VelocityChart report={velocityReport} />
          ) : (
            <p className="muted">
              Пока нет закрытых спринтов: velocity появится после первого закрытия.
            </p>
          )}
          {velocityReport.average === null && velocityReport.bars.length > 0 && (
            <p className="muted small">Среднее появится после первого закрытого спринта.</p>
          )}
        </section>
      </div>
      <section aria-labelledby="totals-title">
        <h2 id="totals-title">Итоги по людям — {sprint.name}</h2>
        <TotalsTable summary={summary} people={view.people} />
      </section>
    </>
  );
}

/** Отчёты нескольких проектов: velocity по каждому; burndown и итоги — когда выбран один проект. */
function MultiReports({ projects }: { projects: Project[] }) {
  const views = useProjectViews(projects);
  const histories = useProjectHistories(projects);
  if (!views || !histories) {
    return (
      <>
        <PageHeader title="Отчёты">
          <ProjectFilter />
        </PageHeader>
        <Loading />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Отчёты">
        <ProjectFilter />
      </PageHeader>
      <p className="muted">
        Выбрано проектов: {projects.length}. Burndown и итоги по людям строятся для одного проекта:
        откройте отчёт проекта по ссылке.
      </p>
      {views.map((view) => {
        const report = velocity(view.sprints, view.issues, histories.get(view.projectId) ?? []);
        return (
          <section
            key={view.projectId}
            aria-label={`Velocity ${view.project.key}`}
            className="about-block"
          >
            <h2>
              <span className="chip project-tag">{view.project.key}</span>{' '}
              <Link to={`/projects/${view.project.key}/reports?projects=${view.project.key}`}>
                {view.project.name}
              </Link>
            </h2>
            {report.bars.length > 0 ? (
              <>
                <VelocityChart report={report} />
                <p className="muted small">
                  {report.average === null
                    ? 'Среднее появится после первого закрытого спринта.'
                    : `Среднее velocity закрытых спринтов: ${String(report.average).replace('.', ',')} sp.`}
                </p>
              </>
            ) : (
              <p className="muted">Пока нет спринтов с данными для velocity.</p>
            )}
          </section>
        );
      })}
    </>
  );
}

/** Экран «Отчёты»: один выбранный проект — подробные отчёты, несколько — velocity по проектам. */
export function ReportsPage() {
  const { ready, scope } = useProjectScope();
  if (!ready) {
    return (
      <>
        <PageHeader title="Отчёты" />
        <Loading />
      </>
    );
  }
  const [only] = scope.projects;
  if (only && scope.projects.length === 1) return <SingleReport key={only.id} project={only} />;
  if (scope.projects.length === 0) {
    return (
      <>
        <PageHeader title="Отчёты">
          <ProjectFilter />
        </PageHeader>
        <p className="empty">Не выбрано ни одного проекта: выберите проекты в фильтре.</p>
      </>
    );
  }
  return <MultiReports projects={scope.projects} />;
}
