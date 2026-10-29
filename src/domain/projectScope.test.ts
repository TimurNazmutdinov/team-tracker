import { describe, expect, it } from 'vitest';
import {
  ALL,
  MINE,
  customPref,
  parseScopeParam,
  parseStoredPref,
  resolveScope,
  scopeLabel,
  scopeParam,
} from './projectScope';
import type { Project, ProjectMember } from './schema';

const project = (id: string, key: string, ownerId: string | null = null): Project => ({
  id,
  key,
  name: `Проект ${key}`,
  sprintDurationDays: 14,
  sprintPrefix: 'Спринт',
  nextSprintNumber: 1,
  nextSprintStart: null,
  ownerId,
});

const projects = [project('p1', 'DEMO', 'u1'), project('p2', 'SHOP'), project('p3', 'CRM', 'u2')];
const members: ProjectMember[] = [{ id: 'm1', projectId: 'p2', personId: 'u1', role: 'developer' }];
const base = { projects, members, personId: 'u1', fromUrl: null, saved: null, current: undefined };

describe('адрес и сохранённое значение', () => {
  it('разбирает mine, all и ключи через запятую', () => {
    expect(parseScopeParam('mine')).toEqual(MINE);
    expect(parseScopeParam('all')).toEqual(ALL);
    expect(parseScopeParam('DEMO,SHOP')).toEqual(customPref(['DEMO', 'SHOP']));
    expect(parseScopeParam(' DEMO , demo ,X')).toEqual(customPref(['DEMO']));
    expect(parseScopeParam('')).toBeNull();
    expect(parseScopeParam(null)).toBeNull();
  });

  it('значение параметра и обратно', () => {
    for (const pref of [MINE, ALL, customPref(['DEMO', 'SHOP'])])
      expect(parseScopeParam(scopeParam(pref))).toEqual(pref);
  });

  it('повреждённое сохранённое значение — «не сохранено»', () => {
    expect(parseStoredPref(null)).toBeNull();
    expect(parseStoredPref('{не json')).toBeNull();
    expect(parseStoredPref('{"mode":"всё","keys":[]}')).toBeNull();
    expect(parseStoredPref('{"mode":"custom","keys":["DEMO"]}')).toEqual(customPref(['DEMO']));
  });
});

describe('resolveScope', () => {
  it('«Мои» — где человек владелец или участник', () => {
    const scope = resolveScope({ ...base, fromUrl: MINE });
    expect(scope.projects.map((p) => p.key)).toEqual(['DEMO', 'SHOP']);
    expect(scopeLabel(scope, 3)).toBe('Мои (2)');
  });

  it('«Все» и перечень ключей', () => {
    expect(resolveScope({ ...base, fromUrl: ALL }).projects).toHaveLength(3);
    const custom = resolveScope({ ...base, fromUrl: customPref(['CRM', 'NOPE']) });
    expect(custom.projects.map((p) => p.key)).toEqual(['CRM']);
    expect(scopeLabel(custom, 3)).toBe('CRM');
  });

  it('порядок источников: адрес, затем сохранённый выбор, затем проект из адреса', () => {
    const current = projects[1];
    const saved = customPref(['CRM']);
    expect(resolveScope({ ...base, fromUrl: ALL, saved, current }).source).toBe('url');
    const fromSaved = resolveScope({ ...base, saved, current });
    expect(fromSaved.source).toBe('saved');
    expect(fromSaved.projects.map((p) => p.key)).toEqual(['CRM']);
    const fromCurrent = resolveScope({ ...base, current });
    expect(fromCurrent.source).toBe('current');
    expect(fromCurrent.projects.map((p) => p.key)).toEqual(['SHOP']);
    expect(resolveScope(base).pref).toEqual(MINE);
  });

  it('если выбранных проектов нет, остаётся проект из адреса', () => {
    const scope = resolveScope({ ...base, fromUrl: customPref(['GONE']), current: projects[0] });
    expect(scope.projects.map((p) => p.key)).toEqual(['DEMO']);
  });

  it('без участия ни в одном проекте «Мои» пусты', () => {
    const scope = resolveScope({ ...base, personId: 'u9', fromUrl: MINE });
    expect(scope.projects).toEqual([]);
    expect(scopeLabel(scope, 3)).toBe('Мои (0)');
  });

  it('подписи для нескольких проектов', () => {
    const many = Array.from({ length: 6 }, (_, n) =>
      project(`p${n}`, `PR${String.fromCharCode(65 + n)}`),
    );
    const pick = (n: number) =>
      resolveScope({
        ...base,
        projects: many,
        fromUrl: customPref(many.slice(0, n).map((p) => p.key)),
      });
    expect(scopeLabel(pick(2), 6)).toBe('PRA, PRB');
    expect(scopeLabel(pick(3), 6)).toBe('3 проекта');
    expect(scopeLabel(pick(5), 6)).toBe('5 проектов');
    expect(scopeLabel(pick(6), 6)).toBe('Все (6)');
  });
});
