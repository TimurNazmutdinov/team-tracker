/* eslint-disable react-hooks/refs -- правило ошибочно срабатывает на ссылки и атрибуты dnd-kit (useDraggable) */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  BOARD_COLUMNS,
  GROUP_FIELDS,
  GROUP_LABELS,
  NO_BOARD_FILTERS,
  boardCards,
  boardSprints,
  columnStats,
  defaultSprint,
  filterCards,
  groupLanes,
  hiddenBacklogCards,
  isGroupField,
  statsOf,
  type BoardColumn,
  type BoardFilters,
  type Lane,
} from '../../domain/board';
import {
  ISSUE_TYPES,
  PRIORITIES,
  STATUSES,
  type Issue,
  type IssueType,
  type Person,
  type Priority,
  type Status,
} from '../../domain/schema';
import { useActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { useBoardPrefs } from '../../state/board-prefs';
import { useNotices } from '../../state/notices';
import { useView } from '../../state/queries';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { useCurrentProject } from '../projects/ProjectRoute';
import { Avatar, PointsBadge, PriorityChip, TypeIcon } from '../tasks/IssueBits';

const cellId = (laneKey: string, column: BoardColumn) => `cell:${laneKey}:${column}`;

interface CardProps {
  issue: Issue;
  projectKey: string;
  parentKey: string | null;
  readOnly: boolean;
  onStatus: (issueId: string, status: Status) => void;
}

function BoardCard({ issue, projectKey, parentKey, readOnly, onStatus }: CardProps) {
  const drag = useDraggable({ id: issue.id, disabled: readOnly });
  const key = `${projectKey}-${issue.number}`;
  return (
    <article
      ref={drag.setNodeRef}
      className={`board-card${drag.isDragging ? ' dragging' : ''}`}
      aria-label={`${key} ${issue.title}`}
    >
      <header>
        {!readOnly && (
          <button
            type="button"
            className="handle"
            aria-label={`Перетащить ${key}`}
            ref={drag.setActivatorNodeRef}
            {...drag.attributes}
            {...drag.listeners}
          >
            ⋮⋮
          </button>
        )}
        <TypeIcon type={issue.type} />
        <Link to={`/projects/${projectKey}/issues/${issue.number}`} className="issue-key">
          {key}
        </Link>
        {issue.type === 'Sub-task' && parentKey && (
          <Link
            className="chip"
            to={`/projects/${projectKey}/issues/${parentKey.split('-')[1] ?? ''}`}
            title="Родитель"
          >
            ↑ {parentKey}
          </Link>
        )}
        <span className="spacer" />
        <PointsBadge points={issue.points} />
      </header>
      <p className="card-title">{issue.title}</p>
      <footer>
        <PriorityChip priority={issue.priority} />
        <select
          className="status-select"
          aria-label={`Статус ${key}`}
          value={issue.status}
          disabled={readOnly}
          onChange={(e) => onStatus(issue.id, e.target.value as Status)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </footer>
    </article>
  );
}

function Cell({
  laneKey,
  column,
  children,
  hint,
}: {
  laneKey: string;
  column: BoardColumn;
  children: ReactNode;
  hint?: boolean;
}) {
  const drop = useDroppable({ id: cellId(laneKey, column) });
  return (
    <div ref={drop.setNodeRef} className={`board-cell${drop.isOver ? ' over' : ''}`}>
      {children}
      {hint && <p className="drop-hint plain">Перетащите сюда</p>}
    </div>
  );
}

const plural = (n: number) =>
  n % 10 === 1 && n % 100 !== 11
    ? 'задача'
    : 2 <= n % 10 && n % 10 <= 4 && !(12 <= n % 100 && n % 100 <= 14)
      ? 'задачи'
      : 'задач';

/** Экран «Доска» (wireframes.md, раздел 5): колонки статусов, группировка по полю, перенос карточек. */
export function BoardPage() {
  const project = useCurrentProject();
  const view = useView(project.id);
  const actions = useActions(project.id);
  const push = useNotices((s) => s.push);
  const groupBy = useBoardPrefs((s) => s.groupBy);
  const setGroupBy = useBoardPrefs((s) => s.setGroupBy);
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<BoardFilters>(NO_BOARD_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const perms = usePermissions();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (!view) {
    return (
      <>
        <PageHeader title="Доска" />
        <Loading />
      </>
    );
  }

  const sprints = boardSprints(view.sprints);
  const requested = params.get('sprint');
  const sprint = view.sprints.find((s) => s.id === requested) ?? defaultSprint(view.sprints);
  if (!sprint) {
    return (
      <>
        <PageHeader title="Доска" />
        <p className="empty">В проекте нет спринтов. Спринты появятся на этапе 6.</p>
      </>
    );
  }

  const readOnly = sprint.state === 'closed';
  const all = boardCards(view.issues, sprint.id);
  const cards = filterCards(all, filters);
  const hidden = hiddenBacklogCards(view.issues, sprint.id);
  const lanes = groupLanes(cards, groupBy, {
    people: view.people,
    issues: view.issues,
    projectKey: project.key,
  });
  const stats = columnStats(cards);
  const issueKey = (id: string | null) => {
    const found = view.issues.find((i) => i.id === id);
    return found ? `${project.key}-${found.number}` : null;
  };
  const people = new Map<string, Person>(view.people.map((p) => [p.id, p]));
  const activeIssue = view.issues.find((i) => i.id === activeId);

  const changeStatus = async (issueId: string, status: Status) => {
    const result = await actions.updateIssue(issueId, { status });
    if (!result.ok) push(Object.values(result.errors).join('. '));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const [, laneKey, column] = String(e.over.id).split(':') as [string, string, BoardColumn];
    const issueId = String(e.active.id);
    const own = lanes.find((l) => l.issues.some((i) => i.id === issueId));
    if (!own) return;
    if (own.key !== laneKey) {
      push('Карточку можно переносить только по колонкам своей группы.');
      return;
    }
    const issue = view.issues.find((i) => i.id === issueId);
    if (issue && issue.status !== column) void changeStatus(issueId, column);
  };

  const moveHiddenToTodo = async () => {
    for (const issue of hidden) await changeStatus(issue.id, 'To Do');
  };

  const toggleLane = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allCollapsed = lanes.length > 0 && lanes.every((l) => collapsed.has(l.key));

  return (
    <>
      <PageHeader title="Доска" />
      <div className="board-toolbar">
        <label>
          Спринт
          <select
            value={sprint.id}
            onChange={(e) =>
              setParams(
                e.target.value === defaultSprint(view.sprints)?.id
                  ? {}
                  : { sprint: e.target.value },
              )
            }
          >
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Группировать по
          <select
            value={groupBy}
            onChange={(e) => isGroupField(e.target.value) && setGroupBy(e.target.value)}
          >
            {GROUP_FIELDS.map((f) => (
              <option key={f} value={f}>
                {GROUP_LABELS[f]}
              </option>
            ))}
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
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(lanes.map((l) => l.key)))}
        >
          {allCollapsed ? 'Развернуть группы' : 'Свернуть группы'}
        </button>
      </div>

      {readOnly && (
        <p className="warn" role="status">
          Спринт закрыт: доска только для чтения.
        </p>
      )}
      {hidden.length > 0 && !readOnly && (
        <p className="warn" role="status">
          В спринте {hidden.length} {plural(hidden.length)} в статусе Backlog — на доске такие
          задачи не показываются:{' '}
          {hidden.map((i, n) => (
            <span key={i.id}>
              {n > 0 && ', '}
              <Link to={`/projects/${project.key}/issues/${i.number}`}>
                {project.key}-{i.number}
              </Link>
            </span>
          ))}
          .{' '}
          <button type="button" onClick={() => void moveHiddenToTodo()}>
            Перевести в To Do
          </button>
        </p>
      )}

      {cards.length === 0 ? (
        <p className="empty">
          {all.length === 0
            ? 'В спринте нет задач на доске.'
            : 'Нет задач, подходящих под фильтры.'}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="board" role="group" aria-label={`Доска ${sprint.name}`}>
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
            {lanes.map((lane, index) => (
              <LaneView
                key={lane.key}
                lane={lane}
                first={index === 0}
                collapsed={collapsed.has(lane.key)}
                onToggle={() => toggleLane(lane.key)}
                renderCard={(issue) => (
                  <BoardCard
                    key={issue.id}
                    issue={issue}
                    projectKey={project.key}
                    parentKey={issueKey(issue.parentId)}
                    readOnly={readOnly || !perms.canChangeStatus(issue)}
                    onStatus={(id, status) => void changeStatus(id, status)}
                  />
                )}
                person={lane.person ?? people.get(lane.key)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeIssue ? (
              <div className="board-card overlay">
                <strong>
                  {project.key}-{activeIssue.number}
                </strong>{' '}
                {activeIssue.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <p className="muted small">
        Колонка Backlog на доске не показывается. Карточки переносятся за ручку ⋮⋮ или выбором
        статуса; допустим любой переход, смена пишется в историю.
      </p>
    </>
  );
}

function LaneView({
  lane,
  first,
  collapsed,
  onToggle,
  renderCard,
  person,
}: {
  lane: Lane;
  first: boolean;
  collapsed: boolean;
  onToggle: () => void;
  renderCard: (issue: Issue) => ReactNode;
  person: Person | undefined;
}) {
  const total = statsOf(lane.issues);
  return (
    <section className="lane" aria-label={lane.title}>
      <header className="lane-head">
        <button type="button" className="plain" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? '▸' : '▾'}
        </button>
        {person && <Avatar person={person} />}
        <strong>{lane.title}</strong>
        <span className="spacer" />
        <span className="muted">
          {total.count} {plural(total.count)} · {total.points} sp
        </span>
      </header>
      {!collapsed && (
        <div className="board-columns">
          {BOARD_COLUMNS.map((c) => {
            const items = lane.issues.filter((i) => i.status === c);
            return (
              <Cell
                key={c}
                laneKey={lane.key}
                column={c}
                hint={first && c === 'Done' && items.length === 0}
              >
                {items.map(renderCard)}
              </Cell>
            );
          })}
        </div>
      )}
    </section>
  );
}
