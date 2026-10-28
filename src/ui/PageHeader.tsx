import { useEffect, type ReactNode } from 'react';

/** Заголовок экрана; заодно выставляет заголовок вкладки браузера. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — team-tracker`;
  }, [title]);
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children}
    </header>
  );
}
