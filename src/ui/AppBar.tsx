import { Link, NavLink, useParams } from 'react-router';
import { useQuick } from '../state/quick';
import { Logo } from './Logo';
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
  return (
    <header className="app-bar">
      <Link to="/" className="logo">
        <Logo />
      </Link>
      <nav aria-label="Портфель" className="portfolio-nav">
        <NavLink to="/portfolio">Портфель</NavLink>
        <NavLink to="/analytics">Аналитика</NavLink>
      </nav>
      {key && (
        <>
          <Link to="/projects" className="project-chip" title="Все проекты">
            {key} ▾
          </Link>
          <nav aria-label="Разделы проекта">
            {TABS.map((tab) => (
              <NavLink key={tab.to} to={`/projects/${key}/${tab.to}`}>
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
      <UserMenu />
    </header>
  );
}
