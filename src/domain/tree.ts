import type { Issue } from './schema';

// Иерархия артефактов (ADR-003, п. 6): Epic → Story, Task, Bug → Sub-task. Общие правила показа
// вложенности для всех списков продукта (wireframes.md, 25.2).

export interface TreeRow {
  issue: Issue;
  /** 0 — корень, 1 — задача эпика, 2 — подзадача и т. д. */
  depth: number;
  /** Сколько прямых потомков в этом списке (с учётом свёрнутых). */
  children: number;
  /** Строка добавлена как родитель: самой задачи в списке нет, но у неё есть потомки в списке. */
  context: boolean;
}

/**
 * Строки списка с вложенностью. Потомок идёт сразу под родителем; порядок соседей — как в `items`.
 * Если родителя нет в списке, но он есть среди `all`, он добавляется строкой-контекстом (`context`),
 * чтобы вложенность была понятна. Свёрнутые задачи прячут потомков. Задача без родителя — корень.
 */
export function treeRows(
  items: readonly Issue[],
  options: { all?: readonly Issue[]; collapsed?: ReadonlySet<string> } = {},
): TreeRow[] {
  const byId = new Map((options.all ?? items).map((i) => [i.id, i]));
  const own = new Set(items.map((i) => i.id));
  const nodes = new Map<string, Issue>(items.map((i) => [i.id, i]));
  // родители вне списка добавляются как контекст
  const contextIds = new Set<string>();
  for (const issue of items) {
    let parent = issue.parentId === null ? undefined : byId.get(issue.parentId);
    let guard = 0;
    while (parent && !nodes.has(parent.id) && guard++ < 5) {
      nodes.set(parent.id, parent);
      contextIds.add(parent.id);
      parent = parent.parentId === null ? undefined : byId.get(parent.parentId);
    }
  }
  const order = [...nodes.keys()];
  const kids = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of order) {
    const parentId = nodes.get(id)?.parentId ?? null;
    if (parentId !== null && nodes.has(parentId)) {
      const list = kids.get(parentId) ?? [];
      list.push(id);
      kids.set(parentId, list);
    } else roots.push(id);
  }
  // контекст идёт в порядке появления его первого потомка в items
  const firstSeen = new Map<string, number>();
  items.forEach((issue, n) => {
    let current: Issue | undefined = issue;
    let guard = 0;
    while (current && guard++ < 6) {
      if (!firstSeen.has(current.id)) firstSeen.set(current.id, n);
      current = current.parentId === null ? undefined : nodes.get(current.parentId);
    }
  });
  const byFirst = (a: string, b: string) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0);
  roots.sort(byFirst);
  for (const list of kids.values()) list.sort(byFirst);

  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    const issue = nodes.get(id);
    if (!issue || seen.has(id)) return;
    seen.add(id);
    const children = kids.get(id) ?? [];
    rows.push({ issue, depth, children: children.length, context: !own.has(id) });
    if (options.collapsed?.has(id)) return;
    for (const child of children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return rows;
}

/** Предки задачи от верхнего (эпик) до родителя. */
export function ancestors(issue: Issue, all: readonly Issue[]): Issue[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  const path: Issue[] = [];
  let current = issue.parentId === null ? undefined : byId.get(issue.parentId);
  while (current && path.length < 6) {
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}

/** Все потомки задачи (подзадачи, задачи эпика) в порядке списка. */
export function descendants(issue: Issue, all: readonly Issue[]): Issue[] {
  const out: Issue[] = [];
  const queue = [issue.id];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const i of all) {
      if (i.parentId === id && !seen.has(i.id)) {
        seen.add(i.id);
        out.push(i);
        queue.push(i.id);
      }
    }
  }
  return out;
}
