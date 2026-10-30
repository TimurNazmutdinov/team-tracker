import { createIssue, type Ctx, type FieldErrors, type Result, type View } from './actions';
import { RETRO_KINDS, type RetroItem, type RetroKind } from './schema';

// Ретроспектива спринта (ADR-018): «что хорошо», «что улучшить», «действия». Действие одним
// действием превращается в задачу бэклога; запись хранит ссылку на неё.

export const RETRO_LABELS: Record<RetroKind, string> = {
  good: 'Что хорошо',
  improve: 'Что улучшить',
  action: 'Действия',
};

export const RETRO_TEXT_MAX = 500;
const TITLE_MAX = 200;

/** Записи спринта по порядку добавления. */
export function retroOf(view: Pick<View, 'retroItems'>, sprintId: string): RetroItem[] {
  return view.retroItems
    .filter((r) => r.sprintId === sprintId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export interface RetroInput {
  sprintId: string;
  kind: RetroKind;
  text: string;
}

export function addRetroItem(view: View, input: RetroInput, authorId: string, ctx: Ctx): Result {
  const errors: FieldErrors = {};
  const text = input.text.trim();
  if (!view.sprints.some((s) => s.id === input.sprintId)) errors.form = 'Спринт не найден';
  if (!RETRO_KINDS.includes(input.kind)) errors.kind = 'Выберите список';
  if (text.length === 0) errors.text = 'Введите текст';
  else if (text.length > RETRO_TEXT_MAX) errors.text = `Не больше ${RETRO_TEXT_MAX} символов`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    changes: {
      retroItems: [
        {
          id: ctx.newId(),
          projectId: view.projectId,
          sprintId: input.sprintId,
          kind: input.kind,
          text,
          authorId,
          createdAt: ctx.now(),
          issueId: null,
        },
      ],
    },
  };
}

export function deleteRetroItem(view: Pick<View, 'retroItems'>, id: string): Result {
  if (!view.retroItems.some((r) => r.id === id))
    return { ok: false, errors: { form: 'Запись не найдена' } };
  return { ok: true, changes: { deleteRetroItemIds: [id] } };
}

/** Создаёт из действия задачу в бэклоге (Task) и ставит записи ссылку на неё. */
export function retroToIssue(view: View, id: string, authorId: string, ctx: Ctx): Result {
  const item = view.retroItems.find((r) => r.id === id);
  if (!item) return { ok: false, errors: { form: 'Запись не найдена' } };
  if (item.kind !== 'action')
    return { ok: false, errors: { form: 'В задачу превращаются только действия' } };
  if (item.issueId !== null) return { ok: false, errors: { form: 'Задача уже создана' } };
  const sprint = view.sprints.find((s) => s.id === item.sprintId);
  const long = item.text.length > TITLE_MAX;
  const created = createIssue(
    view,
    {
      type: 'Task',
      title: long ? `${item.text.slice(0, TITLE_MAX - 1)}…` : item.text,
      description: `${long ? `${item.text}\n\n` : ''}Из ретроспективы: ${sprint?.name ?? 'спринт'}`,
      acceptance: '',
      parentId: null,
      priority: 'Medium',
      points: null,
      assigneeId: null,
      labels: ['ретро'],
      dueDate: null,
      sprintId: null,
    },
    authorId,
    ctx,
  );
  if (!created.ok) return created;
  const issue = created.changes.issues?.[0];
  if (!issue) return { ok: false, errors: { form: 'Задача не создана' } };
  return {
    ok: true,
    changes: { ...created.changes, retroItems: [{ ...item, issueId: issue.id }] },
  };
}
