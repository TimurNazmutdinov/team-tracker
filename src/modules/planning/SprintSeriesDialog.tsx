import { useState, type FormEvent } from 'react';
import type { View } from '../../domain/actions';
import { SERIES_MAX, createSprintSeries } from '../../domain/sprints';
import { useActions } from '../../state/actions';
import { useNotices } from '../../state/notices';
import { Dialog } from '../../ui/Dialog';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { TextField } from '../../ui/fields';
import { dateRange } from '../../ui/format';

const today = () => new Date().toISOString().slice(0, 10);
let previewSeq = 0;
const previewCtx = { now: () => '2000-01-01T00:00:00Z', newId: () => `preview-${previewSeq++}` };

/**
 * «+ Несколько спринтов…» в планировании (D-6, wireframes.md 27.5): сколько спринтов создать;
 * названия и даты подставляются подряд из настроек проекта, список показывается заранее.
 */
export function SprintSeriesDialog({ view, onClose }: { view: View; onClose: () => void }) {
  const actions = useActions(view.projectId);
  const push = useNotices((s) => s.push);
  const [count, setCount] = useState('3');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(count);
  const preview = createSprintSeries(view, n, today(), previewCtx);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await actions.createSprintSeries(n);
    setBusy(false);
    if (!result.ok) {
      setError(Object.values(result.errors).join('. '));
      return;
    }
    const made = result.changes.sprints ?? [];
    push(
      made.length === 1
        ? `Создан спринт «${made[0]?.name ?? ''}»`
        : `Создано спринтов: ${made.length} (${made[0]?.name ?? ''} — ${made.at(-1)?.name ?? ''})`,
    );
    onClose();
  };

  return (
    <Dialog title={`Несколько спринтов · ${view.project.key}`} onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          name="count"
          label="Сколько спринтов"
          type="number"
          min="1"
          value={count}
          onChange={setCount}
          hint={`От 1 до ${SERIES_MAX}; длительность — из настроек проекта (${view.project.sprintDurationDays} дн.)`}
          error={preview.ok ? undefined : Object.values(preview.errors).join('. ')}
        />
        <div className="field">
          <span className="label">Будут созданы</span>
          {preview.ok ? (
            <ul className="plain-list series-preview">
              {(preview.changes.sprints ?? []).map((s) => (
                <li key={s.id}>
                  <strong>{s.name}</strong>{' '}
                  <span className="muted">{dateRange(s.start, s.end)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">—</p>
          )}
        </div>
        {error && (
          <div className="wide">
            <ErrorMessage message={error} />
          </div>
        )}
        <div className="dialog-actions wide">
          <button type="submit" className="primary" disabled={busy || !preview.ok}>
            Создать
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </Dialog>
  );
}
