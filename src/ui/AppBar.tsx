import { useEffect } from 'react';
import { Link, NavLink, useParams } from 'react-router';
import { useHelp } from '../state/help';
import { useLastProject } from '../state/last-project';
import { useProjects } from '../state/queries';
import { useQuick } from '../state/quick';
import { Logo } from './Logo';
import { ProjectSwitcher } from './ProjectSwitcher';
import { UserMenu } from './UserMenu';

const TABS = [
  { to: 'backlog', label: 'Бэклог' },
  { to: 'board', label: 'Доска' },
  { to: 'sprints', label: 'Спринты' },
  { to: 'reports', label: 'Отчёты' },
  { to: 'people', label: 'Люди' },
  { to: 'settings', label: 'Настройки' },
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
  const known = projects.data ?? [];
  const shown = key ?? (known.some((p) => p.key === last) ? last : (known[0]?.key ?? null));
  return (
    <header className="app-bar">
      <Link to="/" className="logo">
        <Logo />
      </Link>
      <nav aria-label="Портфель" className="portfolio-nav">
        <NavLink to="/portfolio">Портфель</NavLink>
        <NavLink to="/analytics">Аналитика</NavLink>
      </nav>
      {shown && (
        <>
          <ProjectSwitcher current={shown} />
          <nav aria-label="Разделы проекта">
            {TABS.map((tab) => (
              <NavLink key={tab.to} to={`/projects/${shown}/${tab.to}`}>
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
