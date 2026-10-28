import type { Person } from '../../domain/schema';
import type { SprintSummary } from '../../domain/totals';
import { Avatar } from '../tasks/IssueBits';

/** Итоги по людям и спринту: задач, story points, из них в Done (F-13). */
export function TotalsTable({ summary, people }: { summary: SprintSummary; people: Person[] }) {
  return (
    <table className="totals">
      <thead>
        <tr>
          <th>Исполнитель</th>
          <th>Задач</th>
          <th>sp</th>
          <th>Из них в Done</th>
        </tr>
      </thead>
      <tbody>
        {summary.rows.map((r) => (
          <tr key={r.personId ?? 'none'}>
            <td>
              <Avatar person={people.find((p) => p.id === r.personId)} /> {r.name}
            </td>
            <td>{r.count}</td>
            <td>{r.points}</td>
            <td>{r.done}</td>
          </tr>
        ))}
        {summary.rows.length === 0 && (
          <tr>
            <td colSpan={4} className="muted">
              В спринте нет задач
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <th>Итого</th>
          <th>{summary.total.count}</th>
          <th>{summary.total.points}</th>
          <th>{summary.total.done}</th>
        </tr>
      </tfoot>
    </table>
  );
}
