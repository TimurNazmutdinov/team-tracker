import { Link, useLocation } from 'react-router';
import type { Sprint } from '../../domain/schema';
import { dateRange } from '../../ui/format';

/**
 * Три плашки над доской (wireframes.md, 17.2): ссылки на вкладки «Прошлые спринты» и «Планирование
 * будущих спринтов» и выбранная плашка с номером и датами спринта на доске. При нескольких проектах
 * (ADR-016) вместо спринта — число проектов. Выбор проектов из адреса переносится в ссылки.
 */
export function BoardNav({
  projectKey,
  sprint,
  projectCount = 1,
}: {
  projectKey: string;
  sprint?: Sprint | undefined;
  projectCount?: number;
}) {
  const { search } = useLocation();
  const label =
    projectCount > 1 || !sprint
      ? `Текущие спринты проектов: ${projectCount}`
      : `${sprint.state === 'active' ? 'Текущий спринт' : 'Спринт'} · ${sprint.name} · ${dateRange(sprint.start, sprint.end)}`;
  return (
    <nav className="board-nav" aria-label="Прошлое, текущее и будущее">
      <Link className="pill" to={{ pathname: `/projects/${projectKey}/history`, search }}>
        Прошлые спринты
      </Link>
      <span className="pill current" aria-current="page">
        {label}
      </span>
      <Link className="pill" to={{ pathname: `/projects/${projectKey}/backlog`, search }}>
        Планирование будущих спринтов
      </Link>
    </nav>
  );
}
