import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { View } from '../../domain/actions';
import {
  BOARD_COLUMNS,
  NO_BOARD_FILTERS,
  boardCards,
  columnStats,
  filterCards,
  hiddenBacklogCards,
  statsOf,
  type BoardColumn,
  type BoardFilters,
  type Lane,
} from '../../domain/board';
import {
  ISSUE_TYPES,
  PRIORITIES,
  type Issue,
  type IssueType,
  type Priority,
  type Project,
  type Sprint,
  type Status,
} from '../../domain/schema';
import { wipOverflows } from '../../domain/wip';
import { useActionsFor } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { useProjectViews } from '../../state/queries';
import { dateRange, num } from '../../ui/format';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { BoardNav } from './BoardNav';
import { BoardCard, LaneView, plural } from './BoardParts';

interface ProjectLane {
  view: View;
  sprint: Sprint | null;
  lane: Lane;
  hidden: Issue[];
}

/** Активный спринт проекта (на доске нескольких проектов выбор спринта не предлагается). */
const activeSprint = (sprints: Sprint[]) => sprints.find((s) => s.state === 'active') ?? null;

/**
 * Доска нескольких проектов (wireframes.md, 19.1): общие колонки статусов, у каждого проекта своя
 * дорожка с его активным спринтом, на карточке — метка проекта. Карточка переносится только по
 * колонкам своего проекта.
 */
export function MultiBoard({
  projects,
  routeKey,
  filter,
}: {
  projects: Project[];
  routeKey: string;
  filter: ReactNode;
}) {
  const views = useProjectViews(projects);
  const actionsFor = useActionsFor();
  const perms = usePermissions();
  const push = useNotices((s) => s.push);
  const [filters, setFilters] = useState<BoardFilters>(NO_BOARD_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (!views) {
    return (
      <>
        <PageHeader title="Доска" />
        <Loading />
      </>
    );
  }

  const lanes: ProjectLane[] = views.map((view) => {
    const sprint = activeSprint(view.sprints);
    const all = sprint ? boardCards(view.issues, sprint.id) : [];
    return {
      view,
      sprint,
      lane: { key: view.projectId, title: view.project.key, issues: filterCards(all, filters) },
      hidden: sprint ? hiddenBacklogCards(view.issues, sprint.id) : [],
    };
  });
  const allCards = lanes.flatMap((l) => l.lane.issues);
  const stats = columnStats(allCards);
  const issueOf = (id: string) => lanes.flatMap((l) => l.lane.issues).find((i) => i.id === id);
  const keyOf = (view: View, issue: Issue | undefined) =>
    issue ? `${view.project.key}-${issue.number}` : null;
  const activeIssue = activeId ? issueOf(activeId) : undefined;

  const changeStatus = async (projectId: string, issueId: string, status: Status) => {
    const result = await actionsFor(projectId).updateIssue(issueId, { status });
    if (!result.ok) push(Object.values(result.errors).join('. '));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const [, projectId, column] = String(e.over.id).split(':') as [string, string, BoardColumn];
    const issueId = String(e.active.id);
    const own = lanes.find((l) => l.lane.issues.some((i) => i.id === issueId));
    if (!own) return;
    if (own.view.projectId !== projectId) {
      push('Карточку можно переносить только по колонкам своего проекта.');
      return;
    }
    const issue = own.lane.issues.find((i) => i.id === issueId);
    if (issue && issue.status !== column) void changeStatus(projectId, issueId, column);
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader title="Доска" />
      <BoardNav projectKey={routeKey} projectCount={projects.length} />
      <div className="board-toolbar">
        {filter}
        <label>
          Группировка
          <select disabled value="project" aria-describedby="multi-group-hint">
            <option value="project">По проектам</option>
          </select>
        </label>
        <label>
          Тип
          <select
            value={filters.type ?? ''}
            onChange={(e) =>
              setFilters({
                ...filters,
                type: e.target.value === '' ? null : (e.target.value as IssueType),
              })
            }
          >
            <option value="">Все</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Приоритет
          <select
            value={filters.priority ?? ''}
            onChange={(e) =>
              setFilters({
                ...filters,
                priority: e.target.value === '' ? null : (e.target.value as Priority),
              })
            }
          >
            <option value="">Все</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button
          type="button"
          onClick={() =>
            setCollapsed(
              collapsed.size === lanes.length ? new Set() : new Set(lanes.map((l) => l.lane.key)),
            )
          }
        >
          {collapsed.size === lanes.length ? 'Развернуть дорожки' : 'Свернуть дорожки'}
        </button>
      </div>
      <p id="multi-group-hint" className="muted small">
        При нескольких проектах доска сгруппирована по проектам: у каждого свой активный спринт.
      </p>

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="board" role="group" aria-label="Доска нескольких проектов">
          <div className="board-columns">
            {BOARD_COLUMNS.map((c) => (
              <div key={c} className={`col-head status-${c.toLowerCase().replace(' ', '-')}`}>
                <strong>{c}</strong>
                <span className="muted">
                  {stats[c].count} · {stats[c].points} sp
                </span>
              </div>
            ))}
          </div>
          {lanes.map(({ view, sprint, lane, hidden }, index) => {
            const total = statsOf(lane.issues);
            const over = wipOverflows(
              view.project,
              Object.fromEntries(
                BOARD_COLUMNS.map((c) => [c, lane.issues.filter((i) => i.status === c).length]),
              ),
            );
            return (
              <div key={lane.key}>
                <LaneView
                  lane={lane}
                  first={index === 0}
                  collapsed={collapsed.has(lane.key)}
                  onToggle={() => toggle(lane.key)}
                  person={undefined}
                  heading={
                    <>
                      <span className="chip project-tag">{view.project.key}</span>
                      <Link to={`/projects/${view.project.key}/board?projects=${view.project.key}`}>
                        <strong>{view.project.name}</strong>
                      </Link>
                      <span className="muted">
                        {sprint
                          ? `${sprint.name} · ${dateRange(sprint.start, sprint.end)}`
                          : 'нет активного спринта'}
                      </span>
                    </>
                  }
                  meta={`${total.count} ${plural(total.count)} · ${num(total.points)} sp${over.map((o) => ` · ⚠ WIP ${o.column}: ${o.count} из ${o.limit}`).join('')}`}
                  renderCard={(issue) => (
                    <BoardCard
                      key={issue.id}
                      issue={issue}
                      projectKey={view.project.key}
                      parentKey={keyOf(
                        view,
                        view.issues.find((i) => i.id === issue.parentId),
                      )}
                      readOnly={!perms.canChangeStatus(issue)}
                      showProject
                      onStatus={(id, status) => void changeStatus(view.projectId, id, status)}
                    />
                  )}
                />
                {hidden.length > 0 && (
                  <p className="warn" role="status">
                    {view.project.key}: {hidden.length} {plural(hidden.length)} в статусе Backlog на
                    доске не показываются.{' '}
                    <button
                      type="button"
                      onClick={() =>
                        void Promise.all(
                          hidden.map((i) => changeStatus(view.projectId, i.id, 'To Do')),
                        )
                      }
                    >
                      Перевести в To Do
                    </button>
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <DragOverlay>
          {activeIssue ? (
            <div className="board-card overlay">
              <strong>{activeIssue.title}</strong>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {allCards.length === 0 && (
        <p className="empty">В активных спринтах выбранных проектов нет задач на доске.</p>
      )}
    </>
  );
}
