import { Link } from 'react-router';
import { PageHeader } from './PageHeader';

export function NotFound({ what = 'Страница' }: { what?: string }) {
  return (
    <>
      <PageHeader title="Не найдено" />
      <p>{what} не найдена. Проверьте адрес или вернитесь к списку проектов.</p>
      <p>
        <Link to="/projects">К проектам</Link>
      </p>
    </>
  );
}
