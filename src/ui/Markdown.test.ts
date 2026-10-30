import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe('Markdown', () => {
  it('рисует жирный, курсив, код и списки', () => {
    const out = html('**жирный** и *курсив* и `код`\n\n- раз\n- два\n\n1. один');
    expect(out).toContain('<strong>жирный</strong>');
    expect(out).toContain('<em>курсив</em>');
    expect(out).toContain('<code>код</code>');
    expect(out).toContain('<ul><li>раз</li><li>два</li></ul>');
    expect(out).toContain('<ol>');
  });

  it('не пропускает HTML и скрипты', () => {
    const out = html(
      '<script>alert(1)</script><img src=x onerror=alert(1)>\n\n<b onclick="x()">b</b>',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b ');
    expect(out).not.toMatch(/<[^>]*onerror/);
    expect(out).toContain('&lt;script&gt;');
  });

  it('оставляет только безопасные ссылки', () => {
    expect(html('[ок](https://example.com)')).toContain('href="https://example.com"');
    expect(html('[ок](https://example.com)')).toContain('rel="noopener noreferrer"');
    const bad = html('[плохо](javascript:alert(1)) [и](data:text/html,x) [vb](VBSCRIPT:x)');
    expect(bad).not.toContain('href=');
    expect(bad).toContain('плохо');
  });

  it('картинки заменяет подписью', () => {
    const out = html('![схема](https://example.com/a.png)');
    expect(out).not.toContain('<img');
    expect(out).toContain('схема');
  });

  it('опускает заголовки на два уровня', () => {
    const out = html('# Один\n\n###### Шесть');
    expect(out).toContain('<h3>Один</h3>');
    expect(out).toContain('<h6>Шесть</h6>');
    expect(out).not.toContain('<h1');
    expect(out).not.toContain('<h2');
  });

  it('показывает пункты чек-листа с отметками', () => {
    const out = html('- [x] готово\n- [ ] не готово\n- обычный');
    expect(out.match(/type="checkbox"/g)).toHaveLength(2);
    expect(out).toContain('checked=""');
    expect(out).toContain('disabled=""');
    expect(out).toContain('готово');
    expect(out).not.toContain('[ ]');
    expect(out).not.toContain('[x]');
  });

  it('пункты внутри кода не становятся флажками', () => {
    const out = html('```\n- [ ] в коде\n```');
    expect(out).not.toContain('checkbox');
    expect(out).toContain('- [ ] в коде');
  });

  it('пустой текст даёт пустой блок', () => {
    expect(html('')).toBe('<div class="md"></div>');
  });
});
