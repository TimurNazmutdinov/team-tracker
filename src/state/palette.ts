import { create } from 'zustand';
import { DEFAULT_PALETTE, isPalette, type Palette } from '../domain/palettes';

// Цветовая гамма интерфейса (ADR-013). Применяется сразу, без перезагрузки: атрибут data-palette
// на <html> переключает переменные из tokens.css, а значок вкладки меняется на файл этой гаммы.
// Выбор помнится в браузере; с сервером ещё и в профиле (его сохраняет useSetPalette).

const KEY = 'team-tracker:palette';

export function storedPalette(): Palette {
  try {
    const value = window.localStorage.getItem(KEY);
    return isPalette(value) ? value : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

/** Применяет гамму к странице и запоминает её в браузере (нужно для экрана входа и быстрого старта). */
export function applyPalette(palette: Palette): void {
  document.documentElement.dataset.palette = palette;
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = `${import.meta.env.BASE_URL}favicon-${palette}.svg`;
  try {
    window.localStorage.setItem(KEY, palette);
  } catch {
    // гамма применена, просто не запомнится в этом браузере
  }
}

interface PaletteState {
  palette: Palette;
  set: (palette: Palette) => void;
}

export const usePalette = create<PaletteState>((set) => ({
  palette: storedPalette(),
  set: (palette) => {
    applyPalette(palette);
    set({ palette });
  },
}));

/** Вызывается до первой отрисовки, чтобы не мигала гамма по умолчанию. */
export function initPalette(): void {
  usePalette.getState().set(storedPalette());
}
