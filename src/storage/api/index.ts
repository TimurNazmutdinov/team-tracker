import type { Changes } from '../../domain/changes';
import type { Comment, History, Issue, Link, Person, Project, Sprint } from '../../domain/schema';
import { StorageError, type StorageErrorCode, type TrackerStorage } from '../types';

const CODES: Record<number, StorageErrorCode> = {
  401: 'unauthorized',
  403: 'forbidden',
  409: 'conflict',
  422: 'invalid_data',
};

/**
 * Адаптер «позже» (ADR-001, ADR-010): те же методы, что у SeedLocal, но данные живут на сервере.
 * Сессия — httpOnly cookie, поэтому токена в коде нет. Все проверки сервер делает сам.
 */
export class ApiStorage implements TrackerStorage {
  constructor(
    private readonly base: string,
    /** Вызывается, когда сервер ответил 401: сессия кончилась, нужен повторный вход. */
    private readonly onUnauthorized: () => void = () => undefined,
  ) {}

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch {
      throw new StorageError('network', 'Нет связи с сервером');
    }
    if (res.status === 204) return undefined as T;
    if (res.status === 404 && method === 'GET') return null as T;
    const json = (await res.json().catch(() => null)) as {
      error?: { message?: string; details?: string[] };
    } | null;
    if (!res.ok) {
      if (res.status === 401) this.onUnauthorized();
      throw new StorageError(
        CODES[res.status] ?? 'write_failed',
        json?.error?.message ?? 'Ошибка сервера',
        json?.error?.details ?? [],
      );
    }
    return json as T;
  }

  getProjects() {
    return this.request<Project[]>('GET', '/projects');
  }

  async getProject(key: string) {
    const list = await this.getProjects();
    return list.find((p) => p.key === key) ?? null;
  }

  getPeople() {
    return this.request<Person[]>('GET', '/people');
  }

  getSprints(projectId: string) {
    return this.request<Sprint[]>('GET', `/projects/${projectId}/sprints`);
  }

  getIssues(projectId: string) {
    return this.request<Issue[]>('GET', `/projects/${projectId}/issues`);
  }

  getIssue(projectId: string, number: number) {
    return this.request<Issue | null>('GET', `/projects/${projectId}/issues/${number}`);
  }

  getLinks(projectId: string) {
    return this.request<Link[]>('GET', `/projects/${projectId}/links`);
  }

  getComments(issueId: string) {
    return this.request<Comment[]>('GET', `/issues/${issueId}/comments`);
  }

  getHistory(issueId: string) {
    return this.request<History[]>('GET', `/issues/${issueId}/history`);
  }

  getProjectHistory(projectId: string) {
    return this.request<History[]>('GET', `/projects/${projectId}/history`);
  }

  async commit(changes: Changes): Promise<void> {
    await this.request<undefined>('POST', '/commit', changes);
  }
}
