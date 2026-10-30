import { useState } from 'react';
import { Link } from 'react-router';
import {
  RISK_LABELS,
  projectOverview,
  sortOverviews,
  type PortfolioSort,
  type ProjectOverview,
} from '../../domain/portfolio';
import { STATUSES } from '../../domain/schema';
import { useProjectScope } from '../../state/project-scope';
import { useProjectHistories, useProjectViews } from '../../state/queries';
import { dateRange, num, projectWord } from '../../ui/format';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { ProjectFilter } from '../../ui/ProjectFilter';
import { Avatar } from '../tasks/IssueBits';

const today = () => new Date().toISOString().slice(0, 10);

/** Мини-burndown: остаток по дням (сплошная) и идеальная линия (пунктир). */
function Sparkline({
  remaining,
  ideal,
  label,
}: {
  remaining: number[];
  ideal: number[];
  label: string;
}) {
  const W = 140;
  const H = 48;
  const top = Math.max(...remaining, ...ideal, 1);
  const x = (i: number, n: number) => 6 + (i * (W - 12)) / Math.max(n - 1, 1);
  const y = (v: number) => 6 + (H - 12) * (1 - v / top);
  const points = (values: number[]) =>
    values.map((v, i) => `${x(i, values.length)},${y(v)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      className="spark"
    >
      <polyline points={points(ideal)} className="spark-ideal" />
      <polyline points={points(remaining)} className="spark-real" />
    </svg>
  );
}

function daysText(o: ProjectOverview): string {
  if (o.daysLeft === null) return '';
  if (o.daysLeft < 0) return `спринт закончился ${-o.daysLeft} дн. назад`;
  if (o.daysLeft === 0) return 'последний день';
  return `осталось ${o.daysLeft} дн.`;
}

function OverviewCard({ o, issueKey }: { o: ProjectOverview; issueKey: (n: number) => string }) {
  const key = o.project.key;
  const total = STATUSES.reduce((n, s) => n + o.byStatus[s], 0);
  const risky = o.risks.length > 0;
  const link = (page: string) => `/projects/${key}/${page}?projects=${key}`;
  return (
    <article className={`overview-card${risky ? ' risky' : ''}`} aria-label={`Проект ${key}`}>
      <header className="overview-head">
        <span className="chip project-tag">{key}</span>
        <h2>
          <Link to={link('board')}>{o.project.name}</Link>
        </h2>
        <span className="spacer" />
        {risky && (
          <strong className="risk-text">
            <span aria-hidden="true">⚠ </span>
            {o.risks.map((r) => RISK_LABELS[r]).join(', ')}
          </strong>
        )}
        <Avatar person={o.owner ?? undefined} />
      </header>

      {o.sprint ? (
        <>
          <p className="overview-sprint">
            <strong>
              {o.sprint.name} · {dateRange(o.sprint.start, o.sprint.end)}
            </strong>
            <span className="muted">{daysText(o)}</span>
          </p>
          {o.sprint.goal && <p className="muted small">Цель: {o.sprint.goal}</p>}
          <div className="overview-progress">
            <div>
              <p>
                Выполнено {num(o.done)} из {num(o.scope)} sp · {o.percent} %
              </p>
              <div className="meter" role="img" aria-label={`Выполнено ${o.percent} %`}>
                <span style={{ width: `${o.percent}%` }} />
              </div>
            </div>
            {o.burndown && (
              <Sparkline
                remaining={o.burndown.remaining}
                ideal={o.burndown.ideal}
                label="Burndown спринта: остаток по дням и идеальная линия"
              />
            )}
          </div>
          {total > 0 && (
            <>
              <div className="status-bar" role="img" aria-label="Задачи спринта по статусам">
                {STATUSES.map((s) =>
                  o.byStatus[s] > 0 ? (
                    <span
                      key={s}
                      className={`status-${s.toLowerCase().replace(' ', '-')}`}
                      style={{ flexGrow: o.byStatus[s] }}
                    />
                  ) : null,
                )}
              </div>
              <p className="muted small">
                {STATUSES.filter((s) => o.byStatus[s] > 0)
                  .map((s) => `${s} ${o.byStatus[s]}`)
                  .join(' · ')}
              </p>
            </>
          )}
          {o.fill && o.capacity.value !== null && (
            <div className={`fill fill-${o.fill.level}`}>
              <p>
                Заполнение {num(o.fill.points)} / {num(o.capacity.value)} sp
                {o.fill.percent !== null && ` · ${o.fill.percent} %`}
                {o.fill.level === 'over' && (
                  <strong className="risk-text"> ⚠ перегруз на {num(o.fill.over)} sp</strong>
                )}
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="muted">
          Нет активного спринта. <Link to={link('backlog')}>Открыть планирование</Link>
        </p>
      )}

      <p className="overview-flags">
        <span className={`chip${o.overdue.length > 0 ? ' hot' : ''}`}>
          Просрочено: {o.overdue.length}
        </span>
        <span className={`chip${o.blocked.length > 0 ? ' hot' : ''}`}>
          Заблокировано: {o.blocked.length}
        </span>
      </p>
      {(o.overdue.length > 0 || o.blocked.length > 0) && (
        <ul className="overview-list">
          {o.overdue.slice(0, 3).map((i) => (
            <li key={i.id}>
              <Link to={`/projects/${key}/issues/${i.number}`}>{issueKey(i.number)}</Link> срок{' '}
              {i.dueDate?.slice(8, 10)}.{i.dueDate?.slice(5, 7)}
            </li>
          ))}
          {o.blocked.slice(0, 3).map((b) => (
            <li key={b.issue.id}>
              <Link to={`/projects/${key}/issues/${b.issue.number}`}>
                {issueKey(b.issue.number)}
              </Link>{' '}
              ждёт {b.by.map((i) => issueKey(i.number)).join(', ')}
            </li>
          ))}
        </ul>
      )}

      {o.epics.length > 0 && (
        <ul className="overview-epics" aria-label="Прогресс эпиков">
          {o.epics.slice(0, 3).map(({ epic, progress }) => (
            <li key={epic.id}>
              <Link to={`/projects/${key}/issues/${epic.number}`}>{epic.title}</Link>
              <div className="meter" role="img" aria-label={`${epic.title}: ${progress.percent} %`}>
                <span style={{ width: `${progress.percent}%` }} />
              </div>
              <span className="muted">{progress.percent} %</span>
            </li>
          ))}
        </ul>
      )}

      <footer className="overview-links">
        <Link to={link('board')}>Доска →</Link>
        <Link to={link('backlog')}>Планирование →</Link>
      </footer>
    </article>
  );
}

/** Экран «Портфель» (wireframes.md, 19.2, ADR-016): активные спринты выбранных проектов одним охватом. */
export function PortfolioPage() {
  const { ready, scope, all } = useProjectScope();
  // «Мои» пусты и выбор не делался — показываем все проекты, чтобы экран не был пустым
  const projects = scope.projects.length === 0 && scope.source === 'default' ? all : scope.projects;
  const views = useProjectViews(projects);
  const histories = useProjectHistories(projects);
  const [sort, setSort] = useState<PortfolioSort>('risk');
  const [onlyRisk, setOnlyRisk] = useState(false);

  const header = (
    <PageHeader title="Портфель">
      <ProjectFilter />
    </PageHeader>
  );
  if (!ready || !views || !histories) {
    return (
      <>
        {header}
        <Loading />
      </>
    );
  }

  const now = today();
  const overviews = views.map((view) =>
    projectOverview({
      project: view.project,
      owner: view.people.find((p) => p.id === view.project.ownerId) ?? null,
      sprints: view.sprints,
      issues: view.issues,
      links: view.links,
      history: histories.get(view.projectId) ?? [],
      today: now,
    }),
  );
  const shown = sortOverviews(
    onlyRisk ? overviews.filter((o) => o.risks.length > 0) : overviews,
    sort,
  );
  const atRisk = overviews.filter((o) => o.risks.length > 0).length;

  return (
    <>
      {header}
      <p className="muted">
        Активные спринты проектов: {projects.length}; с риском: {atRisk}. Риск — перегруз ёмкости,
        просроченные задачи, блокировки, закончившийся, но не закрытый спринт.
      </p>
      <div className="board-toolbar" role="group" aria-label="Порядок и фильтр">
        <label title="Порядок карточек: сначала проекты с риском или по названию">
          Сортировка
          <select value={sort} onChange={(e) => setSort(e.target.value as PortfolioSort)}>
            <option value="risk">По риску</option>
            <option value="project">По проекту</option>
          </select>
        </label>
        <label className="check" title="Скрыть проекты без риска">
          <input
            type="checkbox"
            checked={onlyRisk}
            onChange={(e) => setOnlyRisk(e.target.checked)}
          />
          Только с риском
        </label>
        <span className="spacer" />
        <span className="muted" role="status">
          {shown.length} {projectWord(shown.length)}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="empty">
          {projects.length === 0
            ? 'Не выбрано ни одного проекта: выберите проекты в фильтре.'
            : 'Проектов с риском нет.'}
        </p>
      ) : (
        <div className="overview-grid">
          {shown.map((o) => (
            <OverviewCard key={o.project.id} o={o} issueKey={(n) => `${o.project.key}-${n}`} />
          ))}
        </div>
      )}
    </>
  );
}
