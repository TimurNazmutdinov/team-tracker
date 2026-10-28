import { useState } from 'react';
import { parentCandidates, type FieldErrors, type View } from '../../domain/actions';
import { canHavePoints } from '../../domain/hierarchy';
import type { Issue, Priority, Status } from '../../domain/schema';
import { STATUSES } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { SelectField, TextField } from '../../ui/fields';
import { PRIORITY_OPTIONS } from './IssueBits';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

/** Боковая панель карточки: поля меняются на месте, каждое изменение пишет историю (ADR-003). */
export function IssueSidebar({
  issue,
  view,
  projectKey,
  readOnly,
}: {
  issue: Issue;
  view: View;
  projectKey: string;
  readOnly: boolean;
}) {
  const actions = useActions(view.projectId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [points, setPoints] = useState(issue.points === null ? '' : String(issue.points));
  const [labels, setLabels] = useState(issue.labels.join(', '));
  const [dueDate, setDueDate] = useState(issue.dueDate ?? '');

  const apply = async (patch: Parameters<typeof actions.updateIssue>[1]) => {
    const result = await actions.updateIssue(issue.id, patch);
    setErrors(result.ok ? {} : result.errors);
  };

  const isSub = issue.type === 'Sub-task';
  const sprints = view.sprints.filter((s) => s.state !== 'closed' || s.id === issue.sprintId);
  const parents = parentCandidates(view, issue.type, issue.id);
  const reporter = view.people.find((p) => p.id === issue.reporterId);

  return (
    <aside className="sidebar" aria-label="Поля задачи">
      <SelectField
        name="status"
        label="Статус"
        value={issue.status}
        disabled={readOnly}
        options={STATUSES.map((s) => ({ value: s, label: s }))}
        onChange={(v) => void apply({ status: v as Status })}
        error={errors.status}
      />
      <SelectField
        name="assigneeId"
        label="Исполнитель"
        value={issue.assigneeId ?? ''}
        disabled={readOnly}
        options={[
          { value: '', label: 'Не назначен' },
          ...view.people.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onChange={(v) => void apply({ assigneeId: v === '' ? null : v })}
        error={errors.assigneeId}
      />
      <div className="field">
        <span className="label">Автор</span>
        <p>{reporter?.name ?? '—'}</p>
      </div>
      <SelectField
        name="priority"
        label="Приоритет"
        value={issue.priority}
        disabled={readOnly}
        options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
        onChange={(v) => void apply({ priority: v as Priority })}
        error={errors.priority}
      />
      {canHavePoints(issue.type) ? (
        <TextField
          name="points"
          label="Story points"
          type="number"
          min="0"
          value={points}
          disabled={readOnly}
          onChange={setPoints}
          onBlur={() => {
            const next = points.trim() === '' ? null : Number(points);
            if (next !== issue.points) void apply({ points: next });
          }}
          error={errors.points}
        />
      ) : (
        <div className="field">
          <span className="label">Story points</span>
          <p className="muted">— для этого типа не ставятся</p>
        </div>
      )}
      {isSub ? (
        <div className="field">
          <span className="label">Спринт</span>
          <p>
            {view.sprints.find((s) => s.id === issue.sprintId)?.name ?? 'Бэклог'} (как у родителя)
          </p>
        </div>
      ) : (
        <SelectField
          name="sprintId"
          label="Спринт"
          value={issue.sprintId ?? ''}
          disabled={readOnly}
          options={[
            { value: '', label: 'Бэклог' },
            ...sprints.map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={(v) => void apply({ sprintId: v === '' ? null : v })}
          error={errors.sprintId}
        />
      )}
      {issue.type !== 'Epic' && (
        <SelectField
          name="parentId"
          label={isSub ? 'Родитель' : 'Родитель (Epic)'}
          value={issue.parentId ?? ''}
          disabled={readOnly}
          options={[
            { value: '', label: isSub ? 'Выберите родителя' : 'Без родителя', disabled: isSub },
            ...parents.map((p) => ({ value: p.id, label: `${projectKey}-${p.number} ${p.title}` })),
          ]}
          onChange={(v) => void apply({ parentId: v === '' ? null : v })}
          error={errors.parentId}
        />
      )}
      <TextField
        name="labels"
        label="Метки"
        hint="Через запятую"
        value={labels}
        disabled={readOnly}
        onChange={setLabels}
        onBlur={() => {
          if (labels !== issue.labels.join(', ')) void apply({ labels: labels.split(',') });
        }}
      />
      <TextField
        name="dueDate"
        label="Срок"
        type="date"
        value={dueDate}
        disabled={readOnly}
        onChange={(v) => {
          setDueDate(v);
          void apply({ dueDate: v === '' ? null : v });
        }}
        error={errors.dueDate}
      />
      <div className="field">
        <span className="label">Создана</span>
        <p>{fmtDateTime(issue.createdAt)}</p>
      </div>
      <div className="field">
        <span className="label">Обновлена</span>
        <p>{fmtDateTime(issue.updatedAt)}</p>
      </div>
      {errors.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
    </aside>
  );
}
