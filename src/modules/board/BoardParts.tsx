/* eslint-disable react-hooks/refs -- правило ошибочно срабатывает на ссылки и атрибуты dnd-kit (useDraggable) */
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { ALL_LANE, statsOf, type BoardColumn, type Lane } from '../../domain/board';
import type { EpicProgress } from '../../domain/progress';
import type { Issue, Person, Status, StatusDef } from '../../domain/schema';
import { activeStatuses, isDoneStatus } from '../../domain/statuses';
import { epicStyle } from '../../ui/epicColor';
import { useStatusList } from '../../state/queries';
import { Avatar, EpicProgressView, PointsBadge, TypeIcon } from '../tasks/IssueBits';

// Части доски, общие для доски одного проекта и доски нескольких проектов (ADR-016).

export const cellId = (laneKey: string, column: BoardColumn) => `cell:${laneKey}:${column}`;

interface CardProps {
  issue: Issue;
  projectKey: string;
  parentKey: string | null;
  readOnly: boolean;
  /** Путь до родителей («эпик › задача»), если они есть: подсказка на метке эпика. */
  trail?: string | undefined;
  /** Эпик верхнего уровня задачи: цветная полоса и метка (D-5). */
  epic?: Issue | null | undefined;
  /** Не показывать метку эпика (карточка уже в дорожке своего эпика). */
  hideEpic?: boolean | undefined;
  /** Исполнитель — аватар на карточке. */
  assignee?: Person | undefined;
  /** Ключи незавершённых блокирующих задач (D-10). */
  blockedBy?: string[] | undefined;
  /** Показать метку проекта (когда на доске несколько проектов). */
  showProject?: boolean;
  onStatus: (issueId: string, status: Status) => void;
  /** Отметка для массовых действий; без неё флажка нет. */
  selected?: boolean | undefined;
  onSelect?: ((issueId: string) => void) | undefined;
}

const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/**
 * Компактная карточка доски (D-5, wireframes.md 27.1): тип · ключ · приоритет · sp; название в две
 * строки; метка эпика его цветом, до двух меток, срок, блокировка, исполнитель. Статус меняется
 * перетаскиванием или списком внизу карточки (замена перетаскиванию с клавиатуры).
 */
export function BoardCard({
  issue,
  projectKey,
  parentKey,
  readOnly,
  showProject,
  trail,
  epic,
  hideEpic,
  assignee,
  blockedBy,
  onStatus,
  selected,
  onSelect,
}: CardProps) {
  const drag = useDraggable({ id: issue.id, disabled: readOnly });
  const statuses = useStatusList();
  const key = `${projectKey}-${issue.number}`;
  const due = issue.dueDate;
  const overdue = due !== null && due < today() && !isDoneStatus(statuses, issue.status);
  const labels = issue.labels.slice(0, 2);
  const moreLabels = issue.labels.length - labels.length;
  return (
    <article
      ref={drag.setNodeRef}
      className={`board-card${drag.isDragging ? ' dragging' : ''}${epic ? ' with-epic' : ''}${selected ? ' picked' : ''}`}
      style={epic ? (epicStyle(epic.id) as CSSProperties) : undefined}
      aria-label={`${key} ${issue.title}`}
    >
      <header>
        {onSelect && (
          <input
            type="checkbox"
            className="pick"
            aria-label={`Выбрать ${key}`}
            title="Отметить для массового изменения"
            checked={selected ?? false}
            onChange={() => onSelect(issue.id)}
          />
        )}
        {!readOnly && (
          <button
            type="button"
            className="handle"
            aria-label={`Перетащить ${key}`}
            title="Перетащить в другую колонку"
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
            className="card-parent"
            to={`/projects/${projectKey}/issues/${parentKey.split('-')[1] ?? ''}`}
            title="Родитель"
          >
            ↑ {parentKey}
          </Link>
        )}
        {showProject && <span className="chip project-tag">{projectKey}</span>}
        <span className="spacer" />
        <PriorityMark priority={issue.priority} />
        <PointsBadge points={issue.points} />
      </header>
      <p className="card-title" title={issue.title}>
        {issue.title}
      </p>
      {((epic && !hideEpic) || labels.length > 0 || blockedBy?.length || due) && (
        <div className="card-tags">
          {epic && !hideEpic && (
            <span className="epic-tag" title={trail ? `Родители: ${trail}` : epic.title}>
              {epic.title}
            </span>
          )}
          {blockedBy && blockedBy.length > 0 && (
            <span className="chip blocked-tag" title={`Ждёт: ${blockedBy.join(', ')}`}>
              ⛔ ждёт {blockedBy[0]}
              {blockedBy.length > 1 ? ` +${blockedBy.length - 1}` : ''}
            </span>
          )}
          {labels.map((l) => (
            <span key={l} className="chip label-tag">
              {l}
            </span>
          ))}
          {moreLabels > 0 && (
            <span className="chip label-tag" title={issue.labels.slice(2).join(', ')}>
              +{moreLabels}
            </span>
          )}
          {due && (
            <span
              className={`chip due-tag${overdue ? ' hot' : ''}`}
              title={overdue ? `Срок прошёл: ${due}` : `Срок: ${due}`}
            >
              до {shortDate(due)}
            </span>
          )}
        </div>
      )}
      <footer>
        <select
          className="status-select"
          aria-label={`Статус ${key}`}
          title="Статус задачи: допустим любой переход"
          value={issue.status}
          disabled={readOnly}
          onChange={(e) => onStatus(issue.id, e.target.value)}
        >
          {activeStatuses(statuses).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Avatar person={assignee} />
      </footer>
    </article>
  );
}

const PRIORITY_MARK: Record<Issue['priority'], string> = {
  Highest: '▲▲',
  High: '▲',
  Medium: '',
  Low: '▼',
};

/** Приоритет значком: Medium не показывается, высокие — цветом. */
function PriorityMark({ priority }: { priority: Issue['priority'] }) {
  const mark = PRIORITY_MARK[priority];
  if (!mark) return null;
  const hot = priority === 'Highest' || priority === 'High';
  return (
    <span
      className={`prio-mark${hot ? ' hot' : ''}`}
      role="img"
      aria-label={`Приоритет: ${priority}`}
      title={`Приоритет: ${priority}`}
    >
      {mark}
    </span>
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
  columns,
  progress,
}: {
  /** Колонки доски по порядку (ADR-024). */
  columns: readonly StatusDef[];
  /** Прогресс эпика для дорожки эпика. */
  progress?: EpicProgress | undefined;
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
  // «Без дорожек» — одна дорожка без заголовка
  const bare = lane.key === ALL_LANE;
  return (
    <section
      className={`lane${lane.epic ? ' epic-lane' : ''}`}
      aria-label={lane.title}
      style={lane.epic ? (epicStyle(lane.epic.id) as CSSProperties) : undefined}
    >
      {!bare && (
        <header className="lane-head">
          <button
            type="button"
            className="plain"
            title={collapsed ? 'Развернуть дорожку' : 'Свернуть дорожку'}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          {person && <Avatar person={person} />}
          {lane.epic && <TypeIcon type={lane.epic.type} />}
          {heading ?? <strong>{lane.title}</strong>}
          {progress && <EpicProgressView progress={progress} compact />}
          <span className="spacer" />
          <span className="muted">
            {meta ?? `${total.count} ${plural(total.count)} · ${total.points} sp`}
          </span>
        </header>
      )}
      {(bare || !collapsed) && (
        <div className="board-columns">
          {columns.map((col, index) => {
            const c = col.id;
            const items = lane.issues.filter((i) => i.status === c);
            return (
              <Cell
                key={c}
                laneKey={lane.key}
                column={c}
                hint={first && index === columns.length - 1 && items.length === 0}
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
