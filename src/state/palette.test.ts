import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Применение цветовой гаммы (ADR-013): атрибут на <html>, значок вкладки, запоминание в браузере.

function stubBrowser(initial?: string) {
  const storage = new Map<string, string>();
  if (initial !== undefined) storage.set('team-tracker:palette', initial);
  const icon = { href: '' };
  const root = { dataset: {} as Record<string, string> };
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    },
  });
  vi.stubGlobal('document', {
    documentElement: root,
    querySelector: (sel: string) => (sel === 'link[rel="icon"]' ? icon : null),
  });
  return { storage, icon, root };
}

async function load() {
  vi.resetModules();
  return import('./palette');
}

describe('цветовая гамма', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('по умолчанию — бежевая, если ничего не сохранено или сохранено неизвестное', async () => {
    stubBrowser();
    expect((await load()).storedPalette()).toBe('beige');
    stubBrowser('red');
    expect((await load()).storedPalette()).toBe('beige');
    stubBrowser('blue');
    expect((await load()).storedPalette()).toBe('blue');
  });

  it('применяется сразу: атрибут, значок вкладки и запоминание', async () => {
    const { storage, icon, root } = stubBrowser();
    const { usePalette } = await load();
    usePalette.getState().set('blue');
    expect(root.dataset.palette).toBe('blue');
    expect(icon.href).toBe('/favicon-blue.svg');
    expect(storage.get('team-tracker:palette')).toBe('blue');
    expect(usePalette.getState().palette).toBe('blue');
    usePalette.getState().set('beige');
    expect(root.dataset.palette).toBe('beige');
    expect(icon.href).toBe('/favicon-beige.svg');
  });

  it('initPalette берёт сохранённую гамму до первой отрисовки', async () => {
    const { root } = stubBrowser('blue');
    const { initPalette } = await load();
    initPalette();
    expect(root.dataset.palette).toBe('blue');
  });

  it('если браузер не даёт хранилище, гамма всё равно применяется', async () => {
    const { root } = stubBrowser();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('закрыто');
        },
        setItem: () => {
          throw new Error('закрыто');
        },
      },
    });
    const { usePalette, storedPalette } = await load();
    expect(storedPalette()).toBe('beige');
    usePalette.getState().set('blue');
    expect(root.dataset.palette).toBe('blue');
  });
});
