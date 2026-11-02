/* eslint-disable react-hooks/refs -- правило ошибочно срабатывает на ссылки и атрибуты dnd-kit (useSortable) */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Fragment, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { containerItems, type View } from '../../domain/actions';
import { canHavePoints } from '../../domain/hierarchy';
import {
  NO_PLANNING_FILTERS,
  allLabels,
  fillOf,
  hierarchyRows,
  filtersActive,
  matchesFilters,
  sprintCapacity,
  totalPoints,
  unestimated,
  type Capacity,
  type PlanningFilters,
} from '../../domain/planning';
import { epicProgress, type EpicProgress } from '../../domain/progress';
import {
  ISSUE_TYPES,
  PRIORITIES,
  type Issue,
  type IssueType,
  type Person,
  type Priority,
  type Project,
  type Sprint,
} from '../../domain/schema';
import { useActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import type { BulkPatch } from '../../domain/bulk';
import type { Result } from '../../domain/actions';
import {
  adjustedCapacity,
  sprintAvailability,
  type AdjustedCapacity,
} from '../../domain/availability';
import { ProjectFilter } from '../../ui/ProjectFilter';
import { useDodGate } from '../tasks/DodGate';
import { BulkBar } from '../tasks/BulkBar';
import { useCreateDialog } from '../../state/create-dialog';
import { useNotices } from '../../state/notices';
import { useProjectScope } from '../../state/project-scope';
import { useProjectHistory, useProjectViews, useView } from '../../state/queries';
import { dateRange, num, taskWord } from '../../ui/format';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { FillIndicator } from '../planning/FillIndicator';
import {
  Avatar,
  EpicProgressView,
  PointsBadge,
  PriorityChip,
  StatusChip,
  TypeIcon,
} from '../tasks/IssueBits';

const BACKLOG = 'backlog';
const containerId = (sprintId: string | null) => `container:${sprintId ?? BACKLOG}`;
const STATE_LABEL = { planned: 'запланирован', active: 'идёт', closed: 'закрыт' } as const;

interface RowProps {
  issue: Issue;
  projectKey: string;
  people: Person[];
  epic: Issue | undefined;
  subtasks: Issue[];
  progress?: EpicProgress | undefined;
  /** Можно ли менять порядок, приоритет, оценку и исполнителя (право backlog.rank). */
  canEdit: boolean;
  /** Можно ли выбирать задачу для переноса в спринт (право sprint.items). */
  canMove: boolean;
  selected: boolean;
  onSelect: (issueId: string, on: boolean) => void;
  onEdit: (
    issueId: string,
    patch: { priority?: Priority; points?: number | null; assigneeId?: string | null },
  ) => void;
  showStatus: boolean;
  nested?: boolean;
  /** Вложена под эпик этого же списка (иерархия, wireframes.md, 24.2). */
  child?: boolean;
  /** У эпика: сколько у него задач и свёрнут ли он. */
  epicToggle?: { count: number; collapsed: boolean; onToggle: () => void };
  /** У строки эпика из другого списка: где она находится («в Спринте 1», «в бэклоге»). */
  where?: string;
}

function IssueRow({
  issue,
  projectKey,
  people,
  epic,
  subtasks,
  progress,
  canEdit,
  canMove,
  selected,
  onSelect,
  onEdit,
  showStatus,
  nested = false,
  child = false,
  epicToggle,
  where,
}: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const sortable = useSortable({ id: issue.id, disabled: nested || !canEdit });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const assignee = people.find((p) => p.id === issue.assigneeId);
  const key = `${projectKey}-${issue.number}`;
  const editable = canEdit && !nested;
  // points и исполнитель — это правка задачи: нужно право «Редактировать»
  const fieldsOk = usePermissions().can('issue.edit');
  const [draft, setDraft] = useState<string | null>(null);

  const commitPoints = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    const next = text === '' ? null : Number(text);
    if (next !== null && (!Number.isInteger(next) || next < 0)) return;
    if (next !== issue.points) onEdit(issue.id, { points: next });
  };

  return (
    <>
      <li
        ref={nested ? undefined : sortable.setNodeRef}
        style={nested ? undefined : style}
        className={`issue-row planning-row${nested ? ' nested' : ''}${child ? ' child' : ''}${issue.type === 'Epic' ? ' epic-row' : ''}${sortable.isDragging ? ' dragging' : ''}`}
      >
        {nested || !canMove ? (
          <span className="handle-space" />
        ) : (
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Выбрать ${key}`}
            title="Отметить для массового изменения"
            onChange={(e) => onSelect(issue.id, e.target.checked)}
          />
        )}
        {nested || !canEdit ? (
          <span className="handle-space" />
        ) : (
          <button
            type="button"
            className="handle"
            aria-label={`Перетащить задачу ${key}`}
            title="Перетащить: изменить порядок или перенести в другой спринт"
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            ⋮⋮
          </button>
        )}
        <span className="type-cell">
          {epicToggle && epicToggle.count > 0 && (
            <button
              type="button"
              className="plain epic-toggle"
              aria-expanded={!epicToggle.collapsed}
              aria-label={`${epicToggle.collapsed ? 'Развернуть' : 'Свернуть'} эпик ${key}: задач ${epicToggle.count}`}
              title={epicToggle.collapsed ? 'Показать задачи эпика' : 'Скрыть задачи эпика'}
              onClick={epicToggle.onToggle}
            >
              {epicToggle.collapsed ? '▸' : '▾'}
            </button>
          )}
          <TypeIcon type={issue.type} />
        </span>
        <Link to={`/projects/${projectKey}/issues/${issue.number}`} className="issue-key">
          {key}
        </Link>
        <span className="issue-cell">
          <span className="issue-title">
            <Link to={`/projects/${projectKey}/issues/${issue.number}`}>{issue.title}</Link>
            {subtasks.length > 0 && (
              <button
                type="button"
                className="chip subtasks"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                title="Показать подзадачи"
              >
                ↳ {subtasks.length}
              </button>
            )}
          </span>
          {(epic || where || issue.labels.length > 0) && (
            <span className="row-meta">
              {where && <span className="chip where">{where}</span>}
              {epic && (
                <Link
                  to={`/projects/${projectKey}/issues/${epic.number}`}
                  className="chip"
                  title="Эпик"
                >
                  {epic.title}
                </Link>
              )}

              {issue.labels.slice(0, 2).map((l) => (
                <span key={l} className="chip label">
                  {l}
                </span>
              ))}
              {issue.labels.length > 2 && (
                <span className="muted small" title={issue.labels.slice(2).join(', ')}>
                  +{issue.labels.length - 2}
                </span>
              )}
            </span>
          )}
        </span>
        {editable ? (
          <select
            className="row-field"
            aria-label={`Приоритет ${key}`}
            title="Приоритет задачи"
            value={issue.priority}
            onChange={(e) => onEdit(issue.id, { priority: e.target.value as Priority })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : (
          <PriorityChip priority={issue.priority} />
        )}
        {showStatus ? <StatusChip status={issue.status} /> : <span />}
        {progress ? (
          <EpicProgressView progress={progress} compact />
        ) : editable && fieldsOk && canHavePoints(issue.type) ? (
          <input
            type="number"
            min={0}
            step={1}
            className={`row-field points-input${issue.points === null ? ' unset' : ''}`}
            aria-label={`Story points ${key}`}
            title="Story points: оценка целым числом (1, 2, 3, 5, 8, 13)"
            placeholder="—"
            value={draft ?? (issue.points === null ? '' : String(issue.points))}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitPoints}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setDraft(null);
            }}
          />
        ) : (
          <PointsBadge points={issue.points} />
        )}
        {editable && fieldsOk ? (
          <select
            className={`row-field${assignee ? '' : ' unset'}`}
            aria-label={`Исполнитель ${key}`}
            title="Исполнитель задачи"
            value={issue.assigneeId ?? ''}
            onChange={(e) => onEdit(issue.id, { assigneeId: e.target.value || null })}
          >
            <option value="">Не назначен</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <Avatar person={assignee} />
        )}
      </li>
      {expanded &&
        subtasks.map((s) => (
          <IssueRow
            key={s.id}
            issue={s}
            projectKey={projectKey}
            people={people}
            epic={undefined}
            subtasks={[]}
            canEdit={false}
            canMove={false}
            selected={false}
            onSelect={onSelect}
            onEdit={onEdit}
            showStatus={showStatus}
            nested
          />
        ))}
    </>
  );
}

interface SectionProps {
  title: string;
  sprint: Sprint | null;
  view: View;
  /** Все задачи списка и показанные под фильтрами. */
  all: Issue[];
  items: Issue[];
  capacity: Capacity | null;
  filtered: boolean;
  projectKey: string;
  canEdit: boolean;
  canMove: boolean;
  selected: Set<string>;
  onSelect: (issueId: string, on: boolean) => void;
  onEdit: RowProps['onEdit'];
}

function Section({
  title,
  sprint,
  view,
  all,
  items,
  capacity,
  filtered,
  projectKey,
  canEdit,
  canMove,
  selected,
  onSelect,
  onEdit,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(new Set());
  const droppable = useDroppable({ id: containerId(sprint?.id ?? null) });
  const points = totalPoints(all);
  // ёмкость этого спринта: velocity с поправкой на доступность людей (ADR-018)
  const sprintCapacity =
    sprint && capacity ? adjustedCapacity(capacity, sprintAvailability(view, sprint)) : capacity;
  const sprintCapacityValue = sprintCapacity?.value ?? null;
  const epics = new Map(view.issues.filter((i) => i.type === 'Epic').map((i) => [i.id, i]));
  const rows = hierarchyRows(items, collapsedEpics);
  const inList = new Set(all.map((i) => i.id));
  // задачи эпика из других списков показываются под ним с пометкой, где они
  const externalKids = (epicId: string) =>
    view.issues
      .filter((i) => i.parentId === epicId && i.type !== 'Epic' && !inList.has(i.id))
      .sort((a, b) => a.order - b.order);
  const locationOf = (issue: Issue) => {
    const s = view.sprints.find((x) => x.id === issue.sprintId);
    return s ? `в ${s.name}` : 'в бэклоге';
  };
  const toggleEpic = (id: string) =>
    setCollapsedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section className="backlog-section" aria-label={title}>
      <header className="section-head planning-head">
        <div className="section-line">
          <button
            type="button"
            className="plain"
            title={collapsed ? 'Развернуть список' : 'Свернуть список'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '▸' : '▾'} <strong>{title}</strong>
          </button>
          {sprint ? (
            <>
              <span className={`chip state-${sprint.state}`}>{STATE_LABEL[sprint.state]}</span>
              <span className="muted">{dateRange(sprint.start, sprint.end)}</span>
            </>
          ) : (
            <span className="muted">
              {all.length} {taskWord(all.length)} · {num(points)} sp
              {unestimated(all) > 0 && ` · без оценки: ${unestimated(all)}`}
            </span>
          )}
          {filtered && (
            <span className="muted small">
              показано {items.length} из {all.length}
            </span>
          )}
        </div>
        {sprint && capacity && (
          <FillIndicator
            fill={fillOf(points, sprintCapacityValue)}
            capacity={sprintCapacity as AdjustedCapacity}
            names={view.people}
          />
        )}
        {sprint && !capacity && <strong>{num(points)} sp</strong>}
      </header>
      {sprint && sprint.goal && !collapsed && <p className="muted goal">Цель: {sprint.goal}</p>}
      {!collapsed && (
        <SortableContext items={rows.map((r) => r.issue.id)} strategy={verticalListSortingStrategy}>
          <ul ref={droppable.setNodeRef} className={`issue-list${droppable.isOver ? ' over' : ''}`}>
            {rows.map(({ issue, depth, children }) => {
              const outside = issue.type === 'Epic' ? externalKids(issue.id) : [];
              const folded = collapsedEpics.has(issue.id);
              return (
                <Fragment key={issue.id}>
                  <IssueRow
                    issue={issue}
                    projectKey={projectKey}
                    people={view.people}
                    epic={depth === 1 || !issue.parentId ? undefined : epics.get(issue.parentId)}
                    progress={
                      issue.type === 'Epic' ? epicProgress(view.issues, issue.id) : undefined
                    }
                    subtasks={view.issues
                      .filter((s) => s.type === 'Sub-task' && s.parentId === issue.id)
                      .sort((a, b) => a.order - b.order)}
                    canEdit={canEdit}
                    canMove={canMove}
                    selected={selected.has(issue.id)}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    showStatus={sprint?.state === 'active'}
                    child={depth === 1}
                    {...(issue.type === 'Epic'
                      ? {
                          epicToggle: {
                            count: children + outside.length,
                            collapsed: folded,
                            onToggle: () => toggleEpic(issue.id),
                          },
                        }
                      : {})}
                  />
                  {!folded &&
                    outside.map((kid) => (
                      <IssueRow
                        key={kid.id}
                        issue={kid}
                        projectKey={projectKey}
                        people={view.people}
                        epic={undefined}
                        subtasks={[]}
                        canEdit={false}
                        canMove={false}
                        selected={false}
                        onSelect={onSelect}
                        onEdit={onEdit}
                        showStatus={false}
                        nested
                        child
                        where={locationOf(kid)}
                      />
                    ))}
                </Fragment>
              );
            })}
            {items.length === 0 && (
              <li className="drop-hint">
                {filtered && all.length > 0
                  ? 'Нет задач, подходящих под фильтры'
                  : 'Перетащите задачи сюда'}
              </li>
            )}
          </ul>
        </SortableContext>
      )}
    </section>
  );
}

interface FiltersBarProps {
  /** Фильтр по проектам (ADR-016). */
  projectFilter: ReactNode;
  /** Эпики для фильтра; null — эпики разных проектов не смешиваются, фильтра по эпику нет. */
  epics: Issue[] | null;
  people: Person[];
  labels: string[];
  filters: PlanningFilters;
  onChange: (f: PlanningFilters) => void;
  shown: number;
}

function FiltersBar({
  projectFilter,
  epics,
  people,
  labels,
  filters,
  onChange,
  shown,
}: FiltersBarProps) {
  const set = (patch: Partial<PlanningFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="board-toolbar planning-filters" role="search" aria-label="Фильтры бэклога">
      {projectFilter}
      <label title="Найти задачу по номеру или названию">
        Поиск
        <input
          type="search"
          value={filters.search}
          placeholder="Номер или название"
          onChange={(e) => set({ search: e.target.value })}
        />
      </label>
      {epics && (
        <label title="Показать задачи одного эпика">
          Эпик
          <select
            value={filters.epicId ?? ''}
            onChange={(e) => set({ epicId: e.target.value || null })}
          >
            <option value="">Все</option>
            {epics.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label title="Показать задачи одного исполнителя">
        Исполнитель
        <select
          value={filters.assigneeId ?? ''}
          onChange={(e) => set({ assigneeId: e.target.value || null })}
        >
          <option value="">Все</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label title="Показать задачи с этой меткой">
        Метка
        <select
          value={filters.label ?? ''}
          onChange={(e) => set({ label: e.target.value || null })}
        >
          <option value="">Все</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label title="Показать только задачи этого типа">
        Тип
        <select
          value={filters.type ?? ''}
          onChange={(e) => set({ type: (e.target.value || null) as IssueType | null })}
        >
          <option value="">Все</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={filters.noEstimate}
          onChange={(e) => set({ noEstimate: e.target.checked })}
        />
        Без оценки
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={filters.noAssignee}
          onChange={(e) => set({ noAssignee: e.target.checked })}
        />
        Без исполнителя
      </label>
      <span className="spacer" />
      {filtersActive(filters) && (
        <button type="button" onClick={() => onChange(NO_PLANNING_FILTERS)}>
          Сбросить
        </button>
      )}
      <span className="muted" role="status">
        {shown} {taskWord(shown)}
      </span>
    </div>
  );
}

/**
 * Вкладка «Планирование спринтов» (wireframes.md, 17.4, ADR-014): идущий и запланированные
 * спринты и общий бэклог одним списком, заполнение спринтов, фильтры, быстрая правка и перенос.
 */
function ProjectPlanning({
  project,
  filters,
  multi,
}: {
  project: Project;
  filters: PlanningFilters;
  /** Проект показан среди нескольких: нужен заголовок с ключом. */
  multi: boolean;
}) {
  const view = useView(project.id);
  const history = useProjectHistory(project.id);
  const actions = useActions(project.id);
  const perms = usePermissions();
  const showCreate = useCreateDialog((s) => s.show);
  const push = useNotices((s) => s.push);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dod = useDodGate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canEdit = perms.can('backlog.rank');
  const canMove = perms.can('sprint.items');

  const report = (errors: Record<string, string>) => push(Object.values(errors).join('. '));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    if (!view || !e.over) return;
    const dragged = String(e.active.id);
    const overId = String(e.over.id);
    if (dragged === overId) return;
    let sprintId: string | null;
    let index: number;
    if (overId.startsWith('container:')) {
      const key = overId.slice('container:'.length);
      sprintId = key === BACKLOG ? null : key;
      index = containerItems(view, sprintId).filter((i) => i.id !== dragged).length;
    } else {
      const over = view.issues.find((i) => i.id === overId);
      if (!over) return;
      sprintId = over.sprintId;
      index = containerItems(view, sprintId).findIndex((i) => i.id === overId);
    }
    const result = await actions.moveIssue(dragged, { sprintId, index });
    if (!result.ok) report(result.errors);
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const edit: RowProps['onEdit'] = async (issueId, patch) => {
    const result = await actions.updateIssue(issueId, patch);
    if (!result.ok) report(result.errors);
  };

  const select = (issueId: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(issueId);
      else next.delete(issueId);
      return next;
    });

  /** Массовые изменения: одним сохранением, у каждой задачи своя запись истории (ADR-017). */
  const applyBulk = async (patch: BulkPatch) => {
    if (!view) return { ok: true, changes: {} } as Result;
    const ids = view.issues
      .filter((i) => selected.has(i.id))
      .sort((a, b) => a.order - b.order)
      .map((i) => i.id);
    if (patch.status) {
      const chosen = view.issues.filter((i) => selected.has(i.id));
      if (!(await dod.ask(view.project, chosen, patch.status, project.key)))
        return { ok: false, errors: { form: 'Перевод в Done отменён' } } as Result;
    }
    const result = await actions.bulkUpdate(ids, patch);
    if (result.ok) {
      push(`Изменено задач: ${ids.length}`);
      setSelected(new Set());
    }
    return result;
  };

  const sprints = (view?.sprints ?? [])
    .filter((s) => s.state !== 'closed')
    .sort(
      (a, b) =>
        Number(b.state === 'active') - Number(a.state === 'active') ||
        a.start.localeCompare(b.start),
    );
  const activeIssue = view?.issues.find((i) => i.id === activeId);
  const capacity =
    view && history.data ? sprintCapacity(view.sprints, view.issues, history.data) : null;
  const filtered = filtersActive(filters);
  const listOf = (sprintId: string | null) => {
    if (!view) return { all: [] as Issue[], items: [] as Issue[] };
    const all = containerItems(view, sprintId);
    const items = filtered
      ? all.filter((i) => matchesFilters(i, `${project.key}-${i.number}`, filters))
      : all;
    return { all, items };
  };
  const selectedPoints = view ? totalPoints(view.issues.filter((i) => selected.has(i.id))) : 0;
  const selectedCount = selected.size;

  return (
    <section
      className="project-planning"
      aria-label={multi ? `Проект ${project.key}` : 'Планирование'}
    >
      {dod.dialog}
      {multi && (
        <h2 className="project-heading">
          <span className="chip project-tag">{project.key}</span>{' '}
          <Link to={`/projects/${project.key}/board?projects=${project.key}`}>{project.name}</Link>
        </h2>
      )}
      {!view ? (
        <Loading />
      ) : view.issues.length === 0 ? (
        <div className="empty">
          <p>В проекте пока нет задач.{perms.can('issue.create') ? ' Создайте первую.' : ''}</p>
          {perms.can('issue.create') && (
            <button type="button" className="primary" onClick={() => showCreate()}>
              + Создать задачу
            </button>
          )}
        </div>
      ) : (
        <>
          {selectedCount > 0 && view && (
            <BulkBar
              count={selectedCount}
              summary={`Выбрано ${selectedCount} · ${num(selectedPoints)} sp`}
              people={view.people}
              sprints={sprints}
              statusAllowed={view.issues
                .filter((i) => selected.has(i.id))
                .every((i) => perms.canChangeStatus(i))}
              onApply={applyBulk}
              onClear={() => setSelected(new Set())}
            />
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={(e) => void onDragEnd(e)}
            onDragCancel={() => setActiveId(null)}
          >
            {sprints.map((s) => (
              <Section
                key={s.id}
                title={s.name}
                sprint={s}
                view={view}
                {...listOf(s.id)}
                capacity={capacity}
                filtered={filtered}
                projectKey={project.key}
                canEdit={canEdit}
                canMove={canMove}
                selected={selected}
                onSelect={select}
                onEdit={(id, patch) => void edit(id, patch)}
              />
            ))}
            <Section
              title="Общий бэклог"
              sprint={null}
              view={view}
              {...listOf(null)}
              capacity={capacity}
              filtered={filtered}
              projectKey={project.key}
              canEdit={canEdit}
              canMove={canMove}
              selected={selected}
              onSelect={select}
              onEdit={(id, patch) => void edit(id, patch)}
            />
            <DragOverlay>
              {activeIssue ? (
                <div className="issue-row overlay">
                  <TypeIcon type={activeIssue.type} />
                  <strong>
                    {project.key}-{activeIssue.number}
                  </strong>
                  <span>{activeIssue.title}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}
      {view && view.issues.length > 0 && !view.sprints.some((s) => s.state !== 'closed') && (
        <p className="warn">
          Нет спринтов для планирования. Создайте спринт на экране{' '}
          <Link to={`/projects/${project.key}/sprints`}>«Спринты»</Link>.
        </p>
      )}
    </section>
  );
}

/**
 * Вкладка «Планирование спринтов» (wireframes.md, 17.4, ADR-014): идущий и запланированные
 * спринты и общий бэклог. Несколько выбранных проектов идут своими блоками (ADR-016).
 */
export function BacklogPage() {
  const { ready, scope } = useProjectScope();
  const { key = '' } = useParams();
  const showCreate = useCreateDialog((s) => s.show);
  const canCreate = usePermissions().can('issue.create');
  const views = useProjectViews(scope.projects);
  const [filters, setFilters] = useState<PlanningFilters>(NO_PLANNING_FILTERS);
  const projects = scope.projects;
  const [only] = projects;
  const header = (
    <PageHeader title="Планирование спринтов">
      {canCreate && (
        <button type="button" className="primary" onClick={() => showCreate()}>
          + Создать задачу
        </button>
      )}
    </PageHeader>
  );

  if (!ready || !views) {
    return (
      <div className="planning-page">
        {header}
        <Loading />
      </div>
    );
  }

  const issues = views.flatMap((v) => v.issues);
  const single = projects.length === 1;
  const shown = views.reduce((total, v) => {
    const ids = [...v.sprints.filter((s) => s.state !== 'closed').map((s) => s.id), null];
    return (
      total +
      ids.reduce(
        (n, id) =>
          n +
          containerItems(v, id).filter((i) =>
            matchesFilters(i, `${v.project.key}-${i.number}`, filters),
          ).length,
        0,
      )
    );
  }, 0);
  const projectFilter = <ProjectFilter />;
  const toolbar = (
    <FiltersBar
      projectFilter={projectFilter}
      epics={single ? issues.filter((i) => i.type === 'Epic') : null}
      people={views[0]?.people ?? []}
      labels={allLabels(issues)}
      filters={filters}
      onChange={setFilters}
      shown={shown}
    />
  );

  return (
    <div className="planning-page">
      {header}
      {toolbar}
      {projects.length === 0 && (
        <p className="empty">Не выбрано ни одного проекта: выберите проекты в фильтре.</p>
      )}
      {projects.map((project) => (
        <ProjectPlanning key={project.id} project={project} filters={filters} multi={!single} />
      ))}
      <p className="muted small">
        Порядок задаётся перетаскиванием за ручку ⋮⋮ (с клавиатуры: Пробел, стрелки, Пробел) между
        любыми спринтами и бэклогом проекта; несколько задач сразу — отметкой и списком «Перенести
        в». Оценка, приоритет и исполнитель правятся прямо в строке. Подзадачи показываются внутри
        родителя и переносятся вместе с ним.
      </p>
      <p>
        <Link to={`/projects/${key || only?.key || ''}/history`}>Выполненные спринты</Link>
      </p>
    </div>
  );
}
