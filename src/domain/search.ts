import type { View } from './actions';
import type { Issue, Project } from './schema';

// Поиск задач для командной палитры Ctrl+K (ADR-017): по ключу и тексту среди выбранных проектов.

export interface SearchHit {
  issue: Issue;
  project: Project;
  /** Ключ задачи, например DEMO-12. */
  key: string;
  /** Чем выше, тем лучше совпадение. */
  score: number;
}

export const SEARCH_LIMIT = 8;

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/**
 * Оценка совпадения: 100 — ключ целиком (DEMO-12), 90 — только номер (12), 80 — начало ключа или
 * номера, 60 — начало слова в названии, 40 — вхождение в название, 20 — вхождение в описание.
 * 0 — не подходит. Все слова запроса должны совпасть хотя бы в названии или описании.
 */
export function scoreIssue(issue: Issue, key: string, query: string): number {
  const q = norm(query.trim());
  if (q === '') return 0;
  const k = norm(key);
  const number = String(issue.number);
  if (k === q) return 100;
  if (/^\d+$/.test(q) && number === q) return 90;
  if (k.startsWith(q) || (/^\d+$/.test(q) && number.startsWith(q))) return 80;

  const title = norm(issue.title);
  const text = `${title} ${norm(issue.description)}`;
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.every((w) => text.includes(w) || k.includes(w))) return 0;
  const startsWord = words.every((w) =>
    title.split(/[\s\-_/.,:;()]+/).some((t) => t.startsWith(w)),
  );
  if (startsWord) return 60;
  if (words.every((w) => title.includes(w))) return 40;
  return 20;
}

/** Лучшие совпадения среди задач проектов; при равных оценках — новее (больший номер) выше. */
export function searchIssues(views: View[], query: string, limit = SEARCH_LIMIT): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const view of views) {
    for (const issue of view.issues) {
      const key = `${view.project.key}-${issue.number}`;
      const score = scoreIssue(issue, key, query);
      if (score > 0) hits.push({ issue, project: view.project, key, score });
    }
  }
  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.project.key.localeCompare(b.project.key) ||
        b.issue.number - a.issue.number,
    )
    .slice(0, limit);
}
