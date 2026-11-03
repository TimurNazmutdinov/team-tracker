import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { epicOf } from '../../domain/board';
import { isContainer } from '../../domain/hierarchy';
import { epicProgress } from '../../domain/progress';
import type { Issue, Person, StatusDef } from '../../domain/schema';
import { descendants, treeRows } from '../../domain/tree';
import { epicStyle } from '../../ui/epicColor';
import { Avatar, StatusChip, TypeIcon } from '../tasks/IssueBits';

/** Сколько эпиков видно сразу в раскрытой структуре; остальные — под «ещё N». */
const FIRST_EPICS = 5;

/**
 * Блок «Структура» в карточке проекта (D-4, wireframes.md 27.3): свёрнут по умолчанию — одна строка
 * сводки, поэтому высота карточки не зависит от числа задач. Раскрыт — все эпики с прогрессом;
 * эпик раскрывается до задач, задача — до подзадач, под-эпик — следующим уровнем; отдельно
 * «Без эпика». Каждая строка — в одну линию, полное название в подсказке.
 */
export function ProjectStructure({
  issues,
  people,
  projectKey,
  statuses,
}: {
  issues: Issue[];
  people: Person[];
  projectKey: string;
  statuses: readonly StatusDef[];
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const byId = new Map(issues.map((i) => [i.id, i]));
  const epics = issues.filter((i) => i.type === 'Epic').sort((a, b) => a.order - b.order);
  const tasks = issues.filter((i) => !isContainer(i.type) && i.type !== 'Sub-task');
  const orphans = tasks.filter((i) => epicOf(i, byId) === null);
  const NO_EPIC = '__no-epic__';
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const shown = all ? epics : epics.slice(0, FIRST_EPICS);
  const keyOf = (i: Issue) => `${projectKey}-${i.number}`;
  const person = (id: string | null) => people.find((p) => p.id === id);

  const row = (issue: Issue, depth: number) => (
    <li
      key={issue.id}
      className="structure-row"
      style={{ paddingLeft: `${0.4 + depth * 1.2}rem` }}
      data-depth={depth}
    >
      <TypeIcon type={issue.type} />
      <Link to={`/projects/${projectKey}/issues/${issue.number}`} className="issue-key">
        {keyOf(issue)}
      </Link>
      <span className="structure-title" title={issue.title}>
        {issue.title}
      </span>
      <StatusChip status={issue.status} />
      <Avatar person={person(issue.assigneeId)} />
    </li>
  );

  return (
    <section className="project-structure" aria-label={`Структура проекта ${projectKey}`}>
      <div className="structure-head">
        <button
          type="button"
          className="plain structure-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          title={open ? 'Свернуть структуру' : 'Показать эпики и задачи проекта'}
        >
          {open ? '▾' : '▸'} <strong>Структура</strong>
        </button>
        <span className="muted small">
          эпиков {epics.length} · задач {tasks.length} · без эпика {orphans.length}
        </span>
        {open && epics.length > 0 && (
          <button
            type="button"
            className="link small"
            onClick={() =>
              setExpanded(
                expanded.size > 0 ? new Set() : new Set([...epics.map((e) => e.id), NO_EPIC]),
              )
            }
          >
            {expanded.size > 0 ? 'Свернуть всё' : 'Развернуть всё'}
          </button>
        )}
      </div>
      {open && (
        <ul className="structure-list">
          {shown.map((epic) => {
            const progress = epicProgress(issues, epic.id, statuses);
            const isOpen = expanded.has(epic.id);
            const family = descendants(epic, issues);
            return (
              <li key={epic.id} className="structure-epic">
                <div className="structure-epic-row" style={epicStyle(epic.id) as CSSProperties}>
                  <button
                    type="button"
                    className="plain"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Свернуть' : 'Развернуть'} эпик ${epic.title}`}
                    disabled={family.length === 0}
                    onClick={() => toggle(epic.id)}
                  >
                    {isOpen ? '▾' : '▸'}
                  </button>
                  <TypeIcon type="Epic" />
                  <Link to={`/projects/${projectKey}/issues/${epic.number}`} className="issue-key">
                    {keyOf(epic)}
                  </Link>
                  <span className="structure-title" title={epic.title}>
                    {epic.title}
                  </span>
                  <span
                    className="meter structure-meter"
                    role="img"
                    aria-label={`${progress.percent} %`}
                  >
                    <span style={{ width: `${progress.percent}%` }} />
                  </span>
                  <span className="muted small">{progress.percent} %</span>
                </div>
                {isOpen && (
                  <ul className="structure-children">
                    {treeRows(family, { all: issues })
                      .filter((r) => r.issue.id !== epic.id)
                      .map(({ issue, depth }) => row(issue, Math.max(0, depth - 1)))}
                  </ul>
                )}
              </li>
            );
          })}
          {!all && epics.length > FIRST_EPICS && (
            <li>
              <button type="button" className="link small" onClick={() => setAll(true)}>
                ещё {epics.length - FIRST_EPICS} эпиков ▸
              </button>
            </li>
          )}
          {orphans.length > 0 && (
            <li className="structure-epic">
              <div className="structure-epic-row">
                <button
                  type="button"
                  className="plain"
                  aria-expanded={expanded.has(NO_EPIC)}
                  onClick={() => toggle(NO_EPIC)}
                >
                  {expanded.has(NO_EPIC) ? '▾' : '▸'}
                </button>
                <span className="structure-title">Без эпика ({orphans.length})</span>
              </div>
              {expanded.has(NO_EPIC) && (
                <ul className="structure-children">
                  {treeRows(
                    issues.filter(
                      (i) =>
                        orphans.includes(i) ||
                        (i.type === 'Sub-task' && orphans.some((o) => o.id === i.parentId)),
                    ),
                    { all: issues },
                  ).map(({ issue, depth }) => row(issue, depth))}
                </ul>
              )}
            </li>
          )}
          {epics.length === 0 && orphans.length === 0 && (
            <li className="muted small">В проекте пока нет задач.</li>
          )}
        </ul>
      )}
    </section>
  );
}
