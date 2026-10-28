import type { IssueType, Person, Priority, Status } from '../../domain/schema';

const TYPE_LETTER: Record<IssueType, string> = {
  Epic: 'E',
  Story: 'S',
  Task: 'T',
  Bug: 'B',
  'Sub-task': 's',
};
const PRIORITY_MARK: Record<Priority, string> = { Highest: '▲▲', High: '▲', Medium: '■', Low: '▼' };

export function TypeIcon({ type }: { type: IssueType }) {
  return (
    <span className="type-icon" role="img" aria-label={type} title={type}>
      {TYPE_LETTER[type]}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: Priority }) {
  const hot = priority === 'Highest' || priority === 'High';
  return (
    <span className={`chip${hot ? ' hot' : ''}`}>
      <span aria-hidden="true">{PRIORITY_MARK[priority]}</span> {priority}
    </span>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip status-${status.toLowerCase().replace(' ', '-')}`}>{status}</span>;
}

export function PointsBadge({ points }: { points: number | null }) {
  if (points === null) return <span className="points empty" aria-label="Без оценки" />;
  return (
    <span className="points" title="Story points" aria-label={`Story points: ${points}`}>
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

export const TYPE_OPTIONS: IssueType[] = ['Epic', 'Story', 'Task', 'Bug', 'Sub-task'];
export const PRIORITY_OPTIONS: Priority[] = ['Highest', 'High', 'Medium', 'Low'];
