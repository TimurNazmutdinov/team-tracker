/* eslint-disable react-hooks/refs -- правило ошибочно срабатывает на ссылки и атрибуты dnd-kit (useDraggable) */
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BOARD_COLUMNS, statsOf, type BoardColumn, type Lane } from '../../domain/board';
import { STATUSES, type Issue, type Person, type Status } from '../../domain/schema';
import { Avatar, PointsBadge, PriorityChip, TypeIcon } from '../tasks/IssueBits';

// Части доски, общие для доски одного проекта и доски нескольких проектов (ADR-016).

export const cellId = (laneKey: string, column: BoardColumn) => `cell:${laneKey}:${column}`;

interface CardProps {
  issue: Issue;
  projectKey: string;
  parentKey: string | null;
  readOnly: boolean;
  /** Показать метку проекта (когда на доске несколько проектов). */
  showProject?: boolean;
  onStatus: (issueId: string, status: Status) => void;
}

export function BoardCard({
  issue,
  projectKey,
  parentKey,
  readOnly,
  showProject,
  onStatus,
}: CardProps) {
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
        {showProject && <span className="chip project-tag">{projectKey}</span>}
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

export const plural = (n: number) =>
  n % 10 === 1 && n % 100 !== 11
    ? 'задача'
    : 2 <= n % 10 && n % 10 <= 4 && !(12 <= n % 100 && n % 100 <= 14)
      ? 'задачи'
      : 'задач';

export function LaneView({
  lane,
  first,
  collapsed,
  onToggle,
  renderCard,
  person,
  heading,
  meta,
}: {
  lane: Lane;
  first: boolean;
  collapsed: boolean;
  onToggle: () => void;
  renderCard: (issue: Issue) => ReactNode;
  person: Person | undefined;
  /** Своя шапка дорожки вместо названия (дорожка проекта). */
  heading?: ReactNode;
  /** Своя подпись справа вместо числа задач. */
  meta?: ReactNode;
}) {
  const total = statsOf(lane.issues);
  return (
    <section className="lane" aria-label={lane.title}>
      <header className="lane-head">
        <button type="button" className="plain" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? '▸' : '▾'}
        </button>
        {person && <Avatar person={person} />}
        {heading ?? <strong>{lane.title}</strong>}
        <span className="spacer" />
        <span className="muted">
          {meta ?? `${total.count} ${plural(total.count)} · ${total.points} sp`}
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
