import { Link, NavLink, useLocation, useParams } from 'react-router';
import { useLastProject } from '../state/last-project';

// Подвкладки разделов меню из 7 пунктов (rework.md, 4.2): «Спринты» = спринты и прошлые спринты,
// «Отчёты» = отчёты спринтов и поток, время цикла, нагрузка. Выбор проектов из адреса сохраняется.

function useKey(): string {
  const { key } = useParams();
  const last = useLastProject((s) => s.key);
  return key ?? last ?? '';
}

/** «Спринты · Прошлые спринты» над экранами спринтов и истории. */
export function SprintsTabs() {
  const key = useKey();
  const { search } = useLocation();
  return (
    <nav className="section-tabs" aria-label="Спринты: вид">
      <NavLink end to={{ pathname: `/projects/${key}/sprints`, search }}>
        Текущий и будущие
      </NavLink>
      <NavLink to={{ pathname: `/projects/${key}/history`, search }}>Прошлые спринты</NavLink>
    </nav>
  );
}

const ANALYTICS = [
  { id: 'flow', label: 'Поток (CFD)' },
  { id: 'time', label: 'Время цикла' },
  { id: 'load', label: 'Нагрузка' },
] as const;

/** «Спринт и velocity · Поток · Время цикла · Нагрузка» над отчётами и аналитикой. */
export function ReportsTabs() {
  const key = useKey();
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const tab = params.get('tab') ?? 'flow';
  const scope = params.get('projects');
  const keep = scope ? `projects=${encodeURIComponent(scope)}` : '';
  const onAnalytics = pathname.startsWith('/analytics');
  return (
    <nav className="section-tabs" aria-label="Отчёты: вид">
      <NavLink
        to={{ pathname: `/projects/${key}/reports`, search: keep ? `?${keep}` : '' }}
        title="Burndown и velocity спринтов, итоги по людям"
      >
        Спринты и velocity
      </NavLink>
      {ANALYTICS.map((t) => {
        // у вкладок аналитики один адрес, вид — в ?tab=: активную отмечаем сами
        const on = onAnalytics && tab === t.id;
        return (
          <Link
            key={t.id}
            to={{ pathname: '/analytics', search: `?${keep ? `${keep}&` : ''}tab=${t.id}` }}
            className={on ? 'active' : undefined}
            aria-current={on ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
