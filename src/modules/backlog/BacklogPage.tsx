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
import { useState } from 'react';
import { Link } from 'react-router';
import { containerItems, type View } from '../../domain/actions';
import { epicProgress, type EpicProgress } from '../../domain/progress';
import type { Issue, Person, Sprint } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { useCreateDialog } from '../../state/create-dialog';
import { useNotices } from '../../state/notices';
import { useView } from '../../state/queries';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { useCurrentProject } from '../projects/ProjectRoute';
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

const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

interface RowProps {
  issue: Issue;
  projectKey: string;
  people: Person[];
  subtasks: Issue[];
  progress?: EpicProgress | undefined;
  sprints: Sprint[];
  onMove: (issueId: string, sprintId: string | null) => void;
  nested?: boolean;
}

function IssueRow({
  issue,
  projectKey,
  people,
  subtasks,
  progress,
  sprints,
  onMove,
  nested = false,
}: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const sortable = useSortable({ id: issue.id, disabled: nested });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const assignee = people.find((p) => p.id === issue.assigneeId);
  const key = `${projectKey}-${issue.number}`;
  return (
    <>
      <li
        ref={nested ? undefined : sortable.setNodeRef}
        style={nested ? undefined : style}
        className={`issue-row${nested ? ' nested' : ''}${sortable.isDragging ? ' dragging' : ''}`}
      >
        {nested ? (
          <span className="handle-space" />
        ) : (
          <button
            type="button"
            className="handle"
            aria-label={`Перетащить задачу ${key}`}
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            ⋮⋮
          </button>
        )}
        <TypeIcon type={issue.type} />
        <Link to={`/projects/${projectKey}/issues/${issue.number}`} className="issue-key">
          {key}
        </Link>
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
        <PriorityChip priority={issue.priority} />
        <StatusChip status={issue.status} />
        {progress ? (
          <EpicProgressView progress={progress} compact />
        ) : (
          <PointsBadge points={issue.points} />
        )}
        <Avatar person={assignee} />
        {nested ? (
          <span />
        ) : (
          <select
            className="move"
            aria-label={`Переместить ${key}`}
            value=""
            onChange={(e) => onMove(issue.id, e.target.value === BACKLOG ? null : e.target.value)}
          >
            <option value="" disabled>
              Переместить…
            </option>
            {issue.sprintId !== null && <option value={BACKLOG}>В бэклог</option>}
            {sprints
              .filter((s) => s.state !== 'closed' && s.id !== issue.sprintId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  В {s.name}
                </option>
              ))}
          </select>
        )}
      </li>
      {expanded &&
        subtasks.map((s) => (
          <IssueRow
            key={s.id}
            issue={s}
            projectKey={projectKey}
            people={people}
            subtasks={[]}
            sprints={sprints}
            onMove={onMove}
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
  items: Issue[];
  projectKey: string;
  onMove: (issueId: string, sprintId: string | null) => void;
}

function Section({ title, sprint, view, items, projectKey, onMove }: SectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const droppable = useDroppable({ id: containerId(sprint?.id ?? null) });
  const points = items.reduce((sum, i) => sum + (i.points ?? 0), 0);
  return (
    <section className="backlog-section" aria-label={title}>
      <header className="section-head">
        <button
          type="button"
          className="plain"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▸' : '▾'} <strong>{title}</strong>
        </button>
        {sprint ? (
          <>
            <span className={`chip state-${sprint.state}`}>{STATE_LABEL[sprint.state]}</span>
            <span className="muted">
              {fmt(sprint.start)} – {fmt(sprint.end)}
            </span>
            <span className="spacer" />
            <strong>{points} sp</strong>
          </>
        ) : (
          <>
            <span className="muted">
              {items.length === 1 ? '1 задача' : `${items.length} задач`}
            </span>
            <span className="spacer" />
            <strong>{points} sp</strong>
          </>
        )}
      </header>
      {sprint && sprint.goal && !collapsed && <p className="muted goal">Цель: {sprint.goal}</p>}
      {!collapsed && (
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul ref={droppable.setNodeRef} className={`issue-list${droppable.isOver ? ' over' : ''}`}>
            {items.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                projectKey={projectKey}
                people={view.people}
                progress={issue.type === 'Epic' ? epicProgress(view.issues, issue.id) : undefined}
                subtasks={view.issues
                  .filter((s) => s.type === 'Sub-task' && s.parentId === issue.id)
                  .sort((a, b) => a.order - b.order)}
                sprints={view.sprints}
                onMove={onMove}
              />
            ))}
            {items.length === 0 && <li className="drop-hint">Перетащите задачи сюда</li>}
          </ul>
        </SortableContext>
      )}
    </section>
  );
}

/** Экран «Бэклог» (wireframes.md, раздел 4): списки спринтов и бэклога, порядок перетаскиванием. */
export function BacklogPage() {
  const project = useCurrentProject();
  const view = useView(project.id);
  const actions = useActions(project.id);
  const showCreate = useCreateDialog((s) => s.show);
  const push = useNotices((s) => s.push);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const report = (errors: Record<string, string>) => push(Object.values(errors).join('. '));

  const move = async (issueId: string, sprintId: string | null) => {
    if (!view) return;
    const index = containerItems(view, sprintId).filter((i) => i.id !== issueId).length;
    const result = await actions.moveIssue(issueId, { sprintId, index });
    if (!result.ok) report(result.errors);
  };

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

  const sprints = (view?.sprints ?? [])
    .filter((s) => s.state !== 'closed')
    .sort(
      (a, b) =>
        Number(b.state === 'active') - Number(a.state === 'active') ||
        a.start.localeCompare(b.start),
    );
  const activeIssue = view?.issues.find((i) => i.id === activeId);

  return (
    <>
      <PageHeader title="Бэклог">
        <button type="button" className="primary" onClick={() => showCreate()}>
          + Создать задачу
        </button>
      </PageHeader>
      {!view ? (
        <Loading />
      ) : view.issues.length === 0 ? (
        <div className="empty">
          <p>В проекте пока нет задач. Создайте первую.</p>
          <button type="button" className="primary" onClick={() => showCreate()}>
            + Создать задачу
          </button>
        </div>
      ) : (
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
              items={containerItems(view, s.id)}
              projectKey={project.key}
              onMove={(id, to) => void move(id, to)}
            />
          ))}
          <Section
            title="Бэклог"
            sprint={null}
            view={view}
            items={containerItems(view, null)}
            projectKey={project.key}
            onMove={(id, to) => void move(id, to)}
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
      )}
      <p className="muted small">
        Порядок задаётся перетаскиванием за ручку ⋮⋮ (с клавиатуры: Пробел, стрелки, Пробел) или
        списком «Переместить…». Подзадачи показываются внутри родителя и переносятся вместе с ним.
      </p>
      {view && view.issues.length > 0 && !view.sprints.some((s) => s.state !== 'closed') && (
        <p className="warn">
          Нет спринтов для планирования. Создайте спринт на экране{' '}
          <Link to={`/projects/${project.key}/sprints`}>«Спринты»</Link>.
        </p>
      )}
    </>
  );
}
