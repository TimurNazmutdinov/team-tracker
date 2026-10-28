import type { BurndownDay, VelocityReport } from '../../domain/reports';

// Графики рисуются вручную в SVG (без библиотеки): цвета и шрифты — из стилей темы, для доступности
// у каждого графика есть описание и таблица данных.

const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** Верх шкалы: кратен 4, чтобы деления были целыми. */
function niceMax(value: number): number {
  return Math.max(4, Math.ceil(value / 4) * 4);
}

const W = 640;
const H = 300;
const M = { left: 48, right: 16, top: 16, bottom: 40 };

/** Burndown: остаток story points по дням; пунктир — идеальная линия, сплошная — факт. */
export function BurndownChart({ days }: { days: BurndownDay[] }) {
  const known = days.filter((d) => d.remaining !== null);
  const yMax = niceMax(Math.max(1, ...days.map((d) => Math.max(d.ideal, d.scope ?? 0))));
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i: number) => M.left + (days.length <= 1 ? 0 : (iw * i) / (days.length - 1));
  const y = (v: number) => M.top + ih - (ih * v) / yMax;
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round((yMax * k) / 4));
  const actual = days
    .map((d, i) => (d.remaining === null ? null : ([x(i), y(d.remaining)] as const)))
    .filter((p): p is readonly [number, number] => p !== null);
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  const last = known.at(-1);
  const summary = last
    ? `Остаток на ${fmt(last.date)}: ${last.remaining} sp из ${last.scope} sp.`
    : 'Данных пока нет.';

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Burndown. ${summary}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={M.left - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
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
        <polyline
          className="line-ideal"
          fill="none"
          points={days.map((d, i) => `${x(i)},${y(d.ideal)}`).join(' ')}
        />
        {actual.length > 1 && (
          <polyline
            className="line-actual"
            fill="none"
            points={actual.map(([px, py]) => `${px},${py}`).join(' ')}
          />
        )}
        {actual.map(([px, py], i) => (
          <circle key={i} className="dot-actual" cx={px} cy={py} r={3} />
        ))}
        <text className="axis" x={M.left} y={H - 4}>
          sp
        </text>
      </svg>
      <figcaption className="legend">
        <span className="swatch actual" /> факт <span className="swatch ideal" /> идеал
      </figcaption>
      <details>
        <summary>Таблица данных</summary>
        <table className="totals">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Объём, sp</th>
              <th>В Done, sp</th>
              <th>Остаток, sp</th>
              <th>Идеал, sp</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{fmt(d.date)}</td>
                <td>{d.scope ?? '—'}</td>
                <td>{d.done ?? '—'}</td>
                <td>{d.remaining ?? '—'}</td>
                <td>{d.ideal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Velocity: story points в Done по закрытым спринтам; идущий спринт отмечен как «в процессе». */
export function VelocityChart({ report }: { report: VelocityReport }) {
  const { bars, average } = report;
  const vw = 420;
  const vh = 300;
  const yMax = niceMax(Math.max(1, ...bars.map((b) => Math.max(b.velocity, b.scope))));
  const iw = vw - M.left - M.right;
  const ih = vh - M.top - M.bottom;
  const slot = iw / Math.max(bars.length, 1);
  const bw = Math.min(70, slot * 0.6);
  const y = (v: number) => M.top + ih - (ih * v) / yMax;
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round((yMax * k) / 4));
  const summary = bars
    .map((b) => `${b.name}: ${b.velocity} sp${b.state === 'active' ? ' (в процессе)' : ''}`)
    .join('; ');

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        role="img"
        aria-label={`Velocity. ${summary || 'Данных нет.'}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.left} x2={vw - M.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={M.left - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <line className="axis-line" x1={M.left} x2={vw - M.right} y1={M.top + ih} y2={M.top + ih} />
        {bars.map((b, i) => {
          const cx = M.left + slot * i + slot / 2;
          const top = y(b.velocity);
          return (
            <g key={b.sprintId}>
              <rect
                className={b.state === 'active' ? 'bar-active' : 'bar'}
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={Math.max(M.top + ih - top, b.state === 'active' ? 2 : 0)}
              />
              <text className="value" x={cx} y={top - 6} textAnchor="middle">
                {b.velocity}
              </text>
              <text className="axis" x={cx} y={vh - M.bottom + 18} textAnchor="middle">
                {b.name}
              </text>
              <text className="axis" x={cx} y={vh - M.bottom + 32} textAnchor="middle">
                {b.state === 'active' ? 'в процессе' : `из ${b.scope} sp`}
              </text>
            </g>
          );
        })}
        {average !== null && (
          <g>
            <line
              className="line-ideal"
              x1={M.left}
              x2={vw - M.right}
              y1={y(average)}
              y2={y(average)}
            />
            <text className="axis" x={vw - M.right} y={y(average) - 5} textAnchor="end">
              средняя {average}
            </text>
          </g>
        )}
      </svg>
      <details>
        <summary>Таблица данных</summary>
        <table className="totals">
          <thead>
            <tr>
              <th>Спринт</th>
              <th>Velocity, sp</th>
              <th>Объём, sp</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.sprintId}>
                <td>{b.name}</td>
                <td>{b.velocity}</td>
                <td>{b.scope}</td>
                <td>{b.state === 'closed' ? 'закрыт' : 'идёт (в процессе)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
