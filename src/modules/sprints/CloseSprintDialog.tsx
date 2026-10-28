import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { FieldErrors, View } from '../../domain/actions';
import type { Sprint } from '../../domain/schema';
import { nextSprintDefaults } from '../../domain/settings';
import { closeSummary, type CloseTarget } from '../../domain/sprints';
import { useActions } from '../../state/actions';
import { useNotices } from '../../state/notices';
import { Dialog } from '../../ui/Dialog';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { TextField } from '../../ui/fields';
import { TypeIcon } from '../tasks/IssueBits';

const today = () => new Date().toISOString().slice(0, 10);

type Choice = 'sprint' | 'backlog' | 'new';

const plural = (n: number) =>
  n % 10 === 1 && n % 100 !== 11
    ? 'задача'
    : 2 <= n % 10 && n % 10 <= 4 && !(12 <= n % 100 && n % 100 <= 14)
      ? 'задачи'
      : 'задач';

/** Окно «Закрыть спринт» (wireframes.md, раздел 7): сводка и выбор, куда перенести незавершённое. */
export function CloseSprintDialog({
  view,
  sprint,
  projectKey,
  onClose,
}: {
  view: View;
  sprint: Sprint;
  projectKey: string;
  onClose: () => void;
}) {
  const actions = useActions(view.projectId);
  const push = useNotices((s) => s.push);
  const summary = closeSummary(view, sprint.id);
  const planned = view.sprints
    .filter((s) => s.state === 'planned')
    .sort((a, b) => a.start.localeCompare(b.start));
  const [choice, setChoice] = useState<Choice>(planned.length > 0 ? 'sprint' : 'backlog');
  const [sprintId, setSprintId] = useState(planned[0]?.id ?? '');
  const defaults = nextSprintDefaults(view, today());
  const [name, setName] = useState(defaults.name);
  const [goal, setGoal] = useState('');
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const hasCarried = summary.carried.length > 0;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const target: CloseTarget =
      choice === 'sprint'
        ? { kind: 'sprint', sprintId }
        : choice === 'backlog'
          ? { kind: 'backlog' }
          : { kind: 'new', sprint: { name, goal, start, end } };
    setBusy(true);
    const result = await actions.closeSprint(sprint.id, target);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    push(
      `Спринт «${sprint.name}» закрыт: velocity ${summary.velocity} sp` +
        (hasCarried ? `, перенесено задач: ${summary.carried.length}` : ''),
    );
    onClose();
  };

  return (
    <Dialog title={`Закрыть «${sprint.name}»?`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <p>
          Выполнено: {summary.doneCount} {plural(summary.doneCount)} · {summary.velocity} sp
        </p>
        <p>
          <strong>
            Не завершено: {summary.carried.length} {plural(summary.carried.length)} ·{' '}
            {summary.carriedPoints} sp
          </strong>
        </p>
        {hasCarried && (
          <ul className="plain-list">
            {summary.carried.slice(0, 3).map((i) => (
              <li key={i.id} className="link-row">
                <TypeIcon type={i.type} />
                <Link to={`/projects/${projectKey}/issues/${i.number}`} className="issue-key">
                  {projectKey}-{i.number}
                </Link>
                <span className="issue-title">{i.title}</span>
              </li>
            ))}
            {summary.carried.length > 3 && (
              <li className="muted">
                …ещё {summary.carried.length - 3} {plural(summary.carried.length - 3)}
              </li>
            )}
          </ul>
        )}
        {summary.staying.length > 0 && (
          <p className="warn">
            Незавершённые подзадачи (
            {summary.staying.map((i) => `${projectKey}-${i.number}`).join(', ')}) остаются в
            закрытом спринте вместе с выполненным родителем.
          </p>
        )}

        {hasCarried && (
          <fieldset className="choices">
            <legend>Куда перенести незавершённое</legend>
            {planned.map((s) => (
              <label key={s.id}>
                <input
                  type="radio"
                  name="target"
                  checked={choice === 'sprint' && sprintId === s.id}
                  onChange={() => {
                    setChoice('sprint');
                    setSprintId(s.id);
                  }}
                />
                В «{s.name}» (запланирован)
              </label>
            ))}
            <label>
              <input
                type="radio"
                name="target"
                checked={choice === 'backlog'}
                onChange={() => setChoice('backlog')}
              />
              Обратно в бэклог
            </label>
            <label>
              <input
                type="radio"
                name="target"
                checked={choice === 'new'}
                onChange={() => setChoice('new')}
              />
              В новый спринт
            </label>
            {errors.target && (
              <p className="field-error" role="alert">
                {errors.target}
              </p>
            )}
            {choice === 'new' && (
              <div className="form-grid">
                <TextField
                  name="newName"
                  label="Название"
                  required
                  value={name}
                  onChange={setName}
                  error={errors.newName}
                />
                <TextField
                  name="newGoal"
                  label="Цель"
                  value={goal}
                  onChange={setGoal}
                  error={errors.newGoal}
                />
                <TextField
                  name="newStart"
                  label="Дата старта"
                  type="date"
                  value={start}
                  onChange={setStart}
                  error={errors.newStart}
                />
                <TextField
                  name="newEnd"
                  label="Дата окончания"
                  type="date"
                  value={end}
                  onChange={setEnd}
                  error={errors.newEnd}
                />
              </div>
            )}
          </fieldset>
        )}

        <p className="muted small">
          Velocity спринта: {summary.velocity} sp — сумма story points задач в Done на момент
          закрытия. После закрытия спринт доступен только для чтения.
        </p>
        {errors.form && <ErrorMessage message={errors.form} />}
        <div className="dialog-actions">
          <button type="submit" className="primary" disabled={busy}>
            Закрыть спринт
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </Dialog>
  );
}
