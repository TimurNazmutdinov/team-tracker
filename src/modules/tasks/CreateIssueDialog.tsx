import { useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  parentCandidates,
  type FieldErrors,
  type NewIssueInput,
  type View,
} from '../../domain/actions';
import { canHavePoints } from '../../domain/hierarchy';
import type { IssueType, Priority } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { useCreateDialog, type CreatePreset } from '../../state/create-dialog';
import { useNotices } from '../../state/notices';
import { useView } from '../../state/queries';
import { Dialog } from '../../ui/Dialog';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { Loading } from '../../ui/Loading';
import { SelectField, TextArea, TextField } from '../../ui/fields';
import { PRIORITY_OPTIONS, TYPE_OPTIONS } from './IssueBits';

interface Props {
  projectId: string;
  projectKey: string;
}

/** Окно «Создать задачу» (wireframes.md, раздел 9). Монтируется только пока открыто. */
export function CreateIssueDialog({ projectId, projectKey }: Props) {
  const { open, preset, hide } = useCreateDialog();
  const view = useView(projectId);
  if (!open) return null;
  return (
    <Dialog title="Создать задачу" onClose={hide}>
      {view ? (
        <CreateForm view={view} projectKey={projectKey} preset={preset} onClose={hide} />
      ) : (
        <Loading />
      )}
    </Dialog>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function CreateForm({
  view,
  projectKey,
  preset,
  onClose,
}: {
  view: View;
  projectKey: string;
  preset: CreatePreset;
  onClose: () => void;
}) {
  const actions = useActions(view.projectId);
  const push = useNotices((s) => s.push);
  const [type, setType] = useState<IssueType>(preset.type ?? 'Task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [parentId, setParentId] = useState(preset.parentId ?? '');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [points, setPoints] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [labels, setLabels] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sprintId, setSprintId] = useState(preset.sprintId ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const candidates = parentCandidates(view, type);
  const parentValid = candidates.some((i) => i.id === parentId);
  const effectiveParent = parentValid ? parentId : '';
  const isSub = type === 'Sub-task';
  const sprints = view.sprints.filter((s) => s.state !== 'closed');
  const parentIssue = view.issues.find((i) => i.id === effectiveParent);
  const parentSprint = view.sprints.find((s) => s.id === parentIssue?.sprintId);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const input: NewIssueInput = {
      type,
      title,
      description,
      acceptance,
      parentId: effectiveParent === '' ? null : effectiveParent,
      priority,
      points: canHavePoints(type) && points.trim() !== '' ? Number(points) : null,
      assigneeId: assigneeId === '' ? null : assigneeId,
      labels: labels.split(','),
      dueDate: dueDate === '' ? null : dueDate,
      sprintId: sprintId === '' ? null : sprintId,
    };
    setBusy(true);
    const result = await actions.createIssue(input);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const created = result.changes.issues?.[0];
    push(created ? `Создана задача ${projectKey}-${created.number}` : 'Задача создана');
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form className="form-grid" onSubmit={(e) => void submit(e)} onKeyDown={onKeyDown} noValidate>
      <SelectField
        name="type"
        label="Тип"
        required
        value={type}
        options={TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
        onChange={(v) => setType(v as IssueType)}
        error={errors.type}
      />
      {type !== 'Epic' && (
        <SelectField
          name="parentId"
          label={isSub ? 'Родитель (Story, Task или Bug)' : 'Родитель (Epic)'}
          required={isSub}
          value={effectiveParent}
          options={[
            { value: '', label: isSub ? 'Выберите родителя' : 'Без родителя' },
            ...candidates.map((i) => ({
              value: i.id,
              label: `${projectKey}-${i.number} ${i.title}`,
            })),
          ]}
          onChange={setParentId}
          error={errors.parentId}
        />
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
      <TextArea
        name="description"
        label="Описание"
        className="wide"
        rows={3}
        value={description}
        onChange={setDescription}
      />
      <TextArea
        name="acceptance"
        label="Критерии приёмки"
        className="wide"
        rows={2}
        value={acceptance}
        onChange={setAcceptance}
      />
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
          hint="Целое число; подсказка: 1, 2, 3, 5, 8, 13"
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
        name="labels"
        label="Метки"
        value={labels}
        onChange={setLabels}
        hint="Через запятую"
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
      {isSub ? (
        <div className="field">
          <span className="label">Спринт</span>
          <p className="muted">{parentSprint ? parentSprint.name : 'Бэклог'} — как у родителя</p>
        </div>
      ) : (
        <SelectField
          name="sprintId"
          label="Спринт"
          value={sprintId}
          options={[
            { value: '', label: 'Бэклог' },
            ...sprints.map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={setSprintId}
          error={errors.sprintId}
        />
      )}
      {errors.form && (
        <div className="wide">
          <ErrorMessage message={errors.form} />
        </div>
      )}
      <div className="dialog-actions wide">
        <button type="submit" className="primary" disabled={busy}>
          Создать <span className="muted-on-primary">(Ctrl+Enter)</span>
        </button>
        <button type="button" onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}
