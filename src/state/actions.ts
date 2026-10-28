import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useStorage } from '../app/storage-context';
import {
  addComment,
  addLink,
  createIssue,
  createProject,
  moveIssue,
  removeLink,
  updateIssue,
  type Ctx,
  type IssuePatch,
  type NewIssueInput,
  type Result,
  type View,
} from '../domain/actions';
import type { Changes } from '../domain/changes';
import type { LinkType } from '../domain/schema';
import { updateSprintSettings, type SprintSettings } from '../domain/settings';
import {
  closeSprint,
  createSprint,
  startSprint,
  updateSprint,
  type CloseTarget,
  type SprintInput,
} from '../domain/sprints';
import { StorageError, type TrackerStorage } from '../storage';
import { resolveAuthor, useUserStore } from './current-user';
import { useSession } from './session';

export const browserCtx: Ctx = {
  now: () => new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  newId: () => crypto.randomUUID(),
};

function hasChanges(c: Changes): boolean {
  return Object.values(c).some((v) => Array.isArray(v) && v.length > 0);
}

function errorResult(e: unknown): Result {
  if (e instanceof StorageError) {
    return { ok: false, errors: { form: [e.message, ...e.details].join(': ') } };
  }
  return { ok: false, errors: { form: e instanceof Error ? e.message : 'Неизвестная ошибка' } };
}

async function loadView(storage: TrackerStorage, projectId: string): Promise<View> {
  const [project, people, sprints, issues, links] = await Promise.all([
    storage.getProjects().then((list) => list.find((p) => p.id === projectId)),
    storage.getPeople(),
    storage.getSprints(projectId),
    storage.getIssues(projectId),
    storage.getLinks(projectId),
  ]);
  if (!project) throw new Error('Проект не найден');
  return { projectId, project, people, sprints, issues, links };
}

/** Действия над задачами проекта: логика (domain) → хранилище → обновление кэша запросов. */
export function useActions(projectId: string) {
  const storage = useStorage();
  const queryClient = useQueryClient();
  const userId = useUserStore((s) => s.userId);

  return useMemo(() => {
    const run = async (build: (view: View, authorId: string) => Result): Promise<Result> => {
      try {
        const view = await loadView(storage, projectId);
        const author = resolveAuthor(
          view.people,
          useSession.getState().account?.id ?? null,
          userId,
        );
        if (!author)
          return { ok: false, errors: { form: 'Не найден пользователь для записи действий' } };
        const result = build(view, author.id);
        if (result.ok && hasChanges(result.changes)) {
          await storage.commit(result.changes);
          await queryClient.invalidateQueries();
        }
        return result;
      } catch (e) {
        return errorResult(e);
      }
    };
    return {
      createIssue: (input: NewIssueInput) => run((v, a) => createIssue(v, input, a, browserCtx)),
      updateIssue: (id: string, patch: IssuePatch) =>
        run((v, a) => updateIssue(v, id, patch, a, browserCtx)),
      moveIssue: (id: string, target: { sprintId: string | null; index: number }) =>
        run((v, a) => moveIssue(v, id, target, a, browserCtx)),
      addLink: (fromId: string, toId: string, type: LinkType) =>
        run((v) => addLink(v, fromId, toId, type, browserCtx)),
      createSprint: (input: SprintInput) => run((v) => createSprint(v, input, browserCtx)),
      updateSprint: (id: string, patch: Partial<SprintInput>) =>
        run((v) => updateSprint(v, id, patch, browserCtx)),
      startSprint: (id: string) => run((v) => startSprint(v, id)),
      closeSprint: (id: string, target: CloseTarget) =>
        run((v, a) => closeSprint(v, id, target, a, browserCtx)),
      updateSprintSettings: (input: SprintSettings) =>
        run((v) => updateSprintSettings(v, input, browserCtx)),
      removeLink: (linkId: string) => run((v) => removeLink(v, linkId)),
      addComment: (issueId: string, text: string) =>
        run((v, a) => addComment(v, issueId, a, text, browserCtx)),
    };
  }, [storage, queryClient, projectId, userId]);
}

/** Создание проекта (F-01). */
export function useProjectActions() {
  const storage = useStorage();
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      createProject: async (input: { key: string; name: string }): Promise<Result> => {
        try {
          const result = createProject(await storage.getProjects(), input, browserCtx);
          if (result.ok) {
            await storage.commit(result.changes);
            await queryClient.invalidateQueries();
          }
          return result;
        } catch (e) {
          return errorResult(e);
        }
      },
    }),
    [storage, queryClient],
  );
}
