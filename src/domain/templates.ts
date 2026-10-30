import type { Ctx, FieldErrors, Result, View } from './actions';
import { ISSUE_TYPES, type IssueTemplate, type IssueType } from './schema';

// Шаблоны задач проекта (ADR-017): тип, описание и критерии приёмки подставляются при создании.

export const NAME_MAX = 60;
export const TEXT_MAX = 10_000;

export interface TemplateInput {
  name: string;
  type: IssueType;
  description: string;
  acceptance: string;
}

/** Шаблоны, которые получает каждый проект: «Баг», «Story», «Задача». */
export const DEFAULT_TEMPLATE_INPUTS: TemplateInput[] = [
  {
    name: 'Баг',
    type: 'Bug',
    description:
      '## Шаги воспроизведения\n1. Шаг первый\n\n## Ожидалось\nОпишите, что должно было произойти\n\n## Получилось\nОпишите, что произошло на самом деле\n\n## Окружение\nБраузер и версия: …\nРоль пользователя: …',
    acceptance: '- [ ] Ошибка не воспроизводится по шагам\n- [ ] Добавлен тест на этот случай',
  },
  {
    name: 'Story',
    type: 'Story',
    description: '## Контекст\nПочему это нужно\n\n## Цель\nКак … я хочу …, чтобы …',
    acceptance: '- [ ] Первый критерий приёмки\n- [ ] Второй критерий приёмки',
  },
  {
    name: 'Задача',
    type: 'Task',
    description: '## Что нужно сделать\nКоротко опишите работу',
    acceptance: '- [ ] Работа выполнена',
  },
];

export function defaultTemplates(projectId: string, ctx: Ctx): IssueTemplate[] {
  return DEFAULT_TEMPLATE_INPUTS.map((t) => ({ id: ctx.newId(), projectId, ...t }));
}

/** Шаблоны проекта в порядке добавления. */
export function templatesOf(view: Pick<View, 'templates' | 'projectId'>): IssueTemplate[] {
  return view.templates.filter((t) => t.projectId === view.projectId);
}

function validate(view: View, input: TemplateInput, exceptId?: string): FieldErrors {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  if (name.length === 0 || name.length > NAME_MAX)
    errors.name = `Введите название (до ${NAME_MAX} символов)`;
  else if (
    templatesOf(view).some((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase())
  )
    errors.name = 'Шаблон с таким названием уже есть';
  if (!ISSUE_TYPES.includes(input.type) || input.type === 'Epic')
    errors.type = 'Выберите тип: Story, Task, Bug или Sub-task';
  if (input.description.length > TEXT_MAX) errors.description = `Не больше ${TEXT_MAX} символов`;
  if (input.acceptance.length > TEXT_MAX) errors.acceptance = `Не больше ${TEXT_MAX} символов`;
  return errors;
}

export function createTemplate(view: View, input: TemplateInput, ctx: Ctx): Result {
  const errors = validate(view, input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    changes: {
      templates: [
        {
          id: ctx.newId(),
          projectId: view.projectId,
          name: input.name.trim(),
          type: input.type,
          description: input.description,
          acceptance: input.acceptance,
        },
      ],
    },
  };
}

export function updateTemplate(view: View, id: string, input: TemplateInput): Result {
  const existing = templatesOf(view).find((t) => t.id === id);
  if (!existing) return { ok: false, errors: { form: 'Шаблон не найден' } };
  const errors = validate(view, input, id);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const next: IssueTemplate = {
    ...existing,
    name: input.name.trim(),
    type: input.type,
    description: input.description,
    acceptance: input.acceptance,
  };
  if (JSON.stringify(next) === JSON.stringify(existing)) return { ok: true, changes: {} };
  return { ok: true, changes: { templates: [next] } };
}

export function deleteTemplate(view: View, id: string): Result {
  if (!templatesOf(view).some((t) => t.id === id))
    return { ok: false, errors: { form: 'Шаблон не найден' } };
  return { ok: true, changes: { deleteTemplateIds: [id] } };
}
