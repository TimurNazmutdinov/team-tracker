import { describe, expect, it } from 'vitest';
import { createProject } from './actions';
import {
  activeProjects,
  archiveProject,
  deleteProject,
  isArchived,
  restoreProject,
  updateProject,
} from './projects';
import type { Project } from './schema';
import { testCtx } from './testing';

const made = (key: string, name: string, ownerId: string | null = null): Project => {
  const r = createProject([], { key, name, ownerId }, testCtx());
  if (!r.ok || !r.changes.projects?.[0]) throw new Error('не создан');
  return r.changes.projects[0];
};
const a = made('AAA', 'Первый');
const b = made('BBB', 'Второй');
const list = [a, b];

describe('создание проекта', () => {
  it('принимает владельца и не архивирует', () => {
    const p = made('NEW', 'Новый', 'u1');
    expect(p).toMatchObject({ ownerId: 'u1', archivedAt: null });
  });
});

describe('updateProject', () => {
  it('меняет название и ключ', () => {
    const r = updateProject(list, a.id, { key: ' ZED ', name: ' Новое имя ' });
    expect(r.ok && r.changes.projects?.[0]).toMatchObject({ key: 'ZED', name: 'Новое имя' });
  });
  it('без изменений — пусто', () => {
    const r = updateProject(list, a.id, { key: 'AAA', name: 'Первый' });
    expect(r.ok && r.changes).toEqual({});
  });
  it('проверяет ключ и название', () => {
    const bad = updateProject(list, a.id, { key: 'a1', name: ' ' });
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(['key', 'name']);
    const dup = updateProject(list, a.id, { key: 'BBB', name: 'x' });
    expect(!dup.ok && dup.errors.key).toMatch(/занят/);
    expect(updateProject(list, 'нет', { key: 'ZED', name: 'x' }).ok).toBe(false);
  });
  it('собственный ключ не считается занятым', () => {
    expect(updateProject(list, a.id, { key: 'AAA', name: 'Другое' }).ok).toBe(true);
  });
});

describe('архив и удаление', () => {
  it('архив и возврат', () => {
    const r = archiveProject(a, '2026-11-02T10:00:00Z');
    if (!r.ok) throw new Error('ожидался успех');
    const archived = r.changes.projects?.[0] as Project;
    expect(isArchived(archived)).toBe(true);
    expect(activeProjects([archived, b]).map((p) => p.key)).toEqual(['BBB']);
    expect(archiveProject(archived, 'x').ok).toBe(false);
    const back = restoreProject(archived);
    expect(back.ok && back.changes.projects?.[0]?.archivedAt).toBeNull();
    expect(restoreProject(a).ok).toBe(false);
  });
  it('удалить можно только проект без задач', () => {
    const empty = deleteProject(a, 0);
    expect(empty.ok && empty.changes.deleteProjectIds).toEqual([a.id]);
    const busy = deleteProject(a, 3);
    expect(!busy.ok && busy.errors.form).toMatch(/архив/);
  });
});
