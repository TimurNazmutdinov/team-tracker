import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { labelGroup, labelStats, suggestLabels, withLabel } from './labels';
import type { Dataset } from './schema';

const ds = seed as unknown as Dataset;

describe('метки (D-2)', () => {
  it('частые первыми, затем по алфавиту', () => {
    const stats = labelStats(ds.issues);
    expect(stats[0]?.count).toBeGreaterThanOrEqual(stats[1]?.count ?? 0);
    expect(stats.find((s) => s.label === 'бэкенд')?.count).toBe(4);
  });
  it('группа по приставке до двоеточия', () => {
    expect(labelGroup('система: Fabric')).toEqual({ group: 'система', value: 'Fabric' });
    expect(labelGroup('домен:Цепочка поставок')).toEqual({
      group: 'домен',
      value: 'Цепочка поставок',
    });
    expect(labelGroup('бэкенд')).toEqual({ group: null, value: 'бэкенд' });
    expect(labelGroup(':странная')).toEqual({ group: null, value: ':странная' });
  });
  it('подсказки: сначала начинающиеся, без уже выбранных', () => {
    const stats = [
      { label: 'бэкенд', count: 4 },
      { label: 'фронтенд', count: 3 },
      { label: 'безопасность', count: 4 },
    ];
    expect(suggestLabels(stats, 'енд', []).map((s) => s.label)).toEqual(['бэкенд', 'фронтенд']);
    expect(suggestLabels(stats, 'б', ['Бэкенд']).map((s) => s.label)).toEqual(['безопасность']);
  });
  it('добавление без повторов и пустых', () => {
    expect(withLabel(['бэкенд'], ' Бэкенд ')).toEqual(['бэкенд']);
    expect(withLabel(['бэкенд'], '  ')).toEqual(['бэкенд']);
    expect(withLabel(['бэкенд'], 'тесты')).toEqual(['бэкенд', 'тесты']);
  });
});
