import { useEffect, useRef } from 'react';
import { customPref } from '../domain/projectScope';
import { useProjectScope } from '../state/project-scope';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router';
import { activeProjects } from '../domain/projects';
import { useHelp } from '../state/help';
import { useLastProject } from '../state/last-project';
import { useProjects } from '../state/queries';
import { useQuick } from '../state/quick';
import { Logo } from './Logo';
import { UserMenu } from './UserMenu';

/**
 * Меню из 7 пунктов (rework.md, 4.2): у каждого одно значение. «Спринты» включают прошлые спринты,
 * «Отчёты» — поток, время цикла и нагрузку (бывшая «Аналитика»).
 */
const TABS: { to: string; label: string; tip: string; also?: RegExp }[] = [
  { to: 'backlog', label: 'Планирование', tip: 'Планирование: спринты, общий бэклог, эпики' },
  { to: 'board', label: 'Доска', tip: 'Доска текущего спринта по колонкам' },
  {
    to: 'sprints',
    label: 'Спринты',
    tip: 'Спринты: текущий, будущие и прошлые; цели, запуск, закрытие, ретроспектива',
    also: /^\/projects\/[^/]+\/history/,
  },
  {
    to: 'reports',
    label: 'Отчёты',
    tip: 'Отчёты: burndown, velocity, люди; Поток (CFD), время цикла, нагрузка',
    also: /^\/analytics/,
  },
  { to: 'people', label: 'Люди', tip: 'Нагрузка людей, отсутствия, учётки и роли' },
  {
    to: 'settings',
    label: 'Настройки',
    tip: 'Настройки проекта: спринты, WIP, шаблоны, участники, роли',
  },
];

/** Верхняя панель по макетам: название, проект, вкладки, поиск (этап 4), меню. */
export function AppBar() {
  const { key } = useParams();
  const showQuick = useQuick((s) => s.show);
  const showHelp = useHelp((s) => s.show);
  const projects = useProjects();
  const last = useLastProject((s) => s.key);
  const setLast = useLastProject((s) => s.set);
  useEffect(() => {
    if (key) setLast(key);
  }, [key, setLast]);
  // на «Портфеле» и «Аналитике» показываем вкладки последнего открытого проекта (wireframes.md, 24.1)
  const known = activeProjects(projects.data ?? []);
  const { ready, scope, choose } = useProjectScope();
  const shown =
    key ??
    scope.projects[0]?.key ??
    (known.some((p) => p.key === last) ? last : (known[0]?.key ?? null));

  // Экраны одного проекта и общий выбор проектов согласованы (wireframes.md, 25.1): открыв проект,
  // выбор включает его; сменив выбор так, что проекта нет, переходим в первый выбранный.
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const single = /^\/projects\/([^/]+)\/(sprints|people|settings|issues)(\/|$)/.test(pathname);
  const lastKey = useRef<string | null>(null);
  const included = scope.projects.some((p) => p.key === key);
  const firstSelected = scope.projects[0]?.key;
  useEffect(() => {
    if (!ready || !single || !key) {
      lastKey.current = null;
      return;
    }
    if (lastKey.current !== key) {
      lastKey.current = key;
      if (!included) void choose(customPref([key]));
    } else if (!included && firstSelected) {
      const to = pathname
        .replace(`/projects/${key}/`, `/projects/${firstSelected}/`)
        .replace(/\/issues\/\d+$/, '/backlog');
      void navigate(to);
    }
  }, [ready, single, key, included, firstSelected, choose, navigate, pathname]);
  return (
    <header className="app-bar">
      <Link to="/" className="logo">
        <Logo />
      </Link>
      <nav aria-label="Портфель" className="portfolio-nav">
        <NavLink to="/portfolio" title="Сводка по проектам: активные спринты и риски">
          Портфель
        </NavLink>
      </nav>
      {shown && (
        <>
          <nav aria-label="Разделы проекта">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={`/projects/${shown}/${tab.to}`}
                title={tab.tip}
                className={({ isActive }) => (isActive || tab.also?.test(pathname) ? 'active' : '')}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </>
      )}
      <div className="spacer" />
      <button type="button" className="search" onClick={showQuick} title="Поиск: Ctrl+K">
        Поиск <kbd>Ctrl K</kbd>
      </button>
      <button
        type="button"
        className="help-button"
        onClick={showHelp}
        aria-label="Справка"
        title="Справка (?)"
      >
        ?
      </button>
      <UserMenu />
    </header>
  );
}
