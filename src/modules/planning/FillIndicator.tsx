import { ABSENCE_LABELS, type AdjustedCapacity } from '../../domain/availability';
import type { Capacity, Fill } from '../../domain/planning';
import type { Person } from '../../domain/schema';
import { num } from '../../ui/format';

// Индикатор заполнения спринта (wireframes.md, 17.4): points против ёмкости. Состояние выражено
// значком и словами, а не только цветом.

const SCALE = 1.25; // шкала до 125 % ёмкости, чёрта — 100 %

function note(fill: Fill): string {
  switch (fill.level) {
    case 'over':
      return `⚠ Перегруз на ${num(fill.over)} sp: убрать задачи или перенести`;
    case 'near':
      return '● Почти полон: запас меньше 10 %';
    case 'ok':
      return `✓ Есть запас: ${num(fill.free)} sp`;
    default:
      return 'Ёмкость неизвестна: нет закрытых спринтов';
  }
}

export function capacityNote(capacity: Capacity): string {
  if (capacity.value === null) return 'Ёмкость появится после первого закрытого спринта';
  const list = capacity.velocities.map(num).join(', ');
  return capacity.sprints === 1
    ? `Ёмкость ${num(capacity.value)} sp = velocity закрытого спринта (${list})`
    : `Ёмкость ${num(capacity.value)} sp = среднее velocity последних ${capacity.sprints} спринтов (${list})`;
}

/** Строка про доступность: ёмкость = velocity × доступность; пусто, пока все на месте. */
function availabilityNote(capacity: AdjustedCapacity): string | null {
  const a = capacity.availability;
  if (capacity.base === null || a.ratio >= 1) return null;
  return `Ёмкость ${num(capacity.value ?? 0)} sp = velocity ${num(capacity.base)} sp × доступность ${Math.round(a.ratio * 100)} % (${a.availableDays} из ${a.totalDays} человеко-дней)`;
}

const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function FillIndicator({
  fill,
  capacity,
  names = [],
}: {
  fill: Fill;
  capacity: Capacity | AdjustedCapacity;
  names?: Person[];
}) {
  const adjusted = 'availability' in capacity ? capacity : null;
  const availability = adjusted ? availabilityNote(adjusted) : null;
  const width = Math.min((fill.percent ?? 0) / 100 / SCALE, 1) * 100;
  const summary =
    fill.percent === null
      ? `${num(fill.points)} sp`
      : `${num(fill.points)} / ${num(fill.capacity ?? 0)} sp · ${fill.percent} %`;
  return (
    <div className={`fill fill-${fill.level}`}>
      <div className="fill-line">
        {fill.percent !== null && (
          <div className="fill-bar" role="img" aria-label={`Заполнение спринта: ${summary}`}>
            <span className="fill-value" style={{ width: `${width}%` }} />
            <i className="fill-mark" style={{ left: `${100 / SCALE}%` }} />
          </div>
        )}
        <strong>{summary}</strong>
      </div>
      <span className="fill-note">{note(fill)}</span>
      <span className="muted small">{availability ?? capacityNote(capacity)}</span>
      {adjusted && adjusted.availability.absences.length > 0 && (
        <span className="muted small">
          Отсутствуют:{' '}
          {adjusted.availability.absences
            .map((x) => {
              const who = names.find((p) => p.id === x.absence.personId)?.name ?? '?';
              const range =
                x.start === x.end ? short(x.start) : `${short(x.start)}–${short(x.end)}`;
              return `${who} ${range} (${ABSENCE_LABELS[x.absence.kind].toLowerCase()})`;
            })
            .join(' · ')}
        </span>
      )}
    </div>
  );
}
