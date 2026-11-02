import { useEffect, type ReactNode } from 'react';
import { ProjectFilter } from './ProjectFilter';

/**
 * Заголовок экрана; заодно выставляет заголовок вкладки браузера. `scope` добавляет под заголовком
 * строку с фильтром проектов — для экранов, у которых нет своей строки фильтров (wireframes.md, 25.1).
 */
export function PageHeader({
  title,
  scope = false,
  children,
}: {
  title: string;
  scope?: boolean;
  children?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} — team-tracker`;
  }, [title]);
  return (
    <>
      <header className="page-header">
        <h1>{title}</h1>
        {children}
      </header>
      {scope && (
        <div className="scope-row">
          <ProjectFilter />
        </div>
      )}
    </>
  );
}
