import { Link } from 'react-router';
import type { Sprint } from '../../domain/schema';
import { dateRange } from '../../ui/format';

/**
 * Три плашки над доской (wireframes.md, 17.2): ссылки на вкладки «Прошлые спринты» и «Планирование
 * будущих спринтов» и выбранная плашка с номером и датами спринта на доске.
 */
export function BoardNav({ projectKey, sprint }: { projectKey: string; sprint: Sprint }) {
  return (
    <nav className="board-nav" aria-label="Прошлое, текущее и будущее">
      <Link className="pill" to={`/projects/${projectKey}/history`}>
        Прошлые спринты
      </Link>
      <span className="pill current" aria-current="page">
        {sprint.state === 'active' ? 'Текущий спринт' : 'Спринт'} · {sprint.name} ·{' '}
        {dateRange(sprint.start, sprint.end)}
      </span>
      <Link className="pill" to={`/projects/${projectKey}/backlog`}>
        Планирование будущих спринтов
      </Link>
    </nav>
  );
}
