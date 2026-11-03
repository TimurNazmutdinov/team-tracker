import type { EpicProgress } from '../../domain/progress';
import { CATEGORY_LABELS, categoryOf, statusClass, statusName } from '../../domain/statuses';
import { useStatusList } from '../../state/queries';
import type { IssueType, Person, Priority, Status } from '../../domain/schema';

const TYPE_LETTER: Record<IssueType, string> = {
  Epic: 'E',
  'Sub-epic': 'e',
  Task: 'T',
  Bug: 'B',
  'Sub-task': 's',
};

/** Одна фраза о типе: подсказка в окне «Создать» и у значка (ADR-024). */
export const TYPE_HINTS: Record<IssueType, string> = {
  Epic: 'Epic — крупный блок работ из нескольких задач; прогресс считается по ним.',
  'Sub-epic': 'Sub-epic (под-эпик) — часть эпика: «проект в проекте» со своими задачами.',
  Task: 'Task — работа: сделать, настроить, проверить. Оценивается в story points.',
  Bug: 'Bug — ошибка: что сломано и как воспроизвести.',
  'Sub-task': 'Sub-task — шаг внутри Task или Bug; спринт берётся у родителя.',
};
const PRIORITY_MARK: Record<Priority, string> = { Highest: '▲▲', High: '▲', Medium: '■', Low: '▼' };

export function TypeIcon({ type }: { type: IssueType }) {
  return (
    <span className="type-icon" role="img" aria-label={type} title={TYPE_HINTS[type]}>
      {TYPE_LETTER[type]}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: Priority }) {
  const hot = priority === 'Highest' || priority === 'High';
  return (
    <span className={`chip${hot ? ' hot' : ''}`} title={`Приоритет: ${priority}`}>
      <span aria-hidden="true">{PRIORITY_MARK[priority]}</span> {priority}
    </span>
  );
}

export function StatusChip({ status }: { status: Status }) {
  const statuses = useStatusList();
  return (
    <span
      className={`chip ${statusClass(statuses, status)}`}
      title={`Статус: ${statusName(statuses, status)} (${CATEGORY_LABELS[categoryOf(statuses, status)]})`}
    >
      {statusName(statuses, status)}
    </span>
  );
}

export function PointsBadge({ points }: { points: number | null }) {
  if (points === null) return <span className="points empty" role="img" aria-label="Без оценки" />;
  return (
    <span className="points" role="img" title="Story points" aria-label={`Story points: ${points}`}>
      {points}
    </span>
  );
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2);
}

export function Avatar({ person }: { person: Person | undefined }) {
  if (!person)
    return (
      <span className="muted" aria-label="Не назначен">
        —
      </span>
    );
  return (
    <span className="avatar" title={person.name} role="img" aria-label={person.name}>
      {initials(person.name)}
    </span>
  );
}

export const TYPE_OPTIONS: IssueType[] = ['Epic', 'Sub-epic', 'Task', 'Bug', 'Sub-task'];
export const PRIORITY_OPTIONS: Priority[] = ['Highest', 'High', 'Medium', 'Low'];

/** Вычисляемый прогресс эпика и под-эпика: points вложенных Task и Bug (у них самих points нет). */
export function EpicProgressView({
  progress,
  compact = false,
}: {
  progress: EpicProgress;
  compact?: boolean;
}) {
  const { total, done, percent, count } = progress;
  const text = total === 0 ? 'нет оценённых задач' : `${done} из ${total} sp в Done · ${percent}%`;
  return (
    <span className={`epic-progress${compact ? ' compact' : ''}`}>
      {total > 0 && (
        <span
          className="bar"
          role="progressbar"
          aria-label="Прогресс эпика"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={text}
        >
          <span className="bar-fill" style={{ width: `${percent}%` }} />
        </span>
      )}
      <span className="muted" title={`Задач в расчёте: ${count}`}>
        {compact && total > 0 ? `${done}/${total} · ${percent}%` : text}
      </span>
    </span>
  );
}
