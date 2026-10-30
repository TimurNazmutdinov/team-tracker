import { useState, type FormEvent } from 'react';
import type { FieldErrors } from '../../domain/actions';
import { useActions, useProjectActions } from '../../state/actions';
import { useOnboarding } from '../../state/onboarding';
import { useNotices } from '../../state/notices';
import { usePeople, useProjects } from '../../state/queries';
import { Dialog } from '../../ui/Dialog';
import { TextField, SelectField } from '../../ui/fields';
import { PaletteField } from '../../ui/UserMenu';
import { NewAccountForm, TemporaryPassword } from '../people/Accounts';

const STEPS = ['Проект', 'Владелец', 'Люди', 'Гамма'] as const;

/** Мастер первого запуска для администратора (wireframes.md, 23.1): проект, владелец, люди, гамма. */
export function OnboardingWizard() {
  const onboarding = useOnboarding();
  if (!onboarding.show) return null;
  const finish = () => void onboarding.set(true);
  return (
    <Dialog title="Добро пожаловать в Team Tracker" onClose={finish}>
      <Wizard onFinish={finish} />
    </Dialog>
  );
}

function Wizard({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const projects = useProjects();
  const [created, setCreated] = useState<string | null>(null);
  const list = projects.data ?? [];
  const project = list.find((p) => p.key === created) ?? list[0];

  const last = step === STEPS.length - 1;
  return (
    <div className="wizard">
      <p className="muted">Четыре шага — и можно работать. Любой шаг можно пропустить.</p>
      <ol className="steps" aria-label="Шаги">
        {STEPS.map((name, n) => (
          <li key={name} aria-current={n === step ? 'step' : undefined}>
            <button
              type="button"
              className={n === step ? 'on' : undefined}
              onClick={() => setStep(n)}
            >
              {n + 1} {name}
            </button>
          </li>
        ))}
      </ol>
      {step === 0 && <ProjectStep onCreated={setCreated} current={project?.key ?? null} />}
      {step === 1 &&
        (project ? (
          <OwnerStep key={project.id} projectId={project.id} projectKey={project.key} />
        ) : (
          <p className="muted">Сначала создайте проект на первом шаге.</p>
        ))}
      {step === 2 && <PeopleStep />}
      {step === 3 && <PaletteField />}
      <div className="wizard-nav">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)}>
            ← Назад
          </button>
        )}{' '}
        {last ? (
          <button type="button" className="primary" onClick={onFinish}>
            Готово
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => setStep(step + 1)}>
            Далее →
          </button>
        )}{' '}
        {!last && (
          <button type="button" onClick={onFinish}>
            Пропустить мастер
          </button>
        )}
      </div>
      <p className="muted small">
        Мастер открывается один раз; позже его можно запустить из справки (клавиша «?»).
      </p>
    </div>
  );
}

function ProjectStep({
  onCreated,
  current,
}: {
  onCreated: (key: string) => void;
  current: string | null;
}) {
  const actions = useProjectActions();
  const projects = useProjects();
  const push = useNotices((s) => s.push);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await actions.createProject({ key: key.trim().toUpperCase(), name });
    if (result.ok) {
      push(`Проект ${key.trim().toUpperCase()} создан`);
      onCreated(key.trim().toUpperCase());
      setKey('');
      setName('');
      setErrors({});
    } else setErrors(result.errors);
  };

  return (
    <section aria-labelledby="wz-project">
      <h3 id="wz-project">Проект</h3>
      {(projects.data ?? []).length > 0 && (
        <p>
          Проекты: {(projects.data ?? []).map((p) => p.key).join(', ')}.{' '}
          {current && <>Дальше настроим {current}.</>}
        </p>
      )}
      <form className="form-row" onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label="Ключ"
          name="wz-key"
          value={key}
          onChange={setKey}
          error={errors.key}
          hint="2–10 заглавных латинских букв"
        />
        <TextField
          label="Название"
          name="wz-name"
          value={name}
          onChange={setName}
          error={errors.name}
        />
        <div className="form-actions">
          <button type="submit">Создать проект</button>
        </div>
      </form>
    </section>
  );
}

function OwnerStep({ projectId, projectKey }: { projectId: string; projectKey: string }) {
  const people = usePeople();
  const projects = useProjects();
  const actions = useActions(projectId);
  const push = useNotices((s) => s.push);
  const owner = projects.data?.find((p) => p.id === projectId)?.ownerId ?? '';
  const [error, setError] = useState<string | undefined>();

  const choose = async (personId: string) => {
    const result = await actions.setOwner(personId === '' ? null : personId);
    if (result.ok) {
      setError(undefined);
      push('Владелец проекта сохранён');
    } else setError(Object.values(result.errors).join('. '));
  };

  return (
    <section aria-labelledby="wz-owner">
      <h3 id="wz-owner">Кто владелец проекта {projectKey}?</h3>
      <p className="muted">
        Владелец — продакт, который отвечает за проект; его видно в «Портфеле».
      </p>
      <SelectField
        label="Владелец"
        name="wz-owner"
        value={owner ?? ''}
        options={[
          { value: '', label: 'Не назначен' },
          ...(people.data ?? []).map((p) => ({ value: p.id, label: p.name })),
        ]}
        onChange={(v) => void choose(v)}
        error={error}
      />
    </section>
  );
}

function PeopleStep() {
  const [issued, setIssued] = useState<{ who: string; password: string }[]>([]);
  return (
    <section aria-labelledby="wz-people">
      <h3 id="wz-people">Люди</h3>
      <p className="muted">
        Каждому участнику создаётся учётка с временным паролем: передайте его человеку, при первом
        входе он сменит пароль.
      </p>
      {issued.map((i) => (
        <TemporaryPassword key={i.who} who={i.who} password={i.password} />
      ))}
      <NewAccountForm onCreated={(who, password) => setIssued([...issued, { who, password }])} />
    </section>
  );
}
