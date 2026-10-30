import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { createProject, type Result } from './actions';
import { parseDataset } from './dataset';
import { violations } from './permissions';
import type { Dataset } from './schema';
import {
  DEFAULT_TEMPLATE_INPUTS,
  createTemplate,
  defaultTemplates,
  deleteTemplate,
  templatesOf,
  updateTemplate,
} from './templates';
import { applyChanges, testCtx, viewOf } from './testing';

const ds = seed as unknown as Dataset;
const view = () => viewOf(ds);

function applied(base: Dataset, r: Result): Dataset {
  if (!r.ok) throw new Error(`ожидался успех: ${JSON.stringify(r.errors)}`);
  const next = applyChanges(base, r.changes);
  const parsed = parseDataset(next);
  expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  return next;
}
const errors = (r: Result) => {
  if (r.ok) throw new Error('ожидалась ошибка');
  return r.errors;
};

const input = {
  name: ' Исследование ',
  type: 'Task' as const,
  description: '## Вопрос',
  acceptance: '- [ ] Вывод',
};

describe('шаблоны по умолчанию', () => {
  it('«Баг», «Story» и «Задача» с нужными разделами', () => {
    const names = DEFAULT_TEMPLATE_INPUTS.map((t) => t.name);
    expect(names).toEqual(['Баг', 'Story', 'Задача']);
    const bug = DEFAULT_TEMPLATE_INPUTS[0];
    for (const part of ['Шаги воспроизведения', 'Ожидалось', 'Получилось', 'Окружение'])
      expect(bug?.description).toContain(part);
    const story = DEFAULT_TEMPLATE_INPUTS[1];
    for (const part of ['Контекст', 'Цель']) expect(story?.description).toContain(part);
    expect(story?.acceptance).toContain('- [ ]');
  });

  it('новый проект получает шаблоны', () => {
    const r = createProject(ds.projects, { key: 'SHOP', name: 'Магазин' }, testCtx());
    const next = applied(ds, r);
    const project = next.projects.find((p) => p.key === 'SHOP');
    expect(next.templates.filter((t) => t.projectId === project?.id)).toHaveLength(3);
    expect(project).toMatchObject({ wipEnabled: false, wipLimits: {} });
    expect(defaultTemplates('x', testCtx()).every((t) => t.projectId === 'x')).toBe(true);
  });

  it('seed: у демо-проекта три шаблона', () => {
    expect(templatesOf(view()).map((t) => t.name)).toEqual(['Баг', 'Story', 'Задача']);
  });
});

describe('создание, правка и удаление', () => {
  it('создаёт шаблон с обрезанным названием', () => {
    const next = applied(ds, createTemplate(view(), input, testCtx()));
    expect(templatesOf(viewOf(next)).at(-1)).toMatchObject({ name: 'Исследование', type: 'Task' });
  });

  it('проверяет название, тип и длину текста', () => {
    const v = view();
    expect(errors(createTemplate(v, { ...input, name: '  ' }, testCtx())).name).toContain(
      'Введите',
    );
    expect(errors(createTemplate(v, { ...input, name: 'баг' }, testCtx())).name).toContain(
      'уже есть',
    );
    expect(errors(createTemplate(v, { ...input, type: 'Epic' }, testCtx())).type).toContain(
      'Выберите',
    );
    expect(
      errors(createTemplate(v, { ...input, description: 'я'.repeat(10_001) }, testCtx()))
        .description,
    ).toContain('10000');
  });

  it('правит шаблон; то же значение — без изменений; своё название не считается повтором', () => {
    const v = view();
    const first = templatesOf(v)[0];
    if (!first) throw new Error('нет шаблона');
    const same = updateTemplate(v, first.id, first);
    expect(same.ok && same.changes).toEqual({});
    const next = applied(ds, updateTemplate(v, first.id, { ...first, acceptance: '- [ ] Новое' }));
    expect(next.templates.find((t) => t.id === first.id)?.acceptance).toBe('- [ ] Новое');
    expect(errors(updateTemplate(v, 'нет', input)).form).toContain('не найден');
    const second = templatesOf(v)[1];
    expect(
      errors(updateTemplate(v, first.id, { ...first, name: second?.name ?? '' })).name,
    ).toContain('уже есть');
  });

  it('удаляет шаблон', () => {
    const first = templatesOf(view())[0];
    const next = applied(ds, deleteTemplate(view(), first?.id ?? ''));
    expect(next.templates.some((t) => t.id === first?.id)).toBe(false);
    expect(errors(deleteTemplate(view(), 'нет')).form).toContain('не найден');
  });
});

describe('права на шаблоны', () => {
  it('меняют тимлид и администратор, остальные нет', () => {
    const c = createTemplate(view(), input, testCtx());
    if (!c.ok) throw new Error('ожидался успех');
    expect(violations('lead', 'u4', ds, c.changes)).toEqual([]);
    expect(violations('admin', 'u9', ds, c.changes)).toEqual([]);
    expect(violations('product', 'u1', ds, c.changes).join(' ')).toContain('Шаблоны задач');
    expect(violations('developer', 'u2', ds, c.changes)).not.toEqual([]);
  });
});
