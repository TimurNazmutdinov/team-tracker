import { useQuery } from '@tanstack/react-query';
import { useStorage } from '../app/storage-context';

// Чтение данных: TanStack Query поверх модуля хранения. Ключи начинаются с имени сущности,
// чтобы после изменений можно было сбросить кэш целиком (invalidateQueries()).

export function useProjects() {
  const storage = useStorage();
  return useQuery({ queryKey: ['projects'], queryFn: () => storage.getProjects() });
}

export function useProject(key: string) {
  const storage = useStorage();
  return useQuery({ queryKey: ['project', key], queryFn: () => storage.getProject(key) });
}

export function useIssues(projectId: string) {
  const storage = useStorage();
  return useQuery({ queryKey: ['issues', projectId], queryFn: () => storage.getIssues(projectId) });
}

export function useIssue(projectId: string, number: number) {
  const storage = useStorage();
  return useQuery({
    queryKey: ['issue', projectId, number],
    queryFn: () => storage.getIssue(projectId, number),
  });
}

export function useSprints(projectId: string) {
  const storage = useStorage();
  return useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => storage.getSprints(projectId),
  });
}

export function usePeople() {
  const storage = useStorage();
  return useQuery({ queryKey: ['people'], queryFn: () => storage.getPeople() });
}
