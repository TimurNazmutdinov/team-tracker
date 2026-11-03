import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useStorage } from '../app/storage-context';
import {
  addComment,
  addLink,
  createIssueWithLinks,
  createProject,
  moveIssue,
  removeLink,
  updateIssue,
  type Ctx,
  type IssuePatch,
  type NewIssueInput,
  type NewLink,
  type Result,
  type View,
} from '../domain/actions';
import {
  addAbsence,
  deleteAbsence,
  updateAbsence,
  type AbsenceInput,
} from '../domain/availability';
import { updateDod } from '../domain/dod';
import { addRetroItem, deleteRetroItem, retroToIssue, type RetroInput } from '../domain/retro';
import { bulkUpdate, type BulkPatch } from '../domain/bulk';
import type { Changes } from '../domain/changes';
import { addMember, removeMember, setMemberRole, setOwner } from '../domain/members';
import {
  archiveProject,
  deleteProject,
  restoreProject,
  updateProject,
  type ProjectEdit,
} from '../domain/projects';
import { rolesChanges, type RolesResult } from '../domain/roles';
import type { LinkType, Project, ProjectRole, RoleDef } from '../domain/schema';
import { updateSprintSettings, type SprintSettings } from '../domain/settings';
import {
  closeSprint,
  createSprint,
  createSprintSeries,
  startSprint,
  updateSprint,
  type CloseTarget,
  type SprintInput,
} from '../domain/sprints';
import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
  type TemplateInput,
} from '../domain/templates';
import { updateWipSettings, type WipInput } from '../domain/wip';
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
  const [project, people, members, templates, absences, retroItems, sprints, issues, links] =
    await Promise.all([
      storage.getProjects().then((list) => list.find((p) => p.id === projectId)),
      storage.getPeople(),
      storage.getMembers(),
      storage.getTemplates(),
      storage.getAbsences(),
      storage.getRetroItems(projectId),
      storage.getSprints(projectId),
      storage.getIssues(projectId),
      storage.getLinks(projectId),
    ]);
  if (!project) throw new Error('Проект не найден');
  return {
    projectId,
    project,
    people,
    members,
    templates,
    absences,
    retroItems,
    sprints,
    issues,
    links,
  };
}

/** Действия над задачами проекта: логика (domain) → хранилище → обновление кэша запросов. */
function makeActions(
  storage: TrackerStorage,
  queryClient: QueryClient,
  userId: string | null,
  projectId: string,
) {
  const run = async (build: (view: View, authorId: string) => Result): Promise<Result> => {
    try {
      const view = await loadView(storage, projectId);
      const author = resolveAuthor(view.people, useSession.getState().account?.id ?? null, userId);
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
    createIssue: (input: NewIssueInput, links: NewLink[] = []) =>
      run((v, a) => createIssueWithLinks(v, input, links, a, browserCtx)),
    updateIssue: (id: string, patch: IssuePatch) =>
      run((v, a) => updateIssue(v, id, patch, a, browserCtx)),
    moveIssue: (id: string, target: { sprintId: string | null; index: number }) =>
      run((v, a) => moveIssue(v, id, target, a, browserCtx)),
    addLink: (fromId: string, toId: string, type: LinkType) =>
      run((v) => addLink(v, fromId, toId, type, browserCtx)),
    createSprint: (input: SprintInput) => run((v) => createSprint(v, input, browserCtx)),
    createSprintSeries: (count: number) =>
      run((v) => createSprintSeries(v, count, new Date().toISOString().slice(0, 10), browserCtx)),
    updateSprint: (id: string, patch: Partial<SprintInput>) =>
      run((v) => updateSprint(v, id, patch, browserCtx)),
    startSprint: (id: string) => run((v) => startSprint(v, id)),
    closeSprint: (id: string, target: CloseTarget) =>
      run((v, a) => closeSprint(v, id, target, a, browserCtx)),
    updateSprintSettings: (input: SprintSettings) =>
      run((v) => updateSprintSettings(v, input, browserCtx)),
    removeLink: (linkId: string) => run((v) => removeLink(v, linkId)),
    addMember: (personId: string, role: ProjectRole) =>
      run((v) => addMember(v, { personId, role }, browserCtx)),
    setMemberRole: (memberId: string, role: ProjectRole) =>
      run((v) => setMemberRole(v, memberId, role)),
    removeMember: (memberId: string) => run((v) => removeMember(v, memberId)),
    setOwner: (personId: string | null) => run((v) => setOwner(v, personId, browserCtx)),
    bulkUpdate: (ids: string[], patch: BulkPatch) =>
      run((v, a) => bulkUpdate(v, ids, patch, a, browserCtx)),
    addAbsence: (input: AbsenceInput) => run((v) => addAbsence(v, input, browserCtx)),
    updateAbsence: (id: string, input: AbsenceInput) => run((v) => updateAbsence(v, id, input)),
    deleteAbsence: (id: string) => run((v) => deleteAbsence(v, id)),
    updateDod: (dod: string) => run((v) => updateDod(v, dod)),
    addRetroItem: (input: RetroInput) => run((v, a) => addRetroItem(v, input, a, browserCtx)),
    deleteRetroItem: (id: string) => run((v) => deleteRetroItem(v, id)),
    retroToIssue: (id: string) => run((v, a) => retroToIssue(v, id, a, browserCtx)),
    createTemplate: (input: TemplateInput) => run((v) => createTemplate(v, input, browserCtx)),
    updateTemplate: (id: string, input: TemplateInput) => run((v) => updateTemplate(v, id, input)),
    deleteTemplate: (id: string) => run((v) => deleteTemplate(v, id)),
    updateWipSettings: (input: WipInput) => run((v) => updateWipSettings(v, input)),
    addComment: (issueId: string, text: string) =>
      run((v, a) => addComment(v, issueId, a, text, browserCtx)),
  };
}

export function useActions(projectId: string) {
  const storage = useStorage();
  const queryClient = useQueryClient();
  const userId = useUserStore((s) => s.userId);
  return useMemo(
    () => makeActions(storage, queryClient, userId, projectId),
    [storage, queryClient, projectId, userId],
  );
}

/** Действия для задач любого проекта: нужны там, где на одном экране несколько проектов (ADR-016). */
export function useActionsFor() {
  const storage = useStorage();
  const queryClient = useQueryClient();
  const userId = useUserStore((s) => s.userId);
  return useMemo(
    () => (projectId: string) => makeActions(storage, queryClient, userId, projectId),
    [storage, queryClient, userId],
  );
}

/** Роли и права (ADR-021): сохранение таблицы ролей одним набором изменений. */
export function useRoleActions() {
  const storage = useStorage();
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      saveRoles: async (current: RoleDef[], draft: RoleDef[]): Promise<RolesResult> => {
        const result = rolesChanges(current, draft, () => browserCtx.newId());
        if (!result.ok) return result;
        const { roles, deleteRoleIds } = result.changes;
        if (roles.length === 0 && deleteRoleIds.length === 0) return result;
        try {
          await storage.commit({ roles, deleteRoleIds });
          await queryClient.invalidateQueries();
          return result;
        } catch (e) {
          const message = errorResult(e);
          return {
            ok: false,
            errors: { form: message.ok ? 'Неизвестная ошибка' : (message.errors['form'] ?? '') },
          };
        }
      },
    }),
    [storage, queryClient],
  );
}

/** Создание проекта (F-01). */
export function useProjectActions() {
  const storage = useStorage();
  const queryClient = useQueryClient();
  return useMemo(() => {
    /** Читает проекты, строит изменения логикой и сохраняет одним набором. */
    const commit = async (build: (projects: Project[]) => Result | Promise<Result>) => {
      try {
        const result = await build(await storage.getProjects());
        if (result.ok && hasChanges(result.changes)) {
          await storage.commit(result.changes);
          await queryClient.invalidateQueries();
        }
        return result;
      } catch (e) {
        return errorResult(e);
      }
    };
    const find = (projects: Project[], id: string): Project | undefined =>
      projects.find((p) => p.id === id);
    const missing: Result = { ok: false, errors: { form: 'Проект не найден' } };
    return {
      createProject: (input: { key: string; name: string; ownerId?: string | null }) =>
        commit((projects) => createProject(projects, input, browserCtx)),
      updateProject: (id: string, input: ProjectEdit) =>
        commit((projects) => updateProject(projects, id, input)),
      archiveProject: (id: string) =>
        commit((projects) => {
          const project = find(projects, id);
          return project ? archiveProject(project, browserCtx.now()) : missing;
        }),
      restoreProject: (id: string) =>
        commit((projects) => {
          const project = find(projects, id);
          return project ? restoreProject(project) : missing;
        }),
      deleteProject: (id: string) =>
        commit(async (projects) => {
          const project = find(projects, id);
          if (!project) return missing;
          const issues = await storage.getIssues(id);
          return deleteProject(project, issues.length);
        }),
    };
  }, [storage, queryClient]);
}
