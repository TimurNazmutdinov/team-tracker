// Цвет эпика (D-5): постоянный для эпика оттенок — полоса на карточке, дорожка и метка эпика.
// Оттенок считается из id, поэтому одинаков на доске, в планировании и на дорожной карте.

const HUES = [150, 30, 210, 280, 0, 95, 330, 185, 55, 245];

export function epicHue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length] ?? 150;
}

/** CSS-переменные цвета эпика: --epic (полоса) и --epic-bg (подложка метки). */
export function epicStyle(id: string): Record<string, string> {
  const hue = epicHue(id);
  return {
    '--epic': `hsl(${hue} 45% 40%)`,
    '--epic-bg': `hsl(${hue} 45% 45% / 0.16)`,
  };
}
