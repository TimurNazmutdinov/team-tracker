import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { SEARCH_LIMIT, scoreIssue, searchIssues } from './search';
import type { Dataset } from './schema';
import { viewOf } from './testing';

const ds = seed as unknown as Dataset;
const view = viewOf(ds);

const keys = (query: string, limit?: number) =>
  searchIssues([view], query, limit).map((h) => h.key);

describe('поиск задач', () => {
  it('точный ключ и номер идут первыми', () => {
    expect(keys('DEMO-12')[0]).toBe('DEMO-12');
    expect(keys('demo-12')[0]).toBe('DEMO-12');
    expect(keys('12')[0]).toBe('DEMO-12');
  });

  it('начало ключа находит несколько задач, лучшие — сначала', () => {
    const found = keys('DEMO-1');
    expect(found[0]).toBe('DEMO-1');
    expect(found).toContain('DEMO-10');
    expect(found).toContain('DEMO-16');
  });

  it('поиск по тексту названия без учёта регистра и ё', () => {
    const issue = ds.issues.find((i) => i.title.toLowerCase().includes('парол'));
    if (!issue) throw new Error('нет задачи про пароль');
    expect(keys('ПАРОЛЬ')).toContain(`DEMO-${issue.number}`);
    expect(keys('несуществующее слово')).toEqual([]);
  });

  it('слова запроса должны совпасть все; пустой запрос ничего не ищет', () => {
    expect(keys('   ')).toEqual([]);
    expect(keys('парол фор').length).toBeGreaterThan(0);
    expect(keys('парол zzzz')).toEqual([]);
  });

  it('начало слова весит больше вхождения, название — больше описания', () => {
    const base = ds.issues[0];
    if (!base) throw new Error('нет задач');
    const mk = (title: string, description = '') => ({ ...base, number: 77, title, description });
    expect(scoreIssue(mk('Экспорт заказов'), 'DEMO-77', 'заказ')).toBe(60);
    expect(scoreIssue(mk('Подзаказ'), 'DEMO-77', 'заказ')).toBe(40);
    expect(scoreIssue(mk('Другое', 'про заказ'), 'DEMO-77', 'заказ')).toBe(20);
    expect(scoreIssue(mk('Другое'), 'DEMO-77', 'заказ')).toBe(0);
  });

  it('ограничивает число результатов и ищет по нескольким проектам', () => {
    expect(keys('DEMO', undefined).length).toBeLessThanOrEqual(SEARCH_LIMIT);
    expect(keys('DEMO', 3)).toHaveLength(3);
    const other = {
      ...view,
      project: { ...view.project, id: 'p2', key: 'SHOP' },
      projectId: 'p2',
      issues: view.issues.slice(0, 2),
    };
    const hits = searchIssues([view, other], 'SHOP-1');
    expect(hits[0]?.project.key).toBe('SHOP');
  });
});
