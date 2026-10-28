import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { FieldErrors, View } from '../../domain/actions';
import type { Sprint } from '../../domain/schema';
import { addDays, nextSprintDefaults } from '../../domain/settings';
import { useActions } from '../../state/actions';
import { useNotices } from '../../state/notices';
import { Dialog } from '../../ui/Dialog';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { TextArea, TextField } from '../../ui/fields';

const today = () => new Date().toISOString().slice(0, 10);

/** Окно «Новый спринт» / «Изменить спринт» (F-08). Значения по умолчанию — из настроек проекта. */
export function SprintFormDialog({
  view,
  sprint,
  onClose,
  onSaved,
}: {
  view: View;
  /** Если задан, окно правит этот спринт, иначе создаёт новый. */
  sprint?: Sprint;
  onClose: () => void;
  onSaved?: (sprintId: string) => void;
}) {
  const actions = useActions(view.projectId);
  const push = useNotices((s) => s.push);
  const defaults = sprint ?? nextSprintDefaults(view, today());
  const [name, setName] = useState(defaults.name);
  const [goal, setGoal] = useState(defaults.goal);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [endTouched, setEndTouched] = useState(sprint !== undefined);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const duration = view.project.sprintDurationDays;

  const changeStart = (value: string) => {
    setStart(value);
    // пока конец не правили вручную, он следует за началом и длительностью из настроек
    if (!endTouched && /^\d{4}-\d{2}-\d{2}$/.test(value)) setEnd(addDays(value, duration - 1));
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    const input = { name, goal, start, end };
    const result = sprint
      ? await actions.updateSprint(sprint.id, input)
      : await actions.createSprint(input);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const saved = sprint ?? result.changes.sprints?.[0];
    push(sprint ? `Спринт «${name.trim()}» сохранён` : `Создан спринт «${name.trim()}»`);
    if (saved) onSaved?.(saved.id);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Dialog title={sprint ? 'Изменить спринт' : 'Новый спринт'} onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => void submit(e)} onKeyDown={onKeyDown} noValidate>
        <TextField
          name="name"
          label="Название"
          required
          className="wide"
          value={name}
          onChange={setName}
          error={errors.name}
        />
        <TextArea
          name="goal"
          label="Цель"
          className="wide"
          rows={2}
          value={goal}
          onChange={setGoal}
          error={errors.goal}
        />
        <TextField
          name="start"
          label="Дата старта"
          type="date"
          required
          value={start}
          onChange={changeStart}
          error={errors.start}
        />
        <TextField
          name="end"
          label="Дата окончания"
          type="date"
          required
          value={end}
          onChange={(v) => {
            setEnd(v);
            setEndTouched(true);
          }}
          hint={`Длительность по умолчанию — ${duration} дн. (настройки проекта)`}
          error={errors.end}
        />
        {errors.form && (
          <div className="wide">
            <ErrorMessage message={errors.form} />
          </div>
        )}
        <div className="dialog-actions wide">
          <button type="submit" className="primary" disabled={busy}>
            {sprint ? 'Сохранить' : 'Создать'}{' '}
            <span className="muted-on-primary">(Ctrl+Enter)</span>
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </Dialog>
  );
}
