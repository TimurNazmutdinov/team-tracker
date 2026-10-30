import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { RETRO_LABELS } from '../../domain/retro';
import { reportSheets, sprintReport } from '../../domain/sprintReport';
import { useNotices } from '../../state/notices';
import { useProjectHistory, useView } from '../../state/queries';
import { buildReportXlsx, saveBlob } from '../../ui/reportXlsx';
import { dateRange, num } from '../../ui/format';
import { Loading } from '../../ui/Loading';
import { NotFound } from '../../ui/NotFound';
import { PageHeader } from '../../ui/PageHeader';
import { FillIndicator } from '../planning/FillIndicator';
import { fillOf } from '../../domain/planning';
import { useCurrentProject } from '../projects/ProjectRoute';
import { BurndownChart } from '../reports/charts';
import { TotalsTable } from '../reports/TotalsTable';

const STATE_LABEL = { planned: 'запланирован', active: 'идёт', closed: 'закрыт' } as const;
const today = () => new Date().toISOString().slice(0, 10);

/** Отчёт спринта (wireframes.md, 21.4): одной страницей; Excel и печать/PDF через печать браузера. */
export function SprintReportPage() {
  const project = useCurrentProject();
  const { id } = useParams();
  const view = useView(project.id);
  const history = useProjectHistory(project.id);
  const push = useNotices((s) => s.push);
  const [busy, setBusy] = useState(false);

  if (!view || !history.data) {
    return (
      <>
        <PageHeader title="Отчёт спринта" />
        <Loading />
      </>
    );
  }
  const sprint = view.sprints.find((s) => s.id === id);
  if (!sprint) return <NotFound what="Спринт" />;
  const report = sprintReport(view, sprint, history.data, today());
  const total = report.total;

  const excel = async () => {
    setBusy(true);
    try {
      const keys = new Map(view.issues.map((i) => [i.id, `${project.key}-${i.number}`]));
      const authors = new Map(view.people.map((p) => [p.id, p.name]));
      const blob = await buildReportXlsx(reportSheets(report, { authors, issueKeys: keys }));
      saveBlob(blob, `report-${project.key}-${sprint.name.replace(/\s+/g, '-')}.xlsx`);
    } catch {
      push('Не удалось создать Excel-файл');
    } finally {
      setBusy(false);
    }
  };

  const capacity = report.capacity;
  return (
    <div className="sprint-report">
      <PageHeader title={`Отчёт: ${sprint.name}`}>
        <span className="no-print">
          <button type="button" disabled={busy} onClick={() => void excel()}>
            Скачать Excel
          </button>{' '}
          <button type="button" className="primary" onClick={() => window.print()}>
            Печать / PDF
          </button>
        </span>
      </PageHeader>
      <p className="muted">
        {project.key} · {dateRange(sprint.start, sprint.end)} · {STATE_LABEL[sprint.state]}
        {sprint.closedAt &&
          `, ${new Date(sprint.closedAt).toLocaleDateString('ru-RU', { dateStyle: 'short' })}`}
        <span className="no-print">
          {' '}
          · <Link to={`/projects/${project.key}/sprints/${sprint.id}`}>Спринт и ретроспектива</Link>
        </span>
      </p>
      <section aria-labelledby="goal-title">
        <h2 id="goal-title">Цель</h2>
        <p>{sprint.goal || <span className="muted">не задана</span>}</p>
      </section>

      <section aria-labelledby="sum-title">
        <h2 id="sum-title">Сводка</h2>
        <dl className="report-cards">
          <div>
            <dt>Выполнено</dt>
            <dd>
              {num(total.done)} sp · {report.done.length} задач
            </dd>
          </div>
          <div>
            <dt>{sprint.state === 'closed' ? 'Перенесено' : 'Не завершено'}</dt>
            <dd>
              {num(total.carried)} sp · {report.carried.length} задач
            </dd>
          </div>
          <div>
            <dt>Velocity</dt>
            <dd>{num(report.velocity)} sp</dd>
          </div>
          <div>
            <dt>Ёмкость</dt>
            <dd>
              {capacity.value === null
                ? 'неизвестна'
                : `${num(capacity.value)} sp · доступность ${Math.round(capacity.availability.ratio * 100)} %`}
            </dd>
          </div>
        </dl>
        {capacity.value !== null && (
          <FillIndicator
            fill={fillOf(total.points, capacity.value)}
            capacity={capacity}
            names={view.people}
          />
        )}
      </section>

      <section aria-labelledby="bd-title">
        <h2 id="bd-title">Burndown</h2>
        {report.burndown.some((d) => d.remaining !== null) ? (
          <BurndownChart days={report.burndown} />
        ) : (
          <p className="muted">Данных пока нет: спринт ещё не начался.</p>
        )}
      </section>

      <section aria-labelledby="people-title">
        <h2 id="people-title">Итоги по людям</h2>
        <TotalsTable summary={report.summary} people={view.people} />
      </section>

      <section aria-labelledby="issues-title">
        <h2 id="issues-title">Задачи</h2>
        <table className="absences">
          <thead>
            <tr>
              <th>Задача</th>
              <th>Название</th>
              <th>Исполнитель</th>
              <th>sp</th>
              <th>Итог</th>
            </tr>
          </thead>
          <tbody>
            {[...report.done, ...report.carried].map((i) => (
              <tr key={i.key}>
                <td>{i.key}</td>
                <td>{i.title}</td>
                <td>{i.assignee}</td>
                <td>{i.points ?? '—'}</td>
                <td>
                  {i.status === 'Done'
                    ? 'выполнена'
                    : sprint.state === 'closed'
                      ? 'перенесена'
                      : 'не завершена'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.done.length + report.carried.length === 0 && (
          <p className="muted">В спринте нет задач.</p>
        )}
      </section>

      <section aria-labelledby="retro-title">
        <h2 id="retro-title">Ретроспектива</h2>
        {report.retro.length === 0 ? (
          <p className="muted">Записей нет.</p>
        ) : (
          (['good', 'improve', 'action'] as const).map((kind) => {
            const rows = report.retro.filter((r) => r.kind === kind);
            return rows.length === 0 ? null : (
              <div key={kind}>
                <h3>{RETRO_LABELS[kind]}</h3>
                <ul>
                  {rows.map((r) => (
                    <li key={r.id}>{r.text}</li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
