import { useQueries, useQuery } from '@tanstack/react-query';
import { useStorage } from '../app/storage-context';
import type { View } from '../domain/actions';
import type { History, Project } from '../domain/schema';

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

export function useMembers() {
  const storage = useStorage();
  return useQuery({ queryKey: ['members'], queryFn: () => storage.getMembers() });
}

export function useTemplates() {
  const storage = useStorage();
  return useQuery({ queryKey: ['templates'], queryFn: () => storage.getTemplates() });
}

export function useAbsences() {
  const storage = useStorage();
  return useQuery({ queryKey: ['absences'], queryFn: () => storage.getAbsences() });
}

export function useRetroItems(projectId: string) {
  const storage = useStorage();
  return useQuery({
    queryKey: ['retro', projectId],
    queryFn: () => storage.getRetroItems(projectId),
  });
}

export function useLinks(projectId: string) {
  const storage = useStorage();
  return useQuery({ queryKey: ['links', projectId], queryFn: () => storage.getLinks(projectId) });
}

export function useComments(issueId: string) {
  const storage = useStorage();
  return useQuery({ queryKey: ['comments', issueId], queryFn: () => storage.getComments(issueId) });
}

export function useProjectHistory(projectId: string) {
  const storage = useStorage();
  return useQuery({
    queryKey: ['project-history', projectId],
    queryFn: () => storage.getProjectHistory(projectId),
  });
}

export function useHistory(issueId: string) {
  const storage = useStorage();
  return useQuery({ queryKey: ['history', issueId], queryFn: () => storage.getHistory(issueId) });
}

/** Данные проекта целиком для логики; undefined, пока что-то загружается. */
export function useView(projectId: string): View | undefined {
  const projects = useProjects();
  const people = usePeople();
  const members = useMembers();
  const templates = useTemplates();
  const absences = useAbsences();
  const retro = useRetroItems(projectId);
  const sprints = useSprints(projectId);
  const issues = useIssues(projectId);
  const links = useLinks(projectId);
  const project = projects.data?.find((p) => p.id === projectId);
  if (
    !project ||
    !people.data ||
    !members.data ||
    !templates.data ||
    !absences.data ||
    !retro.data ||
    !sprints.data ||
    !issues.data ||
    !links.data
  )
    return undefined;
  return {
    projectId,
    project,
    people: people.data,
    members: members.data,
    templates: templates.data,
    absences: absences.data,
    retroItems: retro.data,
    sprints: sprints.data,
    issues: issues.data,
    links: links.data,
  };
}

/**
 * Данные нескольких проектов для логики; undefined, пока что-то загружается. Ключи запросов те же,
 * что у экранов одного проекта, поэтому кэш общий (ADR-016).
 */
export function useProjectViews(projects: Project[]): View[] | undefined {
  const storage = useStorage();
  const people = usePeople();
  const members = useMembers();
  const templates = useTemplates();
  const absences = useAbsences();
  const results = useQueries({
    queries: projects.flatMap((p) => [
      { queryKey: ['sprints', p.id], queryFn: () => storage.getSprints(p.id) },
      { queryKey: ['issues', p.id], queryFn: () => storage.getIssues(p.id) },
      { queryKey: ['links', p.id], queryFn: () => storage.getLinks(p.id) },
    ]),
  });
  if (!people.data || !members.data || !templates.data || !absences.data) return undefined;
  const views: View[] = [];
  for (const [n, project] of projects.entries()) {
    const sprints = results[n * 3]?.data;
    const issues = results[n * 3 + 1]?.data;
    const links = results[n * 3 + 2]?.data;
    if (!sprints || !issues || !links) return undefined;
    views.push({
      projectId: project.id,
      project,
      people: people.data,
      members: members.data,
      templates: templates.data,
      absences: absences.data,
      // ретроспективы нужны только экранам одного проекта (useView)
      retroItems: [],
      sprints: sprints as View['sprints'],
      issues: issues as View['issues'],
      links: links as View['links'],
    });
  }
  return views;
}

/** История задач нескольких проектов по проектам; undefined, пока что-то загружается. */
export function useProjectHistories(projects: Project[]): Map<string, History[]> | undefined {
  const storage = useStorage();
  const results = useQueries({
    queries: projects.map((p) => ({
      queryKey: ['project-history', p.id],
      queryFn: () => storage.getProjectHistory(p.id),
    })),
  });
  const map = new Map<string, History[]>();
  for (const [n, project] of projects.entries()) {
    const data = results[n]?.data;
    if (!data) return undefined;
    map.set(project.id, data);
  }
  return map;
}
