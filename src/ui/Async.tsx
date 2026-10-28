import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';

/** Показывает загрузку, понятную ошибку или данные запроса. */
export function Async<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return <ErrorMessage message={query.error.message} onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}
