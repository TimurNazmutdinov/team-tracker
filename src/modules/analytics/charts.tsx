import { useState } from 'react';
import type { CfdDay, HistogramBucket, RoadmapEpic, Workload } from '../../domain/analytics';
import { STATUSES, type Status } from '../../domain/schema';

// Графики аналитики рисуются вручную (SVG и HTML), как и отчёты: цвета — из стилей темы, у каждого
// графика есть описание для чтецов экрана и таблица данных.

const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const statusClass = (s: Status) => `cfd-${s.toLowerCase().replace(' ', '-')}`;

const W = 720;
const H = 320;
const M = { left: 48, right: 16, top: 16, bottom: 40 };

function niceMax(value: number): number {
  const step = value <= 40 ? 4 : value <= 400 ? 40 : 400;
  return Math.max(step, Math.ceil(value / step) * step);
}

/** CFD: накопленные полосы по статусам; порядок снизу вверх — от завершённого к Backlog. */
export function CfdChart({ days }: { days: CfdDay[] }) {
  const order = [...STATUSES].reverse();
  const max = niceMax(Math.max(1, ...days.map((d) => d.total)));
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i: number) => M.left + (days.length <= 1 ? 0 : (iw * i) / (days.length - 1));
  const y = (v: number) => M.top + ih - (ih * v) / max;
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round((max * k) / 4));
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  const last = days.at(-1);
  const summary = last
    ? `На ${fmt(last.date)}: всего ${last.total}, в работе ${last.counts['In Progress']}, готово ${last.counts.Done}.`
    : 'Данных нет.';
  const cum = days.map(() => 0);
  const bands = order.map((status) => {
    const lower = [...cum];
    days.forEach((d, i) => {
      cum[i] = (cum[i] ?? 0) + d.counts[status];
    });
    const top = days.map((_, i) => `${x(i)},${y(cum[i] ?? 0)}`);
    const bottom = days.map((_, i) => `${x(i)},${y(lower[i] ?? 0)}`).reverse();
    return { status, points: [...top, ...bottom].join(' ') };
  });
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Диаграмма потока. ${summary}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={M.left - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {bands.map((b) => (
          <polygon
            key={b.status}
            className={`cfd-band ${statusClass(b.status)}`}
            points={b.points}
          />
        ))}
        <line className="axis-line" x1={M.left} x2={M.left} y1={M.top} y2={M.top + ih} />
        <line className="axis-line" x1={M.left} x2={W - M.right} y1={M.top + ih} y2={M.top + ih} />
        {days.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} className="axis" x={x(i)} y={H - M.bottom + 18} textAnchor="middle">
              {fmt(d.date)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="legend">
        {STATUSES.map((s) => (
          <span key={s} className="legend-item">
            <span className={`swatch ${statusClass(s)}`} /> {s}
          </span>
        ))}
      </figcaption>
      <details>
        <summary>Таблица данных</summary>
        <table className="totals">
          <thead>
            <tr>
              <th>Дата</th>
              {STATUSES.map((s) => (
                <th key={s}>{s}</th>
              ))}
              <th>Всего</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{fmt(d.date)}</td>
                {STATUSES.map((s) => (
                  <td key={s}>{d.counts[s]}</td>
                ))}
                <td>{d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Гистограмма: столбец на корзину; подпись — число задач. */
export function Histogram({
  buckets,
  title,
  unit,
}: {
  buckets: HistogramBucket[];
  title: string;
  unit: string;
}) {
  const h = 200;
  const bw = 56;
  const width = M.left + buckets.length * bw + M.right;
  const max = niceMax(Math.max(1, ...buckets.map((b) => b.count)));
  const y = (v: number) => 16 + (h - 16 - 32) * (1 - v / max);
  const total = buckets.reduce((a, b) => a + b.count, 0);
  return (
    <figure className="chart histogram">
      <svg
        viewBox={`0 0 ${width} ${h}`}
        role="img"
        aria-label={`${title}: ${buckets.map((b) => `${b.label} ${unit} — ${b.count}`).join('; ')}`}
      >
        <line className="axis-line" x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} />
        {buckets.map((b, i) => (
          <g key={b.label}>
            <rect
              className="bar"
              x={M.left + i * bw + 6}
              y={y(b.count)}
              width={bw - 12}
              height={y(0) - y(b.count)}
            />
            <text
              className="value"
              x={M.left + i * bw + bw / 2}
              y={y(b.count) - 4}
              textAnchor="middle"
            >
              {b.count}
            </text>
            <text className="axis" x={M.left + i * bw + bw / 2} y={y(0) + 16} textAnchor="middle">
              {b.label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="muted small">
        {title}, {unit}; задач: {total}
      </figcaption>
    </figure>
  );
}

const PROJECT_CLASSES = ['p0', 'p1', 'p2', 'p3', 'p4'];

/** Нагрузка: полоса story points на человека, разбитая по проектам; пунктир — среднее. */
export function WorkloadChart({ data, projectKeys }: { data: Workload; projectKeys: string[] }) {
  const max = Math.max(1, ...data.rows.map((r) => r.points), data.average ?? 0);
  return (
    <div className="workload">
      <ul className="plain-list" aria-label="Нагрузка по людям">
        {data.rows.map((r) => (
          <li key={r.personId ?? 'nobody'} className="workload-row">
            <span className="workload-name">{r.name}</span>
            <span className="workload-bar" aria-hidden="true">
              {projectKeys.map((k, n) => {
                const v = r.byProject[k] ?? 0;
                return v === 0 ? null : (
                  <span
                    key={k}
                    className={`seg ${PROJECT_CLASSES[n % PROJECT_CLASSES.length]}`}
                    style={{ width: `${(v / max) * 100}%` }}
                    title={`${k}: ${v} sp`}
                  />
                );
              })}
              {data.average !== null && r.personId !== null && (
                <i className="avg-mark" style={{ left: `${(data.average / max) * 100}%` }} />
              )}
            </span>
            <span className="workload-value">
              {r.points} sp · {r.tasks} задач
              {projectKeys.length > 1 &&
                ` (${projectKeys
                  .filter((k) => (r.byProject[k] ?? 0) > 0)
                  .map((k) => `${k} ${r.byProject[k]}`)
                  .join(', ')})`}
            </span>
          </li>
        ))}
      </ul>
      <p className="legend">
        {projectKeys.map((k, n) => (
          <span key={k} className="legend-item">
            <span className={`swatch ${PROJECT_CLASSES[n % PROJECT_CLASSES.length]}`} /> {k}
          </span>
        ))}
        {data.average !== null && (
          <span className="muted"> · пунктир — среднее {data.average} sp</span>
        )}
      </p>
    </div>
  );
}

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Дорожная карта: строка на эпик, полоса по датам спринтов, закрашен прогресс; линия «сегодня». */
export function RoadmapChart({
  epics,
  from,
  to,
  today,
  months,
}: {
  epics: RoadmapEpic[];
  from: string;
  to: string;
  today: string;
  months: { label: string; date: string }[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const span = Math.max(at(to) - at(from), DAY);
  const pos = (iso: string) => Math.min(100, Math.max(0, ((at(iso) - at(from)) / span) * 100));
  const todayPos = ((at(today) - at(from)) / span) * 100;
  return (
    <div className="roadmap">
      <div className="roadmap-axis" aria-hidden="true">
        {months.map((m) => (
          <span key={m.date} style={{ left: `${pos(m.date)}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      <ul className="plain-list">
        {epics.map((e) => {
          const visible = e.start !== null && e.end !== null && e.end >= from && e.start <= to;
          const open = expanded.has(e.issueId);
          const bar = (start: string | null, end: string | null, label: string, fill?: number) =>
            start !== null && end !== null && end >= from && start <= to ? (
              <span
                className="roadmap-bar"
                style={{
                  left: `${pos(start)}%`,
                  width: `${Math.max(pos(end) - pos(start), 1)}%`,
                }}
                title={`${fmt(start)} – ${fmt(end)}${fill === undefined ? '' : `, готово ${fill} %`}`}
              >
                {fill !== undefined && (
                  <span className="roadmap-fill" style={{ width: `${fill}%` }} />
                )}
                <span className="roadmap-label">{label}</span>
              </span>
            ) : null;
          return (
            <li key={e.issueId}>
              <div className="roadmap-row">
                <span className="roadmap-name">
                  {e.tasks.length > 0 && (
                    <button
                      type="button"
                      className="plain tree-toggle"
                      aria-expanded={open}
                      aria-label={`${open ? 'Свернуть' : 'Развернуть'} эпик ${e.title}: задач ${e.tasks.length}`}
                      title={open ? 'Скрыть задачи эпика' : 'Показать задачи эпика'}
                      onClick={() => toggle(e.issueId)}
                    >
                      {open ? '▾' : '▸'}
                    </button>
                  )}
                  <span className="chip project-tag">{e.projectKey}</span> {e.title}
                </span>
                <span className="roadmap-track">
                  {visible ? (
                    bar(e.start, e.end, `${e.percent} %`, e.percent)
                  ) : (
                    <span className="muted small">
                      {e.start === null
                        ? 'без дат: нет задач в спринтах'
                        : 'вне выбранного периода'}
                    </span>
                  )}
                  {todayPos >= 0 && todayPos <= 100 && (
                    <i className="roadmap-today" style={{ left: `${todayPos}%` }} />
                  )}
                </span>
              </div>
              {open &&
                e.tasks.map((t) => (
                  <div key={t.issueId} className="roadmap-row roadmap-task tree-row" data-depth={1}>
                    <span className="roadmap-name">
                      {e.projectKey}-{t.issueNumber} {t.title}
                    </span>
                    <span className="roadmap-track">
                      {bar(t.start, t.end, t.status) ?? (
                        <span className="muted small">не в спринте</span>
                      )}
                    </span>
                  </div>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
