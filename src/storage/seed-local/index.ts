import { parseDataset } from '../../domain/dataset';
import type { Dataset } from '../../domain/schema';
import { StorageError, type Changes, type TrackerStorage } from '../types';

/** Минимальный интерфейс хранилища ключ-значение; под него подходит window.localStorage. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'team-tracker:data';
const FORMAT = 1;

export const OUTDATED_NOTICE = 'Демо-данные обновились: сохранённые в браузере изменения сброшены.';

interface Stored {
  format: number;
  data: unknown;
}

function invalid(what: string, errors: string[]): StorageError {
  return new StorageError('invalid_data', `${what}: данные неверны`, errors);
}

/** Сохранённые данные; `outdated` — они от другой версии seed.json и должны быть сброшены. */
function readStored(kv: KeyValueStore, seedVersion: number): Dataset | 'outdated' | null {
  const raw = kv.getItem(STORAGE_KEY);
  if (raw === null) return null;
  let envelope: Partial<Stored>;
  try {
    envelope = JSON.parse(raw) as Partial<Stored>;
  } catch {
    throw new StorageError('invalid_data', 'Сохранённые данные повреждены', [
      'не удалось прочитать JSON',
    ]);
  }
  if (typeof envelope !== 'object' || envelope === null || envelope.format !== FORMAT) {
    throw new StorageError('invalid_data', 'Сохранённые данные имеют неизвестный формат', [
      `ожидался format = ${FORMAT}`,
    ]);
  }
  const version = (envelope.data as { version?: unknown } | null | undefined)?.version;
  if (version !== seedVersion) return 'outdated';
  const parsed = parseDataset(envelope.data);
  if (!parsed.ok) throw invalid('Сохранённые данные', parsed.errors);
  return parsed.data;
}

/** Удаляет сохранённые изменения; нужна, когда сохранённые данные повреждены и приложение не стартует. */
export function clearStoredData(kv: KeyValueStore): void {
  kv.removeItem(STORAGE_KEY);
}

function upsert<T extends { id: string }>(target: T[], items: T[] | undefined): void {
  for (const item of items ?? []) {
    const i = target.findIndex((x) => x.id === item.id);
    if (i === -1) target.push(structuredClone(item));
    else target[i] = structuredClone(item);
  }
}

function append<T extends { id: string }>(name: string, target: T[], items: T[] | undefined): void {
  for (const item of items ?? []) {
    if (target.some((x) => x.id === item.id)) {
      throw new StorageError(
        'conflict',
        `${name}: запись ${item.id} уже существует, записи только добавляются`,
      );
    }
    target.push(structuredClone(item));
  }
}

/**
 * Адаптер «сейчас»: исходные данные из seed.json, изменения — в браузере (localStorage).
 * Seed и сохранённые данные проверяются при загрузке (структура и целостность).
 */
export class SeedLocalStorage implements TrackerStorage {
  private constructor(
    private readonly seed: Dataset,
    private data: Dataset,
    private readonly kv: KeyValueStore,
    private startupNotice: string | null,
  ) {}

  static open(seedRaw: unknown, kv: KeyValueStore): Promise<SeedLocalStorage> {
    try {
      const seed = parseDataset(seedRaw);
      if (!seed.ok) throw invalid('seed.json', seed.errors);
      const stored = readStored(kv, seed.data.version);
      if (stored === 'outdated') {
        clearStoredData(kv);
        return Promise.resolve(new SeedLocalStorage(seed.data, seed.data, kv, OUTDATED_NOTICE));
      }
      return Promise.resolve(new SeedLocalStorage(seed.data, stored ?? seed.data, kv, null));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  getProjects() {
    return Promise.resolve(structuredClone(this.data.projects));
  }

  getProject(key: string) {
    return Promise.resolve(structuredClone(this.data.projects.find((p) => p.key === key) ?? null));
  }

  getPeople() {
    return Promise.resolve(structuredClone(this.data.people));
  }

  getSprints(projectId: string) {
    return Promise.resolve(
      structuredClone(this.data.sprints.filter((s) => s.projectId === projectId)),
    );
  }

  getIssues(projectId: string) {
    return Promise.resolve(
      structuredClone(this.data.issues.filter((i) => i.projectId === projectId)),
    );
  }

  getIssue(projectId: string, number: number) {
    const found = this.data.issues.find((i) => i.projectId === projectId && i.number === number);
    return Promise.resolve(structuredClone(found ?? null));
  }

  getLinks(projectId: string) {
    const ids = new Set(this.data.issues.filter((i) => i.projectId === projectId).map((i) => i.id));
    return Promise.resolve(structuredClone(this.data.links.filter((l) => ids.has(l.fromId))));
  }

  getComments(issueId: string) {
    return Promise.resolve(
      structuredClone(this.data.comments.filter((c) => c.issueId === issueId)),
    );
  }

  getHistory(issueId: string) {
    return Promise.resolve(structuredClone(this.data.history.filter((h) => h.issueId === issueId)));
  }

  commit(changes: Changes): Promise<void> {
    try {
      const next = structuredClone(this.data);
      upsert(next.projects, changes.projects);
      upsert(next.people, changes.people);
      upsert(next.sprints, changes.sprints);
      upsert(next.issues, changes.issues);
      upsert(next.links, changes.links);
      const removed = new Set(changes.deleteLinkIds ?? []);
      next.links = next.links.filter((l) => !removed.has(l.id));
      append('comments', next.comments, changes.comments);
      append('history', next.history, changes.history);

      const checked = parseDataset(next);
      if (!checked.ok) throw invalid('Изменения', checked.errors);
      this.persist(checked.data);
      this.data = checked.data;
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** Сообщение о том, что при запуске данные были сброшены; отдаётся один раз. */
  takeStartupNotice(): string | null {
    const notice = this.startupNotice;
    this.startupNotice = null;
    return notice;
  }

  reset(): Promise<void> {
    clearStoredData(this.kv);
    this.data = structuredClone(this.seed);
    return Promise.resolve();
  }

  private persist(data: Dataset): void {
    const envelope: Stored = { format: FORMAT, data };
    try {
      this.kv.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      throw new StorageError('write_failed', 'Не удалось сохранить изменения в браузере');
    }
  }
}
