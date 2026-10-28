import { Navigate, type RouteObject } from 'react-router';
import { BacklogPage } from '../modules/backlog/BacklogPage';
import { BoardPage } from '../modules/board/BoardPage';
import { PeoplePage } from '../modules/people/PeoplePage';
import { HomePage, ProjectsPage } from '../modules/projects/ProjectsPage';
import { ProjectRoute } from '../modules/projects/ProjectRoute';
import { SettingsPage } from '../modules/projects/SettingsPage';
import { ReportsPage } from '../modules/reports/ReportsPage';
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
      {
        path: 'projects/:key',
        element: <ProjectRoute />,
        children: [
          { index: true, element: <Navigate to="backlog" replace /> },
          { path: 'backlog', element: <BacklogPage /> },
          { path: 'board', element: <BoardPage /> },
          { path: 'sprints', element: <SprintsPage /> },
          { path: 'sprints/:id', element: <SprintsPage /> },
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
