import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALETTES, type Palette } from '../domain/palettes';
import { contrast } from './contrast';

// Токены цветовых гамм (ADR-013): набор одинаков у всех четырёх вариантов, цвета заданы только в
// tokens.css, контраст не ниже WCAG AA.

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

type Mode = 'light' | 'dark';
type Tokens = Record<string, string>;

/** Разбирает tokens.css: для каждой гаммы и режима — значения переменных. */
function parse(source: string): Record<Palette, Record<Mode, Tokens>> {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const result = {} as Record<Palette, Record<Mode, Tokens>>;
  for (const p of PALETTES) result[p] = { light: {}, dark: {} };
  let dark = false;
  let depth = 0;
  const re = /([^{}]+)\{|\}|([^{};]+;)/g;
  let selector = '';
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1] !== undefined) {
      const sel = m[1].trim();
      depth += 1;
      if (sel.startsWith('@media')) {
        dark = /prefers-color-scheme:\s*dark/.test(sel);
        depth = 1;
      } else {
        selector = sel;
      }
    } else if (m[0] === '}') {
      depth -= 1;
      if (depth <= 0) {
        dark = false;
        depth = 0;
      }
    } else if (m[2] !== undefined) {
      const decl = /^\s*(--[\w-]+):\s*(.+);$/.exec(m[2]);
      if (!decl?.[1] || !decl[2]) continue;
      // без атрибута — бежевая; атрибут data-palette выбирает гамму
      const targets = new Set<Palette>();
      for (const s of selector.split(',')) {
        const attr = /data-palette='(\w+)'/.exec(s);
        if (attr?.[1] && (PALETTES as readonly string[]).includes(attr[1]))
          targets.add(attr[1] as Palette);
        else if (s.trim() === ':root') targets.add('beige');
      }
      for (const p of targets) result[p][dark ? 'dark' : 'light'][decl[1]] = decl[2].trim();
    }
  }
  return result;
}

const palettes = parse(css);
const variants = PALETTES.flatMap((p) => (['light', 'dark'] as const).map((m) => [p, m] as const));

const STATUS = ['--st-backlog', '--st-todo', '--st-progress', '--st-review', '--st-done'];

describe('токены цветовых гамм', () => {
  it('есть бежевая и синяя, у каждой светлая и тёмная версии', () => {
    for (const [p, m] of variants)
      expect(Object.keys(palettes[p][m]).length, `${p} ${m}`).toBeGreaterThan(20);
  });

  it('набор переменных одинаков во всех четырёх вариантах', () => {
    const base = Object.keys(palettes.beige.light).sort();
    for (const [p, m] of variants)
      expect(Object.keys(palettes[p][m]).sort(), `${p} ${m}`).toEqual(base);
    for (const need of [
      '--bg',
      '--panel',
      '--ink',
      '--accent',
      '--accent-ink',
      '--control-line',
      '--logo-ring',
      '--logo-check',
      '--extra-1',
      '--extra-2',
      '--extra-3',
    ])
      expect(base).toContain(need);
  });

  it('бежевая гамма использует цвета из задания', () => {
    const l = palettes.beige.light;
    expect(l['--bg']).toBe('#ecece2');
    expect(l['--panel']).toBe('#f7f6f0');
    expect(l['--ink']).toBe('#484039');
    expect([l['--extra-1'], l['--extra-2'], l['--extra-3']]).toEqual([
      '#c5bfaf',
      '#b7a286',
      '#abafa3',
    ]);
    expect(l['--logo-check']).toBe('#95816c');
    expect(palettes.beige.dark['--ink']).toBe('#eeeee5');
  });

  it('цвета логотипа совпадают с файлами Logo/', () => {
    const logo = (p: Palette, f: string) =>
      readFileSync(new URL(`../../Logo/${p}/${f}`, import.meta.url), 'utf8');
    for (const p of PALETTES) {
      for (const [file, mode] of [
        ['logo-light.svg', 'light'],
        ['logo-dark.svg', 'dark'],
      ] as const) {
        const svg = logo(p, file).toLowerCase();
        expect(svg, `${p} ${file}`).toContain(palettes[p][mode]['--logo-ring']);
        expect(svg, `${p} ${file}`).toContain(palettes[p][mode]['--logo-check']);
      }
    }
  });

  it.each(variants)('%s, %s: текст и кнопки — контраст не ниже 4.5:1 (WCAG AA)', (p, m) => {
    const t = palettes[p][m];
    const at = (k: string) => t[k] ?? '';
    const pairs: [string, string, string][] = [
      ['текст', '--ink', '--bg'],
      ['текст на поверхности', '--ink', '--panel'],
      ['второстепенный текст', '--muted', '--bg'],
      ['второстепенный текст на поверхности', '--muted', '--panel'],
      ['ссылки', '--accent', '--bg'],
      ['ссылки на поверхности', '--accent', '--panel'],
      ['кнопка', '--accent-ink', '--accent'],
      ['текст на выделении', '--ink', '--accent-bg'],
      ['акцент на выделении', '--accent', '--accent-bg'],
      ['ошибка', '--danger', '--danger-bg'],
      ['ошибка на фоне', '--danger', '--bg'],
      ['ошибка на поверхности', '--danger', '--panel'],
      ['предупреждение', '--warn', '--warn-bg'],
      ['предупреждение на фоне', '--warn', '--bg'],
      ['предупреждение на поверхности', '--warn', '--panel'],
      ...STATUS.map((s): [string, string, string] => [`статус ${s}`, '--ink', s]),
    ];
    for (const [name, fg, bg] of pairs) {
      expect(
        contrast(at(fg), at(bg)),
        `${name}: ${fg} ${at(fg)} на ${bg} ${at(bg)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(variants)('%s, %s: границы полей и знак логотипа — не ниже 3:1', (p, m) => {
    const t = palettes[p][m];
    const at = (k: string) => t[k] ?? '';
    for (const bg of ['--bg', '--panel']) {
      expect(
        contrast(at('--control-line'), at(bg)),
        `границы полей на ${bg}`,
      ).toBeGreaterThanOrEqual(3);
      expect(contrast(at('--logo-ring'), at(bg)), `круг логотипа на ${bg}`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('цвета заданы только в tokens.css: в styles.css нет ни hex, ни rgb()', () => {
    expect(styles.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(styles).not.toMatch(/\brgba?\(|\bhsla?\(/);
  });
});
