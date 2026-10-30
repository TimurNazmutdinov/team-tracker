import { useState, type FormEvent } from 'react';
import type { FieldErrors, View } from '../../domain/actions';
import { nextSprintDefaults, sprintSettingsOf } from '../../domain/settings';
import { SERVER_MODE } from '../../app/create-storage';
import { useActions } from '../../state/actions';
import { BackupsPanel } from '../backups/BackupsPanel';
import { usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { useView } from '../../state/queries';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { TextField } from '../../ui/fields';
import { DodSettingsForm, TemplatesSection, WipSettingsForm } from './ProjectTools';
import { RolesMatrix } from './RolesMatrix';
import { ProjectMembers } from './ProjectMembers';
import { useCurrentProject } from './ProjectRoute';

const today = () => new Date().toISOString().slice(0, 10);
const fmtFull = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Настройки проекта (F-28): длительность, название (префикс и номер) и дата начала следующего спринта. */
export function SettingsPage() {
  const project = useCurrentProject();
  const view = useView(project.id);
  const perms = usePermissions();
  const canBackup = perms.can('backups.manage');
  return (
    <>
      <PageHeader title="Настройки проекта" />
      {view ? (
        <>
          <SprintSettingsForm view={view} />
          <WipSettingsForm
            key={JSON.stringify(view.project.wipLimits) + view.project.wipEnabled}
            view={view}
          />
          <DodSettingsForm key={view.project.dod} view={view} />
          <TemplatesSection view={view} />
          <ProjectMembers view={view} />
        </>
      ) : (
        <Loading />
      )}
      {perms.can('users.manage') && <RolesMatrix />}
      {SERVER_MODE && canBackup && <BackupsPanel />}
    </>
  );
}

function SprintSettingsForm({ view }: { view: View }) {
  const actions = useActions(view.projectId);
  const canEdit = usePermissions().can('sprint.manage');
  const push = useNotices((s) => s.push);
  const current = sprintSettingsOf(view.project);
  const [duration, setDuration] = useState(String(current.sprintDurationDays));
  const [prefix, setPrefix] = useState(current.sprintPrefix);
  const [number, setNumber] = useState(String(current.nextSprintNumber));
  const [startDate, setStartDate] = useState(current.nextSprintStart ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});

  const draft = {
    sprintDurationDays: duration.trim() === '' ? Number.NaN : Number(duration),
    sprintPrefix: prefix,
    nextSprintNumber: number.trim() === '' ? Number.NaN : Number(number),
    nextSprintStart: startDate === '' ? null : startDate,
  };
  // предпросмотр следующего спринта по введённым значениям (если они корректны)
  const valid =
    Number.isInteger(draft.sprintDurationDays) &&
    draft.sprintDurationDays >= 1 &&
    draft.sprintDurationDays <= 90 &&
    prefix.trim() !== '' &&
    Number.isInteger(draft.nextSprintNumber) &&
    draft.nextSprintNumber >= 1;
  const preview = valid
    ? nextSprintDefaults(
        { ...view, project: { ...view.project, ...draft, sprintPrefix: prefix.trim() } },
        today(),
      )
    : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await actions.updateSprintSettings(draft);
    if (result.ok) {
      setErrors({});
      push('Настройки спринтов сохранены');
    } else setErrors(result.errors);
  };

  return (
    <form
      className="settings-card"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="sprint-settings-title"
    >
      <h2 id="sprint-settings-title">Спринты</h2>
      <p className="muted">
        Эти значения подставляются в форму нового спринта. Названия и даты каждого спринта можно
        изменить на экране «Спринты».
      </p>
      <div className="form-row">
        <TextField
          name="sprintDurationDays"
          disabled={!canEdit}
          label="Длительность по умолчанию, дней"
          type="number"
          min="1"
          value={duration}
          onChange={setDuration}
          hint="От 1 до 90; конец спринта = старт + длительность − 1 день"
          error={errors.sprintDurationDays}
        />
        <TextField
          name="sprintPrefix"
          disabled={!canEdit}
          label="Название: префикс"
          value={prefix}
          onChange={setPrefix}
          hint="Например, «Спринт» или «Итерация»"
          error={errors.sprintPrefix}
        />
        <TextField
          name="nextSprintNumber"
          disabled={!canEdit}
          label="Номер следующего спринта"
          type="number"
          min="1"
          value={number}
          onChange={setNumber}
          hint="Растёт сам, когда создаётся спринт с предложенным названием"
          error={errors.nextSprintNumber}
        />
        <TextField
          name="nextSprintStart"
          disabled={!canEdit}
          label="Дата старта следующего спринта"
          type="date"
          value={startDate}
          onChange={setStartDate}
          hint="Если пусто — на следующий день после конца последнего спринта"
          error={errors.nextSprintStart}
        />
      </div>
      {preview && (
        <p className="preview">
          Следующий спринт: <strong>«{preview.name}»</strong>, {fmtFull(preview.start)} –{' '}
          {fmtFull(preview.end)}
        </p>
      )}
      {errors.form && <ErrorMessage message={errors.form} />}
      {canEdit ? (
        <button type="submit" className="primary">
          Сохранить
        </button>
      ) : (
        <p className="muted">Настройки спринтов меняют тимлид и администратор.</p>
      )}
    </form>
  );
}
