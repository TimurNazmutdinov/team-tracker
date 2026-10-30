import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  cfd,
  histogram,
  periodRange,
  roadmap,
  statsByType,
  timedIssues,
  workload,
  type TimeStats,
} from '../../domain/analytics';
import { useProjectScope } from '../../state/project-scope';
import { useProjectHistories, useProjectViews } from '../../state/queries';
import { Loading } from '../../ui/Loading';
import { PageHeader } from '../../ui/PageHeader';
import { ProjectFilter } from '../../ui/ProjectFilter';
import { CfdChart, Histogram, RoadmapChart, WorkloadChart } from './charts';

const TABS = [
  { id: 'flow', label: 'Поток (CFD)' },
  { id: 'time', label: 'Время цикла' },
  { id: 'load', label: 'Нагрузка' },
  { id: 'roadmap', label: 'Дорожная карта' },
] as const;

const DAY_OPTIONS = [30, 60, 90, 180];
const MONTH_OPTIONS = [3, 6, 12];
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Первое число месяца со сдвигом на `shift` месяцев от даты. */
function monthStart(date: string, shift: number): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + shift);
  return d.toISOString().slice(0, 10);
}

const num = (n: number | null) => (n === null ? '—' : `${String(n).replace('.', ',')} дн.`);

function StatsRow({ label, cycle, lead }: { label: string; cycle: TimeStats; lead: TimeStats }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{lead.count}</td>
      <td>{num(cycle.average)}</td>
      <td>{num(cycle.median)}</td>
      <td>{num(cycle.p85)}</td>
      <td>{num(lead.average)}</td>
    </tr>
  );
}

/** Экран «Аналитика» (wireframes.md, раздел 22): поток, время цикла, нагрузка, дорожная карта. */
export function AnalyticsPage() {
  const { ready, scope, all } = useProjectScope();
  const projects = scope.projects.length === 0 && scope.source === 'default' ? all : scope.projects;
  const views = useProjectViews(projects);
  const histories = useProjectHistories(projects);
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'flow';
  const days = DAY_OPTIONS.includes(Number(params.get('days'))) ? Number(params.get('days')) : 60;
  const months = MONTH_OPTIONS.includes(Number(params.get('months')))
    ? Number(params.get('months'))
    : 6;
  const now = today();

  const setParam = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    });

  const data = useMemo(() => {
    if (!views || !histories) return null;
    const issues = views.flatMap((v) => v.issues);
    const history = [...histories.values()].flat();
    const { from, to } = periodRange(days, now);
    return {
      flow: cfd(issues, history, from, to),
      timed: timedIssues(issues, history, from, to),
      load: workload(views),
      road: roadmap(views),
    };
  }, [views, histories, days, now]);

  const header = (
    <PageHeader title="Аналитика">
      <ProjectFilter />
    </PageHeader>
  );
  if (!ready || !views || !data) {
    return (
      <>
        {header}
        <Loading />
      </>
    );
  }
  if (projects.length === 0) {
    return (
      <>
        {header}
        <p className="empty">Не выбрано ни одного проекта: выберите проекты в фильтре.</p>
      </>
    );
  }

  const timed = data.timed;
  const cycles = timed.flatMap((i) => (i.cycle === null ? [] : [i.cycle]));
  const rangeFrom = monthStart(now, -1);
  const rangeTo = monthStart(now, months - 1);
  const monthTicks = Array.from({ length: months }, (_, n) => {
    const date = monthStart(now, n - 1);
    return { date, label: MONTHS[Number(date.slice(5, 7)) - 1] ?? '' };
  });
  const projectKeys = views.map((v) => v.project.key);

  return (
    <>
      {header}
      <div className="board-toolbar">
        <nav className="tabs" aria-label="Вид аналитики">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? 'on' : undefined}
              aria-pressed={t.id === tab}
              onClick={() => setParam('tab', t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === 'roadmap' ? (
          <label>
            Период
            <select value={months} onChange={(e) => setParam('months', e.target.value)}>
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} мес.
                </option>
              ))}
            </select>
          </label>
        ) : tab !== 'load' ? (
          <label>
            Период
            <select value={days} onChange={(e) => setParam('days', e.target.value)}>
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} дней
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="muted">Идущие спринты выбранных проектов</span>
        )}
      </div>

      {tab === 'flow' && (
        <section aria-labelledby="flow-title">
          <h2 id="flow-title">Кумулятивная диаграмма потока</h2>
          <p className="muted">
            Число задач в каждом статусе на конец дня. Расширяющаяся полоса «In Progress» — затор:
            задачи начинают, но не заканчивают.
          </p>
          <CfdChart days={data.flow} />
        </section>
      )}

      {tab === 'time' && (
        <section aria-labelledby="time-title">
          <h2 id="time-title">Время цикла и время выполнения</h2>
          <p className="muted">
            Задачи, завершённые за период. Цикл — с последнего входа в In Progress до Done;
            выполнение — с создания до Done.
          </p>
          {timed.length === 0 ? (
            <p className="empty">За период нет завершённых задач.</p>
          ) : (
            <>
              <div className="chart-pair">
                <Histogram
                  buckets={histogram(cycles, [0, 1, 2, 3, 5, 8, 13])}
                  title="Время цикла"
                  unit="дн."
                />
                <Histogram
                  buckets={histogram(
                    timed.map((i) => i.lead),
                    [0, 2, 5, 8, 13, 21, 34],
                  )}
                  title="Время выполнения"
                  unit="дн."
                />
              </div>
              <table className="totals">
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Задач</th>
                    <th>Цикл: среднее</th>
                    <th>Цикл: медиана</th>
                    <th>Цикл: 85 %</th>
                    <th>Выполнение: среднее</th>
                  </tr>
                </thead>
                <tbody>
                  {statsByType(timed).map((s) => (
                    <StatsRow key={s.type} label={s.type} cycle={s.cycle} lead={s.lead} />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {tab === 'load' && (
        <section aria-labelledby="load-title">
          <h2 id="load-title">Нагрузка по людям</h2>
          <p className="muted">
            Story points незавершённых задач в идущих спринтах выбранных проектов; один человек — по
            всем проектам сразу.
          </p>
          {data.load.rows.length === 0 ? (
            <p className="empty">В идущих спринтах выбранных проектов нет незавершённых задач.</p>
          ) : (
            <WorkloadChart data={data.load} projectKeys={projectKeys} />
          )}
        </section>
      )}

      {tab === 'roadmap' && (
        <section aria-labelledby="road-title">
          <h2 id="road-title">Дорожная карта эпиков</h2>
          <p className="muted">
            Полоса — от начала первого до конца последнего спринта задач эпика (или срока эпика,
            если он позже); закрашено — прогресс эпика.
          </p>
          {data.road.length === 0 ? (
            <p className="empty">В выбранных проектах нет эпиков.</p>
          ) : (
            <RoadmapChart
              epics={data.road}
              from={rangeFrom}
              to={rangeTo}
              today={now}
              months={monthTicks}
            />
          )}
        </section>
      )}
    </>
  );
}
