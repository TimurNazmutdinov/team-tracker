import { beforeEach, describe, expect, it } from 'vitest';
import seed from '../../../data/seed.json';
import type { Dataset } from '../../domain/schema';
import { StorageError } from '../types';
import {
  OUTDATED_NOTICE,
  STORAGE_KEY,
  SeedLocalStorage,
  clearStoredData,
  type KeyValueStore,
} from './index';

class MemoryKv implements KeyValueStore {
  readonly map = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('quota');
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

function must<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('нет записи в seed');
  return value;
}

async function rejection(p: Promise<unknown>): Promise<StorageError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof StorageError) return e;
    throw e;
  }
  throw new Error('ожидалась ошибка StorageError');
}

describe('SeedLocalStorage', () => {
  let kv: MemoryKv;
  beforeEach(() => {
    kv = new MemoryKv();
  });

  it('загружает данные из seed.json', async () => {
    const s = await SeedLocalStorage.open(seed, kv);
    const projects = await s.getProjects();
    expect(projects.map((p) => p.key)).toEqual(['DEMO']);
    const project = must(await s.getProject('DEMO'));
    expect((await s.getIssues(project.id)).length).toBe(16);
    expect((await s.getSprints(project.id)).length).toBe(3);
    expect((await s.getPeople()).length).toBe(4);
    expect(await s.getProject('NOPE')).toBeNull();
    expect(must(await s.getIssue(project.id, 9)).title).toBe('Форма смены пароля');
    expect(await s.getIssue(project.id, 999)).toBeNull();
    expect((await s.getLinks(project.id)).length).toBe(2);
    expect((await s.getComments('i2')).length).toBe(1);
    expect((await s.getHistory('i7')).length).toBeGreaterThan(0);
    const all = await s.getProjectHistory(project.id);
    expect(all.length).toBe(seed.history.length);
    expect(all.some((h) => h.issueId === 'i7')).toBe(true);
    expect(kv.map.size).toBe(0);
  });

  it('отдаёт копии, а не внутренние объекты', async () => {
    const s = await SeedLocalStorage.open(seed, kv);
    const issue = must(await s.getIssue('p1', 9));
    issue.title = 'изменено снаружи';
    expect(must(await s.getIssue('p1', 9)).title).toBe('Форма смены пароля');
  });

  it('сохраняет изменения и видит их после повторного открытия', async () => {
    const s = await SeedLocalStorage.open(seed, kv);
    const issue = must(await s.getIssue('p1', 9));
    await s.commit({
      issues: [{ ...issue, status: 'Review' }],
      history: [
        {
          id: 'h1000',
          issueId: issue.id,
          authorId: 'u2',
          field: 'status',
          from: 'In Progress',
          to: 'Review',
          at: '2026-10-28T12:00:00Z',
        },
      ],
    });
    expect(must(await s.getIssue('p1', 9)).status).toBe('Review');
    expect(kv.map.has(STORAGE_KEY)).toBe(true);

    const again = await SeedLocalStorage.open(seed, kv);
    expect(must(await again.getIssue('p1', 9)).status).toBe('Review');
    expect((await again.getHistory(issue.id)).some((h) => h.id === 'h1000')).toBe(true);
  });

  it('удаляет связи', async () => {
    const s = await SeedLocalStorage.open(seed, kv);
    await s.commit({ deleteLinkIds: ['l1'] });
    expect((await s.getLinks('p1')).map((l) => l.id)).toEqual(['l2']);
  });

  it('не применяет изменения, нарушающие правила (всё или ничего)', async () => {
    const s = await SeedLocalStorage.open(seed, kv);
    const issue = must(await s.getIssue('p1', 14));
    const err = await rejection(s.commit({ issues: [{ ...issue, points: 3 }] }));
    expect(err.code).toBe('invalid_data');
    expect(err.details.join('\n')).toContain('points не ставятся');
    expect(must(await s.getIssue('p1', 14)).points).toBeNull();
    expect(kv.map.size).toBe(0);
  });

  it('история и комментарии только добавляются', async () => {
    const s = await SeedLocalStorage.open(seed, kv);
    const existing = must((await s.getHistory('i7'))[0]);
    const err = await rejection(s.commit({ history: [{ ...existing, to: 'Done' }] }));
    expect(err.code).toBe('conflict');
  });

  it('сообщает, если браузер не даёт записать', async () => {
    const s = await SeedLocalStorage.open(seed, kv);
    kv.failWrites = true;
    const issue = must(await s.getIssue('p1', 9));
    const err = await rejection(s.commit({ issues: [{ ...issue, title: 'Новое название' }] }));
    expect(err.code).toBe('write_failed');
    expect(must(await s.getIssue('p1', 9)).title).toBe('Форма смены пароля');
  });

  it('сбрасывает данные к seed', async () => {
    const s = await SeedLocalStorage.open(seed, kv);
    const issue = must(await s.getIssue('p1', 9));
    await s.commit({ issues: [{ ...issue, title: 'Другое название' }] });
    expect(kv.map.has(STORAGE_KEY)).toBe(true);

    await s.reset();
    expect(must(await s.getIssue('p1', 9)).title).toBe('Форма смены пароля');
    expect(kv.map.has(STORAGE_KEY)).toBe(false);
  });

  describe('версия seed', () => {
    async function savedWithChange(): Promise<void> {
      const s = await SeedLocalStorage.open(seed, kv);
      const issue = must(await s.getIssue('p1', 9));
      await s.commit({ issues: [{ ...issue, title: 'Сохранённое название' }] });
    }

    it('та же версия: сохранённые данные остаются, уведомления нет', async () => {
      await savedWithChange();
      const s = await SeedLocalStorage.open(seed, kv);
      expect(must(await s.getIssue('p1', 9)).title).toBe('Сохранённое название');
      expect(s.takeStartupNotice()).toBeNull();
    });

    it('другая версия seed: данные сбрасываются и приходит уведомление (один раз)', async () => {
      await savedWithChange();
      const newer = { ...(seed as unknown as Dataset), version: seed.version + 1 };
      const s = await SeedLocalStorage.open(newer, kv);
      expect(must(await s.getIssue('p1', 9)).title).toBe('Форма смены пароля');
      expect(kv.map.has(STORAGE_KEY)).toBe(false);
      expect(s.takeStartupNotice()).toBe(OUTDATED_NOTICE);
      expect(s.takeStartupNotice()).toBeNull();
    });

    it('сохранённые данные без версии считаются устаревшими', async () => {
      const withoutVersion = Object.fromEntries(
        Object.entries(seed).filter(([k]) => k !== 'version'),
      );
      kv.setItem(STORAGE_KEY, JSON.stringify({ format: 1, data: withoutVersion }));
      const s = await SeedLocalStorage.open(seed, kv);
      expect(s.takeStartupNotice()).toBe(OUTDATED_NOTICE);
      expect(kv.map.has(STORAGE_KEY)).toBe(false);
    });
  });

  describe('битые данные', () => {
    it('seed неверной структуры', async () => {
      const broken = structuredClone(seed) as unknown as Dataset;
      broken.projects = [{ ...must(broken.projects[0]), key: 'demo' }];
      const err = await rejection(SeedLocalStorage.open(broken, kv));
      expect(err.code).toBe('invalid_data');
      expect(err.details.join('\n')).toContain('projects.0.key');
    });

    it('seed с нарушением целостности', async () => {
      const broken = structuredClone(seed) as unknown as Dataset;
      must(broken.issues[0]).reporterId = 'u404';
      const err = await rejection(SeedLocalStorage.open(broken, kv));
      expect(err.code).toBe('invalid_data');
      expect(err.details.join('\n')).toContain('u404');
    });

    it('сохранённые данные — не JSON', async () => {
      kv.setItem(STORAGE_KEY, '{oops');
      const err = await rejection(SeedLocalStorage.open(seed, kv));
      expect(err.code).toBe('invalid_data');
      expect(err.message).toContain('повреждены');
    });

    it('сохранённые данные неизвестного формата или неверной структуры', async () => {
      kv.setItem(STORAGE_KEY, JSON.stringify({ format: 99, data: {} }));
      expect((await rejection(SeedLocalStorage.open(seed, kv))).code).toBe('invalid_data');
      kv.setItem(
        STORAGE_KEY,
        JSON.stringify({ format: 1, data: { version: seed.version, projects: 5 } }),
      );
      expect((await rejection(SeedLocalStorage.open(seed, kv))).code).toBe('invalid_data');
    });

    it('очистка сохранённых данных возвращает возможность запуска', async () => {
      kv.setItem(STORAGE_KEY, '{oops');
      await rejection(SeedLocalStorage.open(seed, kv));
      clearStoredData(kv);
      const s = await SeedLocalStorage.open(seed, kv);
      expect((await s.getProjects()).length).toBe(1);
    });
  });
});
