import { Navigate, type RouteObject } from 'react-router';
import { AboutPage } from '../modules/about/AboutPage';
import { BacklogPage } from '../modules/backlog/BacklogPage';
import { BoardPage } from '../modules/board/BoardPage';
import { HistoryPage } from '../modules/board/HistoryPage';
import { PeoplePage } from '../modules/people/PeoplePage';
import { PortfolioPage } from '../modules/portfolio/PortfolioPage';
import { HomePage, ProjectsPage } from '../modules/projects/ProjectsPage';
import { ProjectRoute } from '../modules/projects/ProjectRoute';
import { SettingsPage } from '../modules/projects/SettingsPage';
import { ReportsPage } from '../modules/reports/ReportsPage';
import { AnalyticsPage } from '../modules/analytics/AnalyticsPage';
import { SprintReportPage } from '../modules/sprints/SprintReportPage';
import { SprintsPage } from '../modules/sprints/SprintsPage';
import { IssuePage } from '../modules/tasks/IssuePage';
import { Layout } from '../ui/Layout';
import { NotFound } from '../ui/NotFound';
import { RouteError } from '../ui/RouteError';

// Адреса экранов: docs/wireframes.md, раздел 2.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'portfolio', element: <PortfolioPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      {
        path: 'projects/:key',
        element: <ProjectRoute />,
        children: [
          { index: true, element: <Navigate to="backlog" replace /> },
          { path: 'backlog', element: <BacklogPage /> },
          { path: 'board', element: <BoardPage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'sprints', element: <SprintsPage /> },
          { path: 'sprints/:id', element: <SprintsPage /> },
          { path: 'sprints/:id/report', element: <SprintReportPage /> },
          { path: 'issues/:number', element: <IssuePage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'people', element: <PeoplePage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
