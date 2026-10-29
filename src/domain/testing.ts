import type { Changes } from './changes';
import type { Ctx, View } from './actions';
import type { Dataset } from './schema';

// Помощники для тестов логики: контекст с предсказуемыми значениями, применение изменений и
// проверка, что история воспроизводит состояние задач.

let sequence = 0;

/** Идентификаторы уникальны во всём наборе тестов, чтобы повторные действия не сталкивались. */
export function testCtx(now = '2026-10-29T10:00:00Z'): Ctx {
  return { now: () => now, newId: () => `t${++sequence}` };
}

export function viewOf(ds: Dataset, projectId = 'p1'): View {
  const project = ds.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('нет проекта');
  const ids = new Set(ds.issues.filter((i) => i.projectId === projectId).map((i) => i.id));
  return {
    projectId,
    project,
    people: ds.people,
    members: ds.members,
    sprints: ds.sprints.filter((s) => s.projectId === projectId),
    issues: ds.issues.filter((i) => i.projectId === projectId),
    links: ds.links.filter((l) => ids.has(l.fromId)),
  };
}

export function applyChanges(ds: Dataset, c: Changes): Dataset {
  const next = structuredClone(ds);
  const upsert = <T extends { id: string }>(target: T[], items?: T[]) => {
    for (const item of items ?? []) {
      const i = target.findIndex((x) => x.id === item.id);
      if (i === -1) target.push(structuredClone(item));
      else target[i] = structuredClone(item);
    }
  };
  upsert(next.projects, c.projects);
  upsert(next.members, c.members);
  upsert(next.sprints, c.sprints);
  upsert(next.issues, c.issues);
  upsert(next.links, c.links);
  const removed = new Set(c.deleteLinkIds ?? []);
  next.links = next.links.filter((l) => !removed.has(l.id));
  const removedMembers = new Set(c.deleteMemberIds ?? []);
  next.members = next.members.filter((m) => !removedMembers.has(m.id));
  next.comments.push(...(c.comments ?? []));
  next.history.push(...(c.history ?? []));
  return next;
}

/** Ошибки, если история не приводит к текущим статусу и спринту задач. */
export function replayErrors(ds: Dataset): string[] {
  const state = new Map<string, { status: string | null; sprintId: string | null }>();
  const events = ds.history
    .map((h, i) => ({ h, i }))
    .sort((a, b) => a.h.at.localeCompare(b.h.at) || a.i - b.i);
  for (const { h } of events) {
    const s = state.get(h.issueId) ?? { status: null, sprintId: null };
    if (h.field === 'created') s.status = h.to;
    if (h.field === 'status') s.status = h.to;
    if (h.field === 'sprintId') s.sprintId = h.to;
    state.set(h.issueId, s);
  }
  const errors: string[] = [];
  for (const i of ds.issues) {
    const s = state.get(i.id);
    if (!s) errors.push(`${i.id}: нет истории`);
    else if (s.status !== i.status)
      errors.push(`${i.id}: статус ${i.status}, по истории ${String(s.status)}`);
    else if (s.sprintId !== i.sprintId)
      errors.push(`${i.id}: спринт ${String(i.sprintId)}, по истории ${String(s.sprintId)}`);
  }
  return errors;
}
