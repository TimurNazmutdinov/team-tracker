import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { FieldErrors } from '../../domain/actions';
import { isArchived } from '../../domain/projects';
import type { Project } from '../../domain/schema';
import { useProjectActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { useNotices } from '../../state/notices';
import { useIssues, usePeople, useProjects, useView } from '../../state/queries';
import { Dialog } from '../../ui/Dialog';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { SelectField, TextField } from '../../ui/fields';
import { ProjectMembers } from '../projects/ProjectMembers';

// Создание проектов и управление созданными на вкладке «Портфель» (wireframes.md, 26; ADR-023).

const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Окно «Новый проект»: ключ, название, владелец (необязательно). */
export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const actions = useProjectActions();
  const people = usePeople();
  const push = useNotices((s) => s.push);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await actions.createProject({
      key: key.toUpperCase(),
      name,
      ownerId: ownerId === '' ? null : ownerId,
    });
    if (result.ok) {
      push(`Проект ${key.trim().toUpperCase()} создан`);
      onClose();
    } else setErrors(result.errors);
  };

  return (
    <Dialog title="Новый проект" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="form-row">
          <TextField
            name="new-key"
            label="Ключ задач"
            required
            value={key}
            onChange={(v) => setKey(v.toUpperCase())}
            hint="2–10 заглавных латинских букв, например DEMO"
            error={errors.key}
          />
          <TextField
            name="new-name"
            label="Название"
            required
            value={name}
            onChange={setName}
            error={errors.name}
          />
        </div>
        <SelectField
          name="new-owner"
          label="Владелец проекта"
          tip="Продакт, который отвечает за проект; можно назначить позже"
          value={ownerId}
          options={[
            { value: '', label: 'Не назначен' },
            ...(people.data ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={setOwnerId}
          error={errors.ownerId}
        />
        {errors.form && <ErrorMessage message={errors.form} />}
        <div className="form-actions">
          <button type="submit" className="primary">
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

/** Окно «Изменить проект»: ключ и название, ниже — владелец и участники. */
function EditProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const actions = useProjectActions();
  const view = useView(project.id);
  const push = useNotices((s) => s.push);
  const [key, setKey] = useState(project.key);
  const [name, setName] = useState(project.name);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await actions.updateProject(project.id, { key, name });
    if (result.ok) {
      push('Проект сохранён');
      onClose();
    } else setErrors(result.errors);
  };

  return (
    <Dialog title={`Изменить проект ${project.key}`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="form-row">
          <TextField
            name="edit-key"
            label="Ключ задач"
            required
            value={key}
            onChange={(v) => setKey(v.toUpperCase())}
            error={errors.key}
          />
          <TextField
            name="edit-name"
            label="Название"
            required
            value={name}
            onChange={setName}
            error={errors.name}
          />
        </div>
        {key.trim() !== project.key && (
          <p className="warn" role="status">
            Ключ входит в номера задач ({project.key}-12) и в адреса страниц: после смены старые
            ссылки на этот проект перестанут работать.
          </p>
        )}
        {errors.form && <ErrorMessage message={errors.form} />}
        <div className="form-actions">
          <button type="submit" className="primary">
            Сохранить
          </button>
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </form>
      {view && <ProjectMembers view={view} />}
    </Dialog>
  );
}

/** Меню «⋯» на карточке проекта: настройки, правка, архив, удаление пустого проекта. */
export function ProjectMenu({ project }: { project: Project }) {
  const perms = usePermissions();
  const actions = useProjectActions();
  const issues = useIssues(project.id);
  const push = useNotices((s) => s.push);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!perms.can('project.create')) return null;
  const empty = (issues.data?.length ?? 1) === 0;

  const archive = async () => {
    setOpen(false);
    if (!window.confirm(`Отправить проект ${project.key} в архив? Задачи и история сохранятся.`))
      return;
    const result = await actions.archiveProject(project.id);
    push(
      result.ok ? `Проект ${project.key} в архиве` : Object.values(result.errors).join('. '),
      result.ok ? 'success' : 'error',
    );
  };
  const remove = async () => {
    setOpen(false);
    if (!window.confirm(`Удалить пустой проект ${project.key}? Это нельзя отменить.`)) return;
    const result = await actions.deleteProject(project.id);
    push(
      result.ok ? `Проект ${project.key} удалён` : Object.values(result.errors).join('. '),
      result.ok ? 'success' : 'error',
    );
  };

  return (
    <div className="project-menu" ref={root}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Управление проектом ${project.key}`}
        title="Управление проектом: настройки, изменение, архив, удаление"
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <ul className="menu-pop plain-list" role="menu" aria-label={`Проект ${project.key}`}>
          <li role="none">
            <Link role="menuitem" to={`/projects/${project.key}/settings`}>
              Настройки проекта
            </Link>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setEditing(true);
              }}
            >
              Изменить название и ключ…
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setEditing(true);
              }}
            >
              Владелец и участники…
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => void archive()}>
              Архивировать…
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={!empty}
              title={
                empty ? 'Удалить пустой проект' : 'В проекте есть задачи: отправьте его в архив'
              }
              onClick={() => void remove()}
            >
              Удалить (пустой проект)…
            </button>
          </li>
        </ul>
      )}
      {editing && <EditProjectDialog project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}

function ArchivedRow({ project }: { project: Project }) {
  const actions = useProjectActions();
  const issues = useIssues(project.id);
  const push = useNotices((s) => s.push);
  const empty = (issues.data?.length ?? 1) === 0;
  return (
    <li className="archived-row">
      <span className="chip project-tag">{project.key}</span>
      <span>
        {project.name}
        {project.archivedAt && (
          <span className="muted"> · архив с {fmtDate(project.archivedAt)}</span>
        )}
      </span>
      <span className="spacer" />
      <button
        type="button"
        title="Вернуть проект в списки, фильтр, портфель и аналитику"
        onClick={() =>
          void actions.restoreProject(project.id).then((r) => {
            push(
              r.ok ? `Проект ${project.key} возвращён` : Object.values(r.errors).join('. '),
              r.ok ? 'success' : 'error',
            );
          })
        }
      >
        Вернуть
      </button>
      {empty && (
        <button
          type="button"
          title="Удалить пустой проект"
          onClick={() => {
            if (!window.confirm(`Удалить пустой проект ${project.key}? Это нельзя отменить.`))
              return;
            void actions.deleteProject(project.id).then((r) => {
              push(
                r.ok ? `Проект ${project.key} удалён` : Object.values(r.errors).join('. '),
                r.ok ? 'success' : 'error',
              );
            });
          }}
        >
          Удалить
        </button>
      )}
    </li>
  );
}

/** Раздел «Архив проектов» под карточками портфеля. */
export function ArchiveSection() {
  const projects = useProjects();
  const perms = usePermissions();
  const archived = (projects.data ?? []).filter(isArchived);
  if (archived.length === 0 || !perms.can('project.create')) return null;
  return (
    <section className="settings-card" aria-labelledby="archive-title">
      <h2 id="archive-title">Архив проектов ({archived.length})</h2>
      <p className="muted">
        Архивные проекты скрыты из фильтра, портфеля, аналитики и поиска; задачи и история
        сохраняются.
      </p>
      <ul className="plain-list">
        {archived.map((p) => (
          <ArchivedRow key={p.id} project={p} />
        ))}
      </ul>
    </section>
  );
}
