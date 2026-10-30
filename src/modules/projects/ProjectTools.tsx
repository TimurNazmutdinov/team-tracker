import { useState, type FormEvent } from 'react';
import type { FieldErrors, View } from '../../domain/actions';
import { ISSUE_TYPES, WIP_COLUMNS, type IssueTemplate, type IssueType } from '../../domain/schema';
import { templatesOf, type TemplateInput } from '../../domain/templates';
import { WIP_MAX } from '../../domain/wip';
import { useActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { dodItems } from '../../domain/dod';
import { MarkdownField, SelectField, TextArea, TextField } from '../../ui/fields';

const TEMPLATE_TYPES = ISSUE_TYPES.filter((t) => t !== 'Epic');

/** WIP-лимиты проекта (wireframes.md, 20.4): переключатель и лимит на колонку; по умолчанию выключено. */
export function WipSettingsForm({ view }: { view: View }) {
  const actions = useActions(view.projectId);
  const canEdit = usePermissions().can('sprint.manage');
  const push = useNotices((s) => s.push);
  const [enabled, setEnabled] = useState(view.project.wipEnabled);
  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries(WIP_COLUMNS.map((c) => [c, String(view.project.wipLimits[c] ?? '')])),
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await actions.updateWipSettings({ enabled, limits });
    if (result.ok) {
      setErrors({});
      push('WIP-лимиты сохранены');
    } else setErrors(result.errors);
  };

  return (
    <form
      className="settings"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="wip-title"
    >
      <h2 id="wip-title">WIP-лимиты</h2>
      <p className="muted">
        Лимит задач в колонке доски. При превышении колонка помечается предупреждением, перенос не
        запрещается.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit}
          onChange={(e) => setEnabled(e.target.checked)}
        />{' '}
        Включить WIP-лимиты
      </label>
      <div className="form-row">
        {WIP_COLUMNS.map((c) => (
          <TextField
            key={c}
            name={`wip-${c}`}
            label={`Лимит: ${c}`}
            type="number"
            min="1"
            disabled={!canEdit || !enabled}
            value={limits[c] ?? ''}
            onChange={(v) => setLimits({ ...limits, [c]: v })}
            hint={`1–${WIP_MAX}; пусто — без лимита`}
            error={errors[c]}
          />
        ))}
      </div>
      {errors.form && <ErrorMessage message={errors.form} />}
      {canEdit ? (
        <button type="submit" className="primary">
          Сохранить
        </button>
      ) : (
        <p className="muted">WIP-лимиты меняют тимлид и администратор.</p>
      )}
    </form>
  );
}

const EMPTY: TemplateInput = { name: '', type: 'Task', description: '', acceptance: '' };

function TemplateForm({
  view,
  template,
  onDone,
}: {
  view: View;
  template: IssueTemplate | null;
  onDone: () => void;
}) {
  const actions = useActions(view.projectId);
  const push = useNotices((s) => s.push);
  const [draft, setDraft] = useState<TemplateInput>(
    template
      ? {
          name: template.name,
          type: template.type,
          description: template.description,
          acceptance: template.acceptance,
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = template
      ? await actions.updateTemplate(template.id, draft)
      : await actions.createTemplate(draft);
    if (result.ok) {
      push(template ? 'Шаблон сохранён' : 'Шаблон создан');
      onDone();
    } else setErrors(result.errors);
  };

  return (
    <form
      className="template-form"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-label={template ? `Шаблон «${template.name}»` : 'Новый шаблон'}
    >
      <div className="form-row">
        <TextField
          name="template-name"
          label="Название шаблона"
          required
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
          error={errors.name}
        />
        <SelectField
          name="template-type"
          label="Тип задачи"
          value={draft.type}
          options={TEMPLATE_TYPES.map((t) => ({ value: t, label: t }))}
          onChange={(v) => setDraft({ ...draft, type: v as IssueType })}
          error={errors.type}
        />
      </div>
      <MarkdownField
        name="template-description"
        label="Описание"
        rows={6}
        value={draft.description}
        onChange={(description) => setDraft({ ...draft, description })}
        error={errors.description}
      />
      <MarkdownField
        name="template-acceptance"
        label="Критерии приёмки"
        rows={4}
        value={draft.acceptance}
        onChange={(acceptance) => setDraft({ ...draft, acceptance })}
        error={errors.acceptance}
      />
      {errors.form && <ErrorMessage message={errors.form} />}
      <button type="submit" className="primary">
        Сохранить шаблон
      </button>{' '}
      <button type="button" onClick={onDone}>
        Отмена
      </button>
    </form>
  );
}

/** Шаблоны задач проекта: список, правка и удаление (тимлид и администратор). */
export function TemplatesSection({ view }: { view: View }) {
  const actions = useActions(view.projectId);
  const canEdit = usePermissions().can('project.templates');
  const push = useNotices((s) => s.push);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const list = templatesOf(view);

  const remove = async (t: IssueTemplate) => {
    if (!window.confirm(`Удалить шаблон «${t.name}»? Созданные по нему задачи не изменятся.`))
      return;
    const result = await actions.deleteTemplate(t.id);
    if (result.ok) push('Шаблон удалён');
    else push(Object.values(result.errors).join('. '));
  };

  return (
    <section className="settings" aria-labelledby="templates-title">
      <h2 id="templates-title">Шаблоны задач</h2>
      <p className="muted">
        Шаблон подставляет тип, описание и критерии при создании задачи. Тексты — в Markdown.
      </p>
      {list.length === 0 && <p className="muted">Шаблонов нет.</p>}
      <ul className="plain-list">
        {list.map((t) => (
          <li key={t.id} className="template-row">
            {editing === t.id ? (
              <TemplateForm view={view} template={t} onDone={() => setEditing(null)} />
            ) : (
              <>
                <strong>{t.name}</strong> <span className="chip">{t.type}</span>
                {canEdit && (
                  <>
                    {' '}
                    <button type="button" onClick={() => setEditing(t.id)}>
                      Изменить
                    </button>{' '}
                    <button type="button" onClick={() => void remove(t)}>
                      Удалить
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' && (
        <TemplateForm view={view} template={null} onDone={() => setEditing(null)} />
      )}
      {canEdit ? (
        editing === null && (
          <button type="button" onClick={() => setEditing('new')}>
            + Новый шаблон
          </button>
        )
      ) : (
        <p className="muted">Шаблоны меняют тимлид и администратор.</p>
      )}
    </section>
  );
}

/** Definition of Done проекта (wireframes.md, 21.2): чек-лист; при переводе в Done пункты подтверждаются. */
export function DodSettingsForm({ view }: { view: View }) {
  const actions = useActions(view.projectId);
  const canEdit = usePermissions().can('sprint.manage');
  const push = useNotices((s) => s.push);
  const [text, setText] = useState(view.project.dod);
  const [errors, setErrors] = useState<FieldErrors>({});
  const count = dodItems({ dod: text }).length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await actions.updateDod(text);
    if (result.ok) {
      setErrors({});
      push('Definition of Done сохранён');
    } else setErrors(result.errors);
  };

  return (
    <form
      className="settings"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="dod-title"
    >
      <h2 id="dod-title">Definition of Done</h2>
      <p className="muted">
        Пункты в виде строк «- [ ] текст». При переводе задачи в Done их нужно подтвердить; пустой
        список — без подтверждения.
      </p>
      <TextArea
        name="dod"
        label="Список пунктов"
        rows={5}
        value={text}
        disabled={!canEdit}
        onChange={setText}
        hint={`Пунктов: ${count}`}
        error={errors.dod}
      />
      {errors.form && <ErrorMessage message={errors.form} />}
      {canEdit ? (
        <button type="submit" className="primary">
          Сохранить
        </button>
      ) : (
        <p className="muted">Definition of Done меняют тимлид и администратор.</p>
      )}
    </form>
  );
}
