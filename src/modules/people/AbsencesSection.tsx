import { useState, type FormEvent } from 'react';
import type { FieldErrors, View } from '../../domain/actions';
import { ABSENCE_LABELS, workdays } from '../../domain/availability';
import { ABSENCE_KINDS, type AbsenceKind } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { SelectField, TextField } from '../../ui/fields';

const fmt = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Отсутствия людей (wireframes.md, 21.1): влияют на ёмкость спринтов; правят тимлид и администратор. */
export function AbsencesSection({ view }: { view: View }) {
  const actions = useActions(view.projectId);
  const canEdit = usePermissions().can('people.availability');
  const push = useNotices((s) => s.push);
  const [editing, setEditing] = useState<string | null>(null);
  const [personId, setPersonId] = useState(view.people[0]?.id ?? '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [kind, setKind] = useState<AbsenceKind>('vacation');
  const [errors, setErrors] = useState<FieldErrors>({});

  const name = (id: string) => view.people.find((p) => p.id === id)?.name ?? id;
  const list = [...view.absences].sort(
    (a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id),
  );

  const reset = () => {
    setEditing(null);
    setStart('');
    setEnd('');
    setKind('vacation');
    setErrors({});
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = { personId, start, end, kind };
    const result = editing
      ? await actions.updateAbsence(editing, input)
      : await actions.addAbsence(input);
    if (result.ok) {
      push(editing ? 'Отсутствие сохранено' : 'Отсутствие добавлено');
      reset();
    } else setErrors(result.errors);
  };

  const remove = async (id: string) => {
    const result = await actions.deleteAbsence(id);
    if (result.ok) push('Отсутствие удалено');
    else push(Object.values(result.errors).join('. '));
  };

  return (
    <section className="settings-card" aria-labelledby="absences-title">
      <h2 id="absences-title">Отсутствия</h2>
      <p className="muted">
        Отпуска и больничные уменьшают ёмкость спринтов команды проекта. Рабочие дни —
        понедельник–пятница без праздников.
      </p>
      {list.length === 0 ? (
        <p className="muted">Отсутствий нет: доступность команды 100 %.</p>
      ) : (
        <table className="absences">
          <thead>
            <tr>
              <th>Человек</th>
              <th>С</th>
              <th>По</th>
              <th>Вид</th>
              <th>Рабочих дней</th>
              {canEdit && <th>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>{name(a.personId)}</td>
                <td>{fmt(a.start)}</td>
                <td>{fmt(a.end)}</td>
                <td>{ABSENCE_LABELS[a.kind]}</td>
                <td>{workdays(a.start, a.end).length}</td>
                {canEdit && (
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(a.id);
                        setPersonId(a.personId);
                        setStart(a.start);
                        setEnd(a.end);
                        setKind(a.kind);
                        setErrors({});
                      }}
                    >
                      Изменить
                    </button>{' '}
                    <button type="button" onClick={() => void remove(a.id)}>
                      Удалить
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit ? (
        <form className="form-row" onSubmit={(e) => void submit(e)} noValidate>
          <SelectField
            name="absence-person"
            label="Человек"
            tip="Кто отсутствует"
            value={personId}
            options={view.people.map((p) => ({ value: p.id, label: p.name }))}
            onChange={setPersonId}
            error={errors.personId}
          />
          <TextField
            name="absence-start"
            label="С"
            tip="Первый день отсутствия"
            type="date"
            value={start}
            onChange={setStart}
            error={errors.start}
          />
          <TextField
            name="absence-end"
            label="По"
            tip="Последний день отсутствия"
            type="date"
            value={end}
            onChange={setEnd}
            error={errors.end}
          />
          <SelectField
            name="absence-kind"
            label="Вид"
            tip="Отпуск, больничный или другое"
            value={kind}
            options={ABSENCE_KINDS.map((k) => ({ value: k, label: ABSENCE_LABELS[k] }))}
            onChange={(v) => setKind(v as AbsenceKind)}
            error={errors.kind}
          />
          {errors.form && <ErrorMessage message={errors.form} />}
          <div className="form-actions">
            <button type="submit" className="primary">
              {editing ? 'Сохранить' : '+ Добавить отсутствие'}
            </button>
            {editing && (
              <button type="button" onClick={reset}>
                Отмена
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="muted">Отсутствия меняют тимлид и администратор.</p>
      )}
    </section>
  );
}
