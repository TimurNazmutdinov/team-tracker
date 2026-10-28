import type { Changes } from '../domain/changes';
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
  /** История всех задач проекта (для итогов закрытых спринтов и отчётов). */
  getProjectHistory(projectId: string): Promise<History[]>;

  /** Атомарно применяет изменения: либо всё, либо ничего. */
  commit(changes: Changes): Promise<void>;

  /** Демо-режим: сообщение о сбросе сохранённых данных при запуске (отдаётся один раз). */
  takeStartupNotice?(): string | null;

  /** Демо-режим: вернуть данные к исходным. Нет у серверных реализаций. */
  reset?(): Promise<void>;
}

export type StorageErrorCode =
  'invalid_data' | 'conflict' | 'write_failed' | 'forbidden' | 'unauthorized' | 'network';

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

export type { Changes, Dataset };
