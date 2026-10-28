import { canHavePoints, isValidParent } from './hierarchy';
import type { Dataset } from './schema';

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup];
}

/** Проверки, которые схема Zod выразить не может: ссылки, иерархия, points, спринты, связи. */
export function checkIntegrity(ds: Dataset): string[] {
  const errors: string[] = [];
  const projects = new Set(ds.projects.map((p) => p.id));
  const people = new Set(ds.people.map((p) => p.id));
  const sprints = new Map(ds.sprints.map((s) => [s.id, s]));
  const issues = new Map(ds.issues.map((i) => [i.id, i]));

  const collections: [string, string[]][] = [
    ['projects', ds.projects.map((x) => x.id)],
    ['people', ds.people.map((x) => x.id)],
    ['sprints', ds.sprints.map((x) => x.id)],
    ['issues', ds.issues.map((x) => x.id)],
    ['links', ds.links.map((x) => x.id)],
    ['comments', ds.comments.map((x) => x.id)],
    ['history', ds.history.map((x) => x.id)],
  ];
  for (const [name, ids] of collections) {
    for (const id of duplicates(ids)) errors.push(`${name}: повторяющийся id ${id}`);
  }
  for (const key of duplicates(ds.issues.map((i) => `${i.projectId}#${i.number}`))) {
    errors.push(`issues: повторяющийся номер ${key}`);
  }

  for (const s of ds.sprints) {
    if (!projects.has(s.projectId)) errors.push(`sprint ${s.id}: нет проекта ${s.projectId}`);
    if (s.end < s.start) errors.push(`sprint ${s.id}: конец раньше начала`);
    if ((s.state === 'closed') !== (s.closedAt !== null)) {
      errors.push(`sprint ${s.id}: closedAt должен быть задан ровно у закрытого спринта`);
    }
  }
  for (const projectId of projects) {
    const active = ds.sprints.filter((s) => s.projectId === projectId && s.state === 'active');
    if (active.length > 1) errors.push(`project ${projectId}: активных спринтов ${active.length}`);
  }

  for (const i of ds.issues) {
    const w = `issue ${i.id}`;
    if (!projects.has(i.projectId)) errors.push(`${w}: нет проекта ${i.projectId}`);
    if (i.assigneeId !== null && !people.has(i.assigneeId))
      errors.push(`${w}: нет человека ${i.assigneeId}`);
    if (!people.has(i.reporterId)) errors.push(`${w}: нет человека ${i.reporterId}`);
    if (i.sprintId !== null && !sprints.has(i.sprintId))
      errors.push(`${w}: нет спринта ${i.sprintId}`);

    const parent = i.parentId === null ? null : issues.get(i.parentId);
    if (parent === undefined) {
      errors.push(`${w}: нет родителя ${String(i.parentId)}`);
    } else if (!isValidParent(i.type, parent?.type ?? null)) {
      errors.push(`${w} (${i.type}): недопустимый родитель типа ${parent?.type ?? 'нет'}`);
    } else if (parent && i.type === 'Sub-task' && parent.sprintId !== i.sprintId) {
      errors.push(`${w}: Sub-task должна быть в том же спринте, что и родитель ${parent.id}`);
    }
    if (i.points !== null && !canHavePoints(i.type)) {
      errors.push(`${w}: у ${i.type} points не ставятся`);
    }
  }

  const linkKeys = new Set<string>();
  for (const l of ds.links) {
    const w = `link ${l.id}`;
    const from = issues.get(l.fromId);
    const to = issues.get(l.toId);
    if (!from) errors.push(`${w}: нет задачи ${l.fromId}`);
    if (!to) errors.push(`${w}: нет задачи ${l.toId}`);
    if (l.fromId === l.toId) errors.push(`${w}: связь с самой собой`);
    if (from && to && from.projectId !== to.projectId)
      errors.push(`${w}: задачи из разных проектов`);
    const key = `${l.fromId}>${l.toId}:${l.type}`;
    if (linkKeys.has(key)) errors.push(`${w}: повтор связи`);
    linkKeys.add(key);
  }
  for (const c of ds.comments) {
    if (!issues.has(c.issueId)) errors.push(`comment ${c.id}: нет задачи ${c.issueId}`);
    if (!people.has(c.authorId)) errors.push(`comment ${c.id}: нет человека ${c.authorId}`);
  }
  for (const h of ds.history) {
    if (!issues.has(h.issueId)) errors.push(`history ${h.id}: нет задачи ${h.issueId}`);
    if (!people.has(h.authorId)) errors.push(`history ${h.id}: нет человека ${h.authorId}`);
  }
  return errors;
}
