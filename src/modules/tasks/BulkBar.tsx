import { useState } from 'react';
import type { Result } from '../../domain/actions';
import type { BulkPatch } from '../../domain/bulk';
import {
  PRIORITIES,
  STATUSES,
  type Person,
  type Priority,
  type Sprint,
  type Status,
} from '../../domain/schema';
import { usePermissions } from '../../state/current-user';

const KEEP = '';
const NONE = '__none__';
const BACKLOG = '__backlog__';

/**
 * Панель массовых действий (wireframes.md, 20.2): появляется, когда отмечена хотя бы одна задача.
 * Поля, недоступные роли, скрыты; «Применить» меняет все отмеченные задачи одним сохранением.
 */
export function BulkBar({
  count,
  summary,
  people,
  sprints,
  statusAllowed,
  onApply,
  onClear,
}: {
  count: number;
  /** Текст в начале панели; по умолчанию «Выбрано: n». */
  summary?: string;
  people: Person[];
  /** Спринты для переноса; без списка поле «Спринт» не показывается. */
  sprints?: Sprint[] | undefined;
  /** Можно ли менять статус всех отмеченных задач. */
  statusAllowed: boolean;
  onApply: (patch: BulkPatch) => Promise<Result>;
  onClear: () => void;
}) {
  const perms = usePermissions();
  const [status, setStatus] = useState(KEEP);
  const [assignee, setAssignee] = useState(KEEP);
  const [priority, setPriority] = useState(KEEP);
  const [sprint, setSprint] = useState(KEEP);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const showPriority = perms.can('backlog.rank');
  const showSprint = sprints !== undefined && perms.can('sprint.items');

  const apply = async () => {
    const patch: BulkPatch = {};
    if (status !== KEEP && statusAllowed) patch.status = status as Status;
    if (assignee !== KEEP) patch.assigneeId = assignee === NONE ? null : assignee;
    if (priority !== KEEP && showPriority) patch.priority = priority as Priority;
    if (sprint !== KEEP && showSprint) patch.sprintId = sprint === BACKLOG ? null : sprint;
    if (label.trim() !== '') patch.addLabel = label.trim();
    if (Object.keys(patch).length === 0) {
      setError('Выберите, что изменить.');
      return;
    }
    setBusy(true);
    const result = await onApply(patch);
    setBusy(false);
    if (result.ok) {
      setError('');
    } else setError(Object.values(result.errors).join('. '));
  };

  return (
    <section className="bulk-bar" aria-label="Массовые действия">
      <strong>{summary ?? `Выбрано: ${count}`}</strong>
      {statusAllowed && (
        <label>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={KEEP}>— не менять —</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Исполнитель
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value={KEEP}>— не менять —</option>
          <option value={NONE}>Не назначен</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {showPriority && (
        <label>
          Приоритет
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value={KEEP}>— не менять —</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}
      {showSprint && (
        <label>
          Спринт
          <select value={sprint} onChange={(e) => setSprint(e.target.value)}>
            <option value={KEEP}>— не менять —</option>
            <option value={BACKLOG}>Бэклог</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Добавить метку
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button type="button" className="primary" disabled={busy} onClick={() => void apply()}>
        Применить
      </button>
      <button type="button" onClick={onClear}>
        Снять выбор
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
