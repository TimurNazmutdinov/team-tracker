import { useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  parentCandidates,
  type FieldErrors,
  type NewIssueInput,
  type NewLink,
  type NewLinkKind,
} from '../../domain/actions';
import { canHavePoints, isContainer, needsParent } from '../../domain/hierarchy';
import { labelStats } from '../../domain/labels';
import { templatesOf } from '../../domain/templates';
import type { IssueType, Priority } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { useCreateDialog, type CreatePreset } from '../../state/create-dialog';
import { useNotices } from '../../state/notices';
import { useProjectScope } from '../../state/project-scope';
import { useView } from '../../state/queries';
import { Dialog } from '../../ui/Dialog';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { IssuePicker } from '../../ui/IssuePicker';
import { LabelsInput } from '../../ui/LabelsInput';
import { Loading } from '../../ui/Loading';
import { MarkdownField, SelectField, TextField } from '../../ui/fields';
import { PRIORITY_OPTIONS, TYPE_HINTS, TYPE_OPTIONS, TypeIcon } from './IssueBits';

interface Props {
  projectId: string;
  projectKey: string;
}

/**
 * Окно «Создать» (wireframes.md, 27.4; D-3): проект и тип первыми, шаблоны выбранного типа, родитель
 * из выбранного проекта, метки чипами, связи сразу при создании. Монтируется только пока открыто.
 */
export function CreateIssueDialog({ projectId }: Props) {
  const { open, preset, hide } = useCreateDialog();
  if (!open) return null;
  return (
    <Dialog title="Создать" onClose={hide}>
      <CreateForm initialProjectId={preset.projectId ?? projectId} preset={preset} onClose={hide} />
    </Dialog>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

const LINK_KINDS: { value: NewLinkKind; label: string }[] = [
  { value: 'blocks', label: 'блокирует' },
  { value: 'depends', label: 'зависит от' },
  { value: 'relates', label: 'связана с' },
  { value: 'duplicates', label: 'дубликат задачи' },
];

interface LinkDraft {
  key: number;
  kind: NewLinkKind;
  issueId: string;
}

function CreateForm({
  initialProjectId,
  preset,
  onClose,
}: {
  initialProjectId: string;
  preset: CreatePreset;
  onClose: () => void;
}) {
  const { all } = useProjectScope();
  const [projectId, setProjectId] = useState(initialProjectId);
  const view = useView(projectId);
  const actions = useActions(projectId);
  const perms = usePermissions();
  const push = useNotices((s) => s.push);

  const [type, setType] = useState<IssueType>(preset.type ?? 'Task');
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [showAcceptance, setShowAcceptance] = useState(false);
  const [parentId, setParentId] = useState(preset.parentId ?? '');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [points, setPoints] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [sprintId, setSprintId] = useState(preset.sprintId ?? '');
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [again, setAgain] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const projectOptions =
    all.some((p) => p.id === projectId) || !view ? all : [view.project, ...all];

  const changeProject = (id: string) => {
    if (id === projectId) return;
    // родитель, спринт, шаблон и связи принадлежат проекту — при смене проекта сбрасываются
    setProjectId(id);
    setParentId('');
    setSprintId('');
    setLinks([]);
    setTemplateId('');
  };

  const templates = view ? templatesOf(view).filter((t) => t.type === type) : [];
  const applyTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    const current = templates.find((t) => t.id === templateId);
    const touched =
      (description !== '' && description !== (current?.description ?? '')) ||
      (acceptance !== '' && acceptance !== (current?.acceptance ?? ''));
    if (tpl && touched && !window.confirm('Заменить уже введённые описание и критерии шаблоном?')) {
      return;
    }
    setTemplateId(id);
    if (!tpl) {
      if (current && description === current.description) setDescription('');
      if (current && acceptance === current.acceptance) setAcceptance('');
      return;
    }
    setDescription(tpl.description);
    setAcceptance(tpl.acceptance);
    if (tpl.acceptance) setShowAcceptance(true);
  };

  const changeType = (next: IssueType) => {
    if (next === type) return;
    // шаблон другого типа не подходит: его текст убирается, если его не меняли
    const current = templates.find((t) => t.id === templateId);
    if (current) {
      if (description === current.description) setDescription('');
      if (acceptance === current.acceptance) setAcceptance('');
      setTemplateId('');
    }
    setType(next);
  };

  const key = view?.project.key ?? '';
  const candidates = view ? parentCandidates(view, type) : [];
  const parentValid = candidates.some((i) => i.id === parentId);
  const effectiveParent = parentValid ? parentId : '';
  const isSub = type === 'Sub-task';
  const sprints = view ? view.sprints.filter((s) => s.state !== 'closed') : [];
  const parentIssue = view?.issues.find((i) => i.id === effectiveParent);
  const parentSprint = view?.sprints.find((s) => s.id === parentIssue?.sprintId);
  const stats = view ? labelStats(view.issues) : [];
  const linkable = view ? [...view.issues].sort((a, b) => b.number - a.number) : [];

  const reset = () => {
    const tpl = templates.find((t) => t.id === templateId);
    setTitle('');
    setDescription(tpl?.description ?? '');
    setAcceptance(tpl?.acceptance ?? '');
    setPoints('');
    setDueDate('');
    setLinks([]);
    setErrors({});
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || !view) return;
    const input: NewIssueInput = {
      type,
      title,
      description,
      acceptance,
      parentId: effectiveParent === '' ? null : effectiveParent,
      priority,
      points: canHavePoints(type) && points.trim() !== '' ? Number(points) : null,
      assigneeId: assigneeId === '' ? null : assigneeId,
      labels,
      dueDate: dueDate === '' ? null : dueDate,
      sprintId: sprintId === '' || isContainer(type) ? null : sprintId,
    };
    const chosenLinks: NewLink[] = links
      .filter((l) => l.issueId !== '')
      .map((l) => ({ kind: l.kind, issueId: l.issueId }));
    setBusy(true);
    const result = await actions.createIssue(input, chosenLinks);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const created = result.changes.issues?.[0];
    if (created) {
      push(`Создана задача ${key}-${created.number}`, 'success', {
        to: `/projects/${key}/issues/${created.number}`,
        label: 'Открыть',
      });
    } else push('Задача создана');
    if (again) reset();
    else onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      className="form-grid create-form"
      onSubmit={(e) => void submit(e)}
      onKeyDown={onKeyDown}
      noValidate
    >
      <SelectField
        name="projectId"
        label="Проект"
        required
        value={projectId}
        options={projectOptions.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))}
        onChange={changeProject}
        tip="Проект, в котором появится задача: эпики, спринты и связи — из него"
      />
      <div className="field type-field">
        <span className="label" id="create-type-label">
          Тип *
        </span>
        <div className="type-buttons" role="radiogroup" aria-labelledby="create-type-label">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              className={type === t ? 'selected' : ''}
              title={TYPE_HINTS[t]}
              onClick={() => changeType(t)}
            >
              <span aria-hidden="true">
                <TypeIcon type={t} />
              </span>{' '}
              {t}
            </button>
          ))}
        </div>
        <p className="hint">{TYPE_HINTS[type]}</p>
        {errors.type && <ErrorMessage message={errors.type} />}
      </div>

      {!view ? (
        <div className="wide">
          <Loading />
        </div>
      ) : (
        <>
          {templates.length > 0 ? (
            <SelectField
              name="template"
              label={`Шаблон для ${type}`}
              value={templateId}
              options={[
                { value: '', label: 'Без шаблона' },
                ...templates.map((t) => ({ value: t.id, label: t.name })),
              ]}
              onChange={applyTemplate}
              tip="Шаблон подставит описание и критерии приёмки"
            />
          ) : (
            <div className="field">
              <span className="label">Шаблон</span>
              <p className="muted">Для {type} шаблонов нет</p>
            </div>
          )}
          {type !== 'Epic' ? (
            <SelectField
              name="parentId"
              label={
                isSub
                  ? 'Родитель (Task или Bug)'
                  : type === 'Sub-epic'
                    ? `Родитель (эпик проекта ${key})`
                    : `Родитель (эпик или под-эпик проекта ${key})`
              }
              required={needsParent(type)}
              value={effectiveParent}
              options={[
                {
                  value: '',
                  label: needsParent(type)
                    ? candidates.length > 0
                      ? 'Выберите родителя'
                      : 'В проекте нет подходящих родителей'
                    : 'Без родителя',
                },
                ...candidates.map((i) => ({
                  value: i.id,
                  label: `${key}-${i.number} ${i.title}`,
                })),
              ]}
              onChange={setParentId}
              error={errors.parentId}
            />
          ) : (
            <div className="field">
              <span className="label">Родитель</span>
              <p className="muted">Эпик — верхний уровень, родителя нет</p>
            </div>
          )}
          <TextField
            name="title"
            label="Название"
            required
            className="wide"
            value={title}
            onChange={setTitle}
            error={errors.title}
          />
          <MarkdownField
            name="description"
            label="Описание"
            className="wide"
            rows={3}
            value={description}
            onChange={setDescription}
          />
          {showAcceptance || acceptance ? (
            <MarkdownField
              name="acceptance"
              label="Критерии приёмки"
              className="wide"
              rows={2}
              value={acceptance}
              onChange={setAcceptance}
            />
          ) : (
            <p className="wide">
              <button type="button" className="link" onClick={() => setShowAcceptance(true)}>
                + Критерии приёмки
              </button>
            </p>
          )}
          <div className="wide field-row">
            <SelectField
              name="priority"
              label="Приоритет"
              value={priority}
              options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
              onChange={(v) => setPriority(v as Priority)}
              error={errors.priority}
            />
            {canHavePoints(type) && (
              <TextField
                name="points"
                label="Story points"
                type="number"
                min="0"
                value={points}
                onChange={setPoints}
                hint="1, 2, 3, 5, 8, 13"
                error={errors.points}
              />
            )}
            <SelectField
              name="assigneeId"
              label="Исполнитель"
              value={assigneeId}
              options={[
                { value: '', label: 'Не назначен' },
                ...view.people.map((p) => ({ value: p.id, label: p.name })),
              ]}
              onChange={setAssigneeId}
              error={errors.assigneeId}
            />
            <TextField
              name="dueDate"
              label="Срок"
              type="date"
              min={today()}
              value={dueDate}
              onChange={setDueDate}
              error={errors.dueDate}
            />
          </div>
          <LabelsInput
            label="Метки"
            value={labels}
            onChange={setLabels}
            stats={stats}
            hint="Enter или запятая — добавить; «система: Fabric» — метка с группой"
          />
          {isSub ? (
            <div className="field">
              <span className="label">Спринт</span>
              <p className="muted">
                {parentSprint ? parentSprint.name : 'Бэклог'} — как у родителя
              </p>
            </div>
          ) : isContainer(type) ? (
            <div className="field">
              <span className="label">Спринт</span>
              <p className="muted">Эпик и под-эпик в спринт не ставятся — только их задачи</p>
            </div>
          ) : (
            <SelectField
              name="sprintId"
              label="Спринт"
              value={sprintId}
              disabled={!perms.can('sprint.items')}
              options={[
                { value: '', label: 'Бэклог' },
                ...sprints.map((s) => ({ value: s.id, label: s.name })),
              ]}
              onChange={setSprintId}
              error={errors.sprintId}
            />
          )}

          <fieldset className="wide links-fieldset">
            <legend>Связи</legend>
            {links.length === 0 && (
              <p className="muted small">
                Блокирует, зависит от, связана с, дубликат — можно задать сразу.
              </p>
            )}
            {links.map((l) => (
              <div key={l.key} className="link-draft">
                <SelectField
                  name={`link-kind-${l.key}`}
                  label="Тип связи"
                  value={l.kind}
                  options={LINK_KINDS}
                  onChange={(v) =>
                    setLinks(
                      links.map((x) => (x.key === l.key ? { ...x, kind: v as NewLinkKind } : x)),
                    )
                  }
                />
                <IssuePicker
                  label="Задача"
                  issues={linkable}
                  projectKey={key}
                  value={l.issueId}
                  onChange={(id) =>
                    setLinks(links.map((x) => (x.key === l.key ? { ...x, issueId: id } : x)))
                  }
                />
                <button
                  type="button"
                  className="plain"
                  aria-label="Убрать связь"
                  title="Убрать связь"
                  onClick={() => setLinks(links.filter((x) => x.key !== l.key))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="link"
              onClick={() =>
                setLinks([
                  ...links,
                  { key: Date.now() + links.length, kind: 'blocks', issueId: '' },
                ])
              }
            >
              + {links.length === 0 ? 'Добавить связь' : 'Ещё связь'}
            </button>
            {errors.links && <ErrorMessage message={errors.links} />}
          </fieldset>
        </>
      )}

      {errors.form && (
        <div className="wide">
          <ErrorMessage message={errors.form} />
        </div>
      )}
      <div className="dialog-actions wide">
        <button type="submit" className="primary" disabled={busy || !view}>
          Создать <span className="muted-on-primary">(Ctrl+Enter)</span>
        </button>
        <button type="button" onClick={onClose}>
          Отмена
        </button>
        <label
          className="check"
          title="Окно не закроется: проект, тип, родитель и метки сохранятся"
        >
          <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
          Создать ещё одну
        </label>
      </div>
    </form>
  );
}
