import { describe, expect, it } from 'vitest';
import { ErrorRing, RING_SIZE, describeError, type KeyValueStore } from './error-log';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const entry = (n: number) => ({
  at: `2026-10-29T10:00:${String(n % 60).padStart(2, '0')}Z`,
  message: `e${n}`,
});

describe('describeError', () => {
  it('разбирает Error, строку и произвольное значение', () => {
    expect(describeError(new TypeError('плохо')).message).toBe('TypeError: плохо');
    expect(describeError('просто текст')).toEqual({ message: 'просто текст' });
    expect(describeError({ code: 7 }).message).toBe('{"code":7}');
  });
});

describe('ErrorRing', () => {
  it('хранит не больше RING_SIZE последних записей', () => {
    const ring = new ErrorRing(memoryStore());
    for (let i = 0; i < RING_SIZE + 5; i += 1) ring.add(entry(i));
    const list = ring.list();
    expect(list).toHaveLength(RING_SIZE);
    expect(list[0]?.message).toBe('e5');
    expect(list.at(-1)?.message).toBe(`e${RING_SIZE + 4}`);
  });

  it('переживает повреждённое хранилище', () => {
    const store = memoryStore();
    store.setItem('team-tracker:errors', '{не json');
    const ring = new ErrorRing(store);
    expect(ring.list()).toEqual([]);
    ring.add(entry(1));
    expect(ring.list()).toHaveLength(1);
  });

  it('работает без хранилища и при ошибке записи', () => {
    const none = new ErrorRing(null);
    none.add(entry(1));
    expect(none.list()).toHaveLength(1);
    const broken = new ErrorRing({
      getItem: () => null,
      setItem: () => {
        throw new Error('квота');
      },
      removeItem: () => undefined,
    });
    expect(() => broken.add(entry(1))).not.toThrow();
  });

  it('очищается', () => {
    const ring = new ErrorRing(memoryStore());
    ring.add(entry(1));
    ring.clear();
    expect(ring.list()).toEqual([]);
  });
});
