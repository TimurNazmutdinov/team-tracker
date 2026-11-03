import { useState } from 'react';
import { NO_BOARD_FILTERS, filtersActive, type BoardFilters } from '../../domain/board';
import { labelGroup, type LabelStat } from '../../domain/labels';

/** Сколько меток видно сразу; остальные — под «+ ещё N». */
const VISIBLE_LABELS = 8;

/**
 * Быстрые фильтры над колонками (D-2, wireframes.md 27.1): «Только мои», «Заблокированные»,
 * «Без исполнителя» и метки задач — частые первыми. Метки сочетаются по выбору: любая или все.
 */
export function QuickFilters({
  filters,
  onChange,
  stats,
  shown,
  total,
  canMine,
}: {
  filters: BoardFilters;
  onChange: (next: BoardFilters) => void;
  /** Метки задач на доске с числом задач. */
  stats: readonly LabelStat[];
  shown: number;
  total: number;
  /** Есть ли у пользователя человек (для «Только мои»). */
  canMine: boolean;
}) {
  const [more, setMore] = useState(false);
  const chosen = new Set(filters.labels);
  // выбранные метки всегда видны, даже если их уже нет на доске
  const all: LabelStat[] = [
    ...filters.labels
      .filter((l) => !stats.some((s) => s.label === l))
      .map((l) => ({ label: l, count: 0 })),
    ...stats,
  ];
  const visible = more ? all : all.slice(0, VISIBLE_LABELS);
  const hidden = all.length - visible.length;
  const toggleLabel = (label: string) =>
    onChange({
      ...filters,
      labels: chosen.has(label)
        ? filters.labels.filter((l) => l !== label)
        : [...filters.labels, label],
    });
  const chip = (label: string, on: boolean, toggle: () => void, title: string, count?: number) => (
    <button
      key={label}
      type="button"
      className={`quick-chip${on ? ' on' : ''}`}
      aria-pressed={on}
      title={title}
      onClick={toggle}
    >
      {label}
      {count !== undefined && count > 0 && <span className="quick-count">{count}</span>}
    </button>
  );

  return (
    <div className="quick-filters" role="group" aria-label="Быстрые фильтры">
      {canMine &&
        chip(
          'Только мои',
          filters.mine,
          () => onChange({ ...filters, mine: !filters.mine }),
          'Задачи, где исполнитель — вы',
        )}
      {chip(
        '⛔ Заблокированные',
        filters.blocked,
        () => onChange({ ...filters, blocked: !filters.blocked }),
        'Задачи, которые ждут незавершённую блокирующую задачу',
      )}
      {chip(
        'Без исполнителя',
        filters.unassigned,
        () => onChange({ ...filters, unassigned: !filters.unassigned }),
        'Задачи без исполнителя',
      )}
      {all.length > 0 && <span className="quick-sep" aria-hidden="true" />}
      {visible.map((s) => {
        const { group, value } = labelGroup(s.label);
        return chip(
          group ? `${group}: ${value}` : s.label,
          chosen.has(s.label),
          () => toggleLabel(s.label),
          `Метка «${s.label}»: задач ${s.count}`,
          s.count,
        );
      })}
      {hidden > 0 && (
        <button type="button" className="quick-chip more" onClick={() => setMore(true)}>
          + ещё {hidden}
        </button>
      )}
      {more && all.length > VISIBLE_LABELS && (
        <button type="button" className="quick-chip more" onClick={() => setMore(false)}>
          свернуть
        </button>
      )}
      {filters.labels.length > 1 && (
        <span className="label-mode" role="group" aria-label="Как сочетать метки">
          <button
            type="button"
            className={filters.labelMode === 'any' ? 'on' : ''}
            aria-pressed={filters.labelMode === 'any'}
            title="Показать задачи с любой из выбранных меток"
            onClick={() => onChange({ ...filters, labelMode: 'any' })}
          >
            любая
          </button>
          <button
            type="button"
            className={filters.labelMode === 'all' ? 'on' : ''}
            aria-pressed={filters.labelMode === 'all'}
            title="Показать задачи, у которых есть все выбранные метки"
            onClick={() => onChange({ ...filters, labelMode: 'all' })}
          >
            все
          </button>
        </span>
      )}
      <span className="spacer" />
      <span className="muted small" role="status">
        показано {shown} из {total}
      </span>
      {filtersActive(filters) && (
        <button type="button" className="link" onClick={() => onChange(NO_BOARD_FILTERS)}>
          Сбросить
        </button>
      )}
    </div>
  );
}
