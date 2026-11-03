import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_NOTICES, useNotices } from './notices';

const texts = () => useNotices.getState().notices.map((n) => n.text);

describe('всплывающие сообщения (D-7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const n of useNotices.getState().notices) useNotices.getState().dismiss(n.id);
  });
  afterEach(() => vi.useRealTimers());

  it('успех исчезает сам через 4 с', () => {
    useNotices.getState().push('Проект AIT создан');
    expect(texts()).toEqual(['Проект AIT создан']);
    vi.advanceTimersByTime(3900);
    expect(texts()).toEqual(['Проект AIT создан']);
    vi.advanceTimersByTime(200);
    expect(texts()).toEqual([]);
  });

  it('ошибка остаётся, пока её не закроют', () => {
    useNotices.getState().push('Не удалось сохранить', 'error');
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['Не удалось сохранить']);
  });

  it(`на экране не больше ${MAX_NOTICES} сообщений; первыми уходят старые не-ошибки`, () => {
    const { push } = useNotices.getState();
    push('ошибка', 'error');
    push('первое');
    push('второе');
    push('третье');
    expect(texts()).toEqual(['ошибка', 'второе', 'третье']);
  });

  it('пока указатель на сообщении, оно не исчезает', () => {
    useNotices.getState().push('Создан спринт «Спринт 5»');
    const id = useNotices.getState().notices[0]?.id ?? -1;
    useNotices.getState().hold(id);
    vi.advanceTimersByTime(10_000);
    expect(texts()).toHaveLength(1);
    useNotices.getState().release(id);
    vi.advanceTimersByTime(2100);
    expect(texts()).toEqual([]);
  });
});
