// Цветовые гаммы приложения (ADR-013). Сами цвета — в src/ui/tokens.css; здесь только список,
// названия и значение по умолчанию: он общий для сервера (проверка и хранение выбора) и клиента.

export const PALETTES = ['beige', 'blue'] as const;
export type Palette = (typeof PALETTES)[number];

/** Бежевая — по умолчанию; «Стандартная» — прежняя синяя. */
export const DEFAULT_PALETTE: Palette = 'beige';

export const PALETTE_LABELS: Record<Palette, string> = {
  beige: 'Бежевая',
  blue: 'Стандартная',
};

export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && (PALETTES as readonly string[]).includes(value);
}
