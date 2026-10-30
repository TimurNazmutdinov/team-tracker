import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { FieldErrors, View } from '../../domain/actions';
import { canHavePoints } from '../../domain/hierarchy';
import { checklistProgress, toggleChecklistItem } from '../../domain/checklist';
import { epicProgress } from '../../domain/progress';
import type { Issue } from '../../domain/schema';
import { useActions } from '../../state/actions';
import { useCreateDialog } from '../../state/create-dialog';
import { useView } from '../../state/queries';
import { Loading } from '../../ui/Loading';
import { NotFound } from '../../ui/NotFound';
import { PageHeader } from '../../ui/PageHeader';
import { MarkdownField, TextField } from '../../ui/fields';
import { Markdown } from '../../ui/Markdown';
import { useCurrentProject } from '../projects/ProjectRoute';
import { Avatar, EpicProgressView, StatusChip, TypeIcon } from './IssueBits';
import { IssueActivity } from './IssueActivity';
import { IssueLinks } from './IssueLinks';
import { IssueSidebar } from './IssueSidebar';

/** Карточка задачи: /projects/:key/issues/:number (wireframes.md, раздел 8). */
export function IssuePage() {
  const project = useCurrentProject();
  const { number = '' } = useParams();
  const view = useView(project.id);
  if (!view) return <Loading />;
  const issue = /^\d+$/.test(number)
    ? view.issues.find((i) => i.number === Number(number))
    : undefined;
  if (!issue) return <NotFound what="Задача" />;
  return <IssueView key={issue.id} issue={issue} view={view} projectKey={project.key} />;
}

function IssueView({ issue, view, projectKey }: { issue: Issue; view: View; projectKey: string }) {
  const showCreate = useCreateDialog((s) => s.show);
  const parent = view.issues.find((i) => i.id === issue.parentId);
  const sprint = view.sprints.find((s) => s.id === issue.sprintId);
  const readOnly = sprint?.state === 'closed';
  const children = view.issues
    .filter((i) => i.parentId === issue.id)
    .sort((a, b) => a.number - b.number);
  const isEpic = issue.type === 'Epic';

  return (
    <>
      <nav aria-label="Путь" className="breadcrumbs muted">
        <Link to={`/projects/${projectKey}/backlog`}>{projectKey}</Link>
        {parent && (
          <>
            {' › '}
            <Link to={`/projects/${projectKey}/issues/${parent.number}`}>
              {projectKey}-{parent.number}
            </Link>
          </>
        )}
        {' › '}
        <span aria-current="page">
          {projectKey}-{issue.number}
        </span>
      </nav>
      <PageHeader title={`${projectKey}-${issue.number} ${issue.title}`}>
        <p className="issue-meta">
          <TypeIcon type={issue.type} /> {issue.type} · <StatusChip status={issue.status} />
        </p>
      </PageHeader>
      {readOnly && (
        <p className="warn" role="status">
          Спринт закрыт: задача доступна только для чтения (комментарии добавлять можно).
        </p>
      )}
      <div className="issue-layout">
        <div className="issue-main">
          <TextBlocks issue={issue} view={view} readOnly={readOnly} />

          {isEpic && (
            <section aria-labelledby="progress-title">
              <h2 id="progress-title">Прогресс</h2>
              <EpicProgressView progress={epicProgress(view.issues, issue.id)} />
              <p className="muted small">
                Считается по story points дочерних Story, Task и Bug, не хранится и не входит в
                velocity и burndown.
              </p>
            </section>
          )}

          <section aria-labelledby="children-title">
            <h2 id="children-title">
              {isEpic ? 'Задачи эпика' : `Подзадачи (${children.length})`}
            </h2>
            {children.length === 0 && (
              <p className="muted">{isEpic ? 'Задач в эпике нет' : 'Подзадач нет'}</p>
            )}
            <ul className="plain-list">
              {children.map((c) => (
                <li key={c.id} className="link-row">
                  <TypeIcon type={c.type} />
                  <Link to={`/projects/${projectKey}/issues/${c.number}`} className="issue-key">
                    {projectKey}-{c.number}
                  </Link>
                  <span className="issue-title">{c.title}</span>
                  <StatusChip status={c.status} />
                  <Avatar person={view.people.find((p) => p.id === c.assigneeId)} />
                </li>
              ))}
            </ul>
            {!readOnly && (isEpic || canHavePoints(issue.type)) && (
              <button
                type="button"
                onClick={() =>
                  showCreate(
                    isEpic
                      ? { type: 'Task', parentId: issue.id }
                      : { type: 'Sub-task', parentId: issue.id },
                  )
                }
              >
                {isEpic ? '+ Добавить задачу в эпик' : '+ Добавить подзадачу'}
              </button>
            )}
          </section>

          <IssueLinks issue={issue} view={view} projectKey={projectKey} />
          <IssueActivity issue={issue} view={view} projectKey={projectKey} />
        </div>
        <IssueSidebar
          key={`${issue.id}:${issue.updatedAt}`}
          issue={issue}
          view={view}
          projectKey={projectKey}
          readOnly={readOnly}
        />
      </div>
    </>
  );
}

/** Название, описание и критерии приёмки: показ и редактирование (✎). */
function TextBlocks({ issue, view, readOnly }: { issue: Issue; view: View; readOnly: boolean }) {
  const actions = useActions(view.projectId);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [acceptance, setAcceptance] = useState(issue.acceptance);
  const [errors, setErrors] = useState<FieldErrors>({});

  const progress = checklistProgress(issue.acceptance);
  const toggle = async (index: number) => {
    await actions.updateIssue(issue.id, {
      acceptance: toggleChecklistItem(issue.acceptance, index),
    });
  };

  const save = async () => {
    const result = await actions.updateIssue(issue.id, { title, description, acceptance });
    if (result.ok) {
      setEditing(false);
      setErrors({});
    } else setErrors(result.errors);
  };

  if (editing) {
    return (
      <form
        className="text-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <TextField
          name="title"
          label="Название"
          required
          value={title}
          onChange={setTitle}
          error={errors.title}
        />
        <MarkdownField
          name="description"
          label="Описание"
          rows={4}
          value={description}
          onChange={setDescription}
        />
        <MarkdownField
          name="acceptance"
          label="Критерии приёмки"
          rows={3}
          value={acceptance}
          onChange={setAcceptance}
        />
        {errors.form && (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        )}
        <button type="submit" className="primary">
          Сохранить
        </button>{' '}
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setTitle(issue.title);
            setDescription(issue.description);
            setAcceptance(issue.acceptance);
            setErrors({});
          }}
        >
          Отмена
        </button>
      </form>
    );
  }
  return (
    <>
      {!readOnly && (
        <button type="button" className="edit" onClick={() => setEditing(true)}>
          ✎ Изменить название и описание
        </button>
      )}
      <section aria-labelledby="desc-title">
        <h2 id="desc-title">Описание</h2>
        {issue.description ? (
          <Markdown text={issue.description} />
        ) : (
          <p className="muted">Описания нет</p>
        )}
      </section>
      <section aria-labelledby="acc-title">
        <h2 id="acc-title">
          Критерии приёмки
          {progress.total > 0 && (
            <span className="muted checklist-progress">
              {' '}
              — выполнено {progress.done} из {progress.total}
            </span>
          )}
        </h2>
        {issue.acceptance ? (
          <Markdown
            text={issue.acceptance}
            {...(readOnly ? {} : { onToggle: (i: number) => void toggle(i) })}
          />
        ) : (
          <p className="muted">Критериев нет</p>
        )}
      </section>
    </>
  );
}
