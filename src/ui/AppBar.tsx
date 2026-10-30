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
  { to: 'backlog', label: 'Бэклог', tip: 'Планирование спринтов: спринты и общий бэклог' },
  { to: 'board', label: 'Доска', tip: 'Доска текущего спринта по статусам' },
  { to: 'sprints', label: 'Спринты', tip: 'Список спринтов, цели, запуск и закрытие' },
  { to: 'reports', label: 'Отчёты', tip: 'Burndown и velocity по спринтам' },
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
  const known = projects.data ?? [];
  const shown = key ?? (known.some((p) => p.key === last) ? last : (known[0]?.key ?? null));
  return (
    <header className="app-bar">
      <Link to="/" className="logo">
        <Logo />
      </Link>
      <nav aria-label="Портфель" className="portfolio-nav">
        <NavLink to="/portfolio" title="Сводка по проектам: активные спринты и риски">
          Портфель
        </NavLink>
        <NavLink to="/analytics" title="Поток, время цикла, нагрузка и дорожная карта эпиков">
          Аналитика
        </NavLink>
      </nav>
      {shown && (
        <>
          <ProjectSwitcher current={shown} />
          <nav aria-label="Разделы проекта">
            {TABS.map((tab) => (
              <NavLink key={tab.to} to={`/projects/${shown}/${tab.to}`} title={tab.tip}>
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
