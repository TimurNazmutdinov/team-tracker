import { Link, NavLink, useParams } from 'react-router';
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
  return (
    <header className="app-bar">
      <Link to="/" className="logo">
        <Logo />
      </Link>
      <nav aria-label="Портфель" className="portfolio-nav">
        <NavLink to="/portfolio">Портфель</NavLink>
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
      <button type="button" className="search" disabled title="Поиск появится на этапе 4">
        Поиск <kbd>/</kbd>
      </button>
      <UserMenu />
    </header>
  );
}
