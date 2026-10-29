import { useState } from 'react';
import { Link } from 'react-router';
import { HISTORY_PAGE, closedSprints, totalPoints, type ClosedSprint } from '../../domain/planning';
import type { Issue, IssueType } from '../../domain/schema';
import { ISSUE_TYPES } from '../../domain/schema';
import { useProjectHistory, useView } from '../../state/queries';
import { dateRange, num, shortDate, taskWord } from '../../ui/format';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { useCurrentProject } from '../projects/ProjectRoute';
import { Avatar, PointsBadge, PriorityChip, TypeIcon } from '../tasks/IssueBits';

interface Filters {
  search: string;
  assigneeId: string;
  type: IssueType | '';
}

function SprintBlock({
  item,
  issues,
  projectKey,
  people,
  open,
  onToggle,
}: {
  item: ClosedSprint;
  issues: Issue[];
  projectKey: string;
  people: { id: string; name: string; role: string }[];
  open: boolean;
  onToggle: () => void;
}) {
  const { sprint } = item;
  return (
    <section className="backlog-section" aria-label={sprint.name}>
      <header className="section-head planning-head">
        <div className="section-line">
          <button type="button" className="plain" aria-expanded={open} onClick={onToggle}>
            {open ? '▾' : '▸'} <strong>{sprint.name}</strong>
          </button>
          <span className="chip">закрыт</span>
          <span className="muted">{dateRange(sprint.start, sprint.end)}</span>
          <span className="spacer" />
          <Link to={`/projects/${projectKey}/reports`}>Отчёты спринтов</Link>
        </div>
        <span className="muted">
          {item.done.length} {taskWord(item.done.length)} выполнено · {num(totalPoints(item.done))}{' '}
          sp · velocity {num(item.velocity)} sp
          {sprint.closedAt && ` · закрыт ${shortDate(sprint.closedAt.slice(0, 10))}`}
        </span>
      </header>
      {open && (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.id} className="issue-row closed-row">
              <TypeIcon type={issue.type} />
              <Link to={`/projects/${projectKey}/issues/${issue.number}`} className="issue-key">
                {projectKey}-{issue.number}
              </Link>
              <span className="issue-title">
                <Link to={`/projects/${projectKey}/issues/${issue.number}`}>{issue.title}</Link>
              </span>
              <PriorityChip priority={issue.priority} />
              <PointsBadge points={issue.points} />
              <Avatar person={people.find((p) => p.id === issue.assigneeId)} />
            </li>
          ))}
          {issues.length === 0 && <li className="drop-hint">Нет задач под фильтры</li>}
        </ul>
      )}
    </section>
  );
}

/** Вкладка «Прошлые спринты» (wireframes.md, 17.4а, ADR-014): закрытые спринты, только чтение. */
export function HistoryPage() {
  const project = useCurrentProject();
  const view = useView(project.id);
  const history = useProjectHistory(project.id);
  const [filters, setFilters] = useState<Filters>({ search: '', assigneeId: '', type: '' });
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const [opened, setOpened] = useState<Set<string> | null>(null);

  if (!view || !history.data) {
    return (
      <>
        <PageHeader title="Прошлые спринты" />
        <Loading />
      </>
    );
  }

  const all = closedSprints(view.sprints, view.issues, history.data);
  // По умолчанию раскрыт самый свежий закрытый спринт
  const expanded = opened ?? new Set(all.slice(0, 1).map((c) => c.sprint.id));
  const q = filters.search.trim().toLowerCase();
  const match = (i: Issue) =>
    (q === '' || `${project.key}-${i.number} ${i.title}`.toLowerCase().includes(q)) &&
    (filters.assigneeId === '' || i.assigneeId === filters.assigneeId) &&
    (filters.type === '' || i.type === filters.type);
  const rows = all.map((c) => ({ item: c, issues: c.done.filter(match) }));
  const filtering = q !== '' || filters.assigneeId !== '' || filters.type !== '';
  const visible = rows.filter((r) => !filtering || r.issues.length > 0);
  const shown = visible.slice(0, limit);
  const tasksTotal = visible.reduce((n, r) => n + r.issues.length, 0);
  const pointsTotal = visible.reduce((n, r) => n + totalPoints(r.issues), 0);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpened(next);
  };

  return (
    <>
      <PageHeader title="Прошлые спринты" />
      <p className="muted">История закрытых спринтов: только чтение.</p>
      <div className="board-toolbar planning-filters" role="search" aria-label="Фильтры истории">
        <label>
          Поиск
          <input
            type="search"
            value={filters.search}
            placeholder="Номер или название"
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
        <label>
          Исполнитель
          <select
            value={filters.assigneeId}
            onChange={(e) => setFilters({ ...filters, assigneeId: e.target.value })}
          >
            <option value="">Все</option>
            {view.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Тип
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value as IssueType | '' })}
          >
            <option value="">Все</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <span className="muted" role="status">
          {visible.length} спр. · {tasksTotal} {taskWord(tasksTotal)} · {num(pointsTotal)} sp
        </span>
      </div>
      {all.length === 0 ? (
        <p className="empty">Закрытых спринтов пока нет.</p>
      ) : visible.length === 0 ? (
        <p className="empty">Нет задач, подходящих под фильтры.</p>
      ) : (
        shown.map((r) => (
          <SprintBlock
            key={r.item.sprint.id}
            item={r.item}
            issues={r.issues}
            projectKey={project.key}
            people={view.people}
            open={expanded.has(r.item.sprint.id) || (filtering && r.issues.length > 0)}
            onToggle={() => toggle(r.item.sprint.id)}
          />
        ))
      )}
      {visible.length > limit && (
        <p>
          <button type="button" onClick={() => setLimit(limit + HISTORY_PAGE)}>
            ещё {Math.min(HISTORY_PAGE, visible.length - limit)} ▾
          </button>
        </p>
      )}
      <p>
        <Link to={`/projects/${project.key}/board`}>← К доске</Link>
      </p>
    </>
  );
}
