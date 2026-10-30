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
import { Link, useParams, useSearchParams } from 'react-router';
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
  type BoardColumn,
  type BoardFilters,
} from '../../domain/board';
import {
  ISSUE_TYPES,
  PRIORITIES,
  type IssueType,
  type Person,
  type Priority,
  type Project,
  type Status,
} from '../../domain/schema';
import type { BulkPatch } from '../../domain/bulk';
import { wipAfterMove, wipLimit, wipMessage } from '../../domain/wip';
import { useActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { useBoardPrefs } from '../../state/board-prefs';
import { useNotices } from '../../state/notices';
import { useProjectScope } from '../../state/project-scope';
import { useView } from '../../state/queries';
import { ProjectFilter } from '../../ui/ProjectFilter';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { useDodGate } from '../tasks/DodGate';
import { BulkBar } from '../tasks/BulkBar';
import { BoardNav } from './BoardNav';
import { BoardCard, LaneView, plural } from './BoardParts';
import { MultiBoard } from './MultiBoard';

/** Доска одного проекта (wireframes.md, раздел 5): колонки статусов, группировка по полю, перенос карточек. */
function SingleBoard({ project, filter }: { project: Project; filter: ReactNode }) {
  const view = useView(project.id);
  const actions = useActions(project.id);
  const push = useNotices((s) => s.push);
  const groupBy = useBoardPrefs((s) => s.groupBy);
  const setGroupBy = useBoardPrefs((s) => s.setGroupBy);
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<BoardFilters>(NO_BOARD_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const dod = useDodGate();
  const [picked, setPicked] = useState<Set<string>>(new Set());
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

  const unfiltered = columnStats(all);
  const counts = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, unfiltered[c].count]));
  const warnWip = (status: string, adding: number) => {
    const over = wipAfterMove(project, counts, status, adding);
    if (over) push(wipMessage(over));
  };

  const changeStatus = async (issueId: string, status: Status) => {
    const before = view.issues.find((i) => i.id === issueId);
    if (before && !(await dod.ask(project, [before], status, project.key))) return;
    const result = await actions.updateIssue(issueId, { status });
    if (!result.ok) push(Object.values(result.errors).join('. '));
    else if (before && before.status !== status) warnWip(status, 1);
  };

  const pickedIssues = cards.filter((i) => picked.has(i.id));
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const applyBulk = async (patch: BulkPatch) => {
    const ids = pickedIssues.map((i) => i.id);
    if (patch.status && !(await dod.ask(project, pickedIssues, patch.status, project.key)))
      return { ok: false, errors: { form: 'Перевод в Done отменён' } } as const;
    const result = await actions.bulkUpdate(ids, patch);
    if (result.ok) {
      push(`Изменено задач: ${ids.length}`);
      if (patch.status)
        warnWip(
          patch.status,
          ids.filter((id) => view.issues.find((i) => i.id === id)?.status !== patch.status).length,
        );
      setPicked(new Set());
    }
    return result;
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
      {dod.dialog}
      <PageHeader title="Доска" />
      <BoardNav projectKey={project.key} sprint={sprint} />
      <div className="board-toolbar">
        {filter}
        <label title="Какой спринт показать на доске">
          Спринт
          <select
            value={sprint.id}
            onChange={(e) =>
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                if (e.target.value === defaultSprint(view.sprints)?.id) next.delete('sprint');
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
        <label title="Разбить доску на дорожки по полю">
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
        <label title="Показать только задачи этого типа">
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
        <label title="Показать только задачи этого приоритета">
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

      {!readOnly && pickedIssues.length > 0 && (
        <BulkBar
          count={pickedIssues.length}
          people={view.people}
          sprints={view.sprints.filter((s) => s.state !== 'closed')}
          statusAllowed={pickedIssues.every((i) => perms.canChangeStatus(i))}
          onApply={applyBulk}
          onClear={() => setPicked(new Set())}
        />
      )}
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
                  {wipLimit(project, c) !== undefined &&
                    (counts[c] ?? 0) > (wipLimit(project, c) ?? 0) && (
                      <span className="wip-over" role="status">
                        ⚠ WIP {counts[c]} из {wipLimit(project, c)}
                      </span>
                    )}
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
                    {...(readOnly ? {} : { selected: picked.has(issue.id), onSelect: togglePick })}
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

/**
 * Экран «Доска»: один выбранный проект — обычная доска; несколько — дорожки-проекты с общими
 * колонками статусов (wireframes.md, 19.1, ADR-016).
 */
export function BoardPage() {
  const { ready, scope } = useProjectScope();
  const { key = '' } = useParams();
  if (!ready) {
    return (
      <>
        <PageHeader title="Доска" />
        <Loading />
      </>
    );
  }
  const filter = <ProjectFilter />;
  const projects = scope.projects;
  const [only] = projects;
  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="Доска" />
        <div className="board-toolbar">{filter}</div>
        <p className="empty">Не выбрано ни одного проекта: выберите проекты в фильтре.</p>
      </>
    );
  }
  if (only && projects.length === 1)
    return <SingleBoard key={only.id} project={only} filter={filter} />;
  return <MultiBoard projects={projects} routeKey={key || (only?.key ?? '')} filter={filter} />;
}
