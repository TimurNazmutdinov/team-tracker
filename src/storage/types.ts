import type {
  Comment,
  Dataset,
  History,
  Issue,
  Link,
  Person,
  Project,
  Sprint,
} from '../domain/schema';

/**
 * Единственный путь к данным (ADR-001). Экраны и логика знают только этот интерфейс;
 * реализации — SeedLocal (seed.json + браузер) сейчас и Api (Fastify + PostgreSQL) позже.
 */
export interface TrackerStorage {
  getProjects(): Promise<Project[]>;
  getProject(key: string): Promise<Project | null>;
  getPeople(): Promise<Person[]>;
  getSprints(projectId: string): Promise<Sprint[]>;
  getIssues(projectId: string): Promise<Issue[]>;
  getIssue(projectId: string, number: number): Promise<Issue | null>;
  getLinks(projectId: string): Promise<Link[]>;
  getComments(issueId: string): Promise<Comment[]>;
  getHistory(issueId: string): Promise<History[]>;

  /** Атомарно применяет изменения: либо всё, либо ничего. */
  commit(changes: Changes): Promise<void>;

  /** Демо-режим: вернуть данные к исходным. Нет у серверных реализаций. */
  reset?(): Promise<void>;
}

/**
 * Набор изменений для commit. Записи issues, sprints, links, projects и people добавляются или
 * заменяются по id; comments и history только добавляются (запись с существующим id — конфликт).
 */
export interface Changes {
  projects?: Project[];
  people?: Person[];
  sprints?: Sprint[];
  issues?: Issue[];
  links?: Link[];
  deleteLinkIds?: string[];
  comments?: Comment[];
  history?: History[];
}

export type StorageErrorCode = 'invalid_data' | 'conflict' | 'write_failed';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly details: string[];

  constructor(code: StorageErrorCode, message: string, details: string[] = []) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.details = details;
  }
}

export type { Dataset };
