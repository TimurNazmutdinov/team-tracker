import type { Issue, Sprint, StatusDef } from '../../domain/schema';
import { isDoneStatus } from '../../domain/statuses';
import { dateRange, num } from '../../ui/format';

const DAY = 86_400_000;
const daysLeft = (end: string) =>
  Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(new Date().toISOString().slice(0, 10))) / DAY,
  );

/**
 * Шапка спринта над доской одной строкой (D-5, wireframes.md 27.1): название, даты, сколько осталось,
 * цель, прогресс по колонкам «готово» и выбор спринта.
 */
export function SprintHeader({
  sprint,
  sprints,
  cards,
  statuses,
  onSelect,
}: {
  sprint: Sprint;
  /** Спринты для выбора: идущий, запланированные, закрытые. */
  sprints: Sprint[];
  /** Задачи спринта на доске (без учёта фильтров). */
  cards: Issue[];
  statuses: readonly StatusDef[];
  onSelect: (sprintId: string) => void;
}) {
  const total = cards.reduce((n, i) => n + (i.points ?? 0), 0);
  const done = cards
    .filter((i) => isDoneStatus(statuses, i.status))
    .reduce((n, i) => n + (i.points ?? 0), 0);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const left = daysLeft(sprint.end);
  const state =
    sprint.state === 'closed'
      ? 'закрыт'
      : sprint.state === 'planned'
        ? 'запланирован'
        : left > 0
          ? `осталось ${left} дн.`
          : left === 0
            ? 'последний день'
            : `закончился ${-left} дн. назад`;
  return (
    <section className="sprint-header" aria-label="Спринт на доске">
      <div className="sprint-header-main">
        <strong>
          {sprint.name} · {dateRange(sprint.start, sprint.end)}
        </strong>
        <span className="muted">
          {state}
          {sprint.goal ? ` · цель: ${sprint.goal}` : ''}
        </span>
      </div>
      <div className="sprint-header-progress">
        <span>
          Готово {num(done)} из {num(total)} sp · {percent} %
        </span>
        <span className="meter" role="img" aria-label={`Готово ${percent} %`}>
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>
      <label className="sprint-header-select" title="Какой спринт показать на доске">
        Спринт
        <select value={sprint.id} onChange={(e) => onSelect(e.target.value)}>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
