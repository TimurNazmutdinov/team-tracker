import { useCallback, useRef, useState, type ReactNode } from 'react';
import { dodItems, dodRequired } from '../../domain/dod';
import type { Issue, Project, Status } from '../../domain/schema';
import { Dialog } from '../../ui/Dialog';

interface Pending {
  title: string;
  items: string[];
}

/**
 * Подтверждение Definition of Done при переводе задач в Done (wireframes.md, 21.2).
 * `ask` возвращает true, если подтверждение не нужно или пользователь отметил все пункты.
 */
export function useDodGate(): {
  ask: (
    project: Pick<Project, 'dod'>,

    issues: Pick<Issue, 'status' | 'number' | 'title'>[],
    to: Status,
    key?: string,
  ) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(
    (
      project: Pick<Project, 'dod'>,
      issues: Pick<Issue, 'status' | 'number' | 'title'>[],
      to: Status,
      key = '',
    ) => {
      if (!issues.some((i) => dodRequired(project, i, to))) return Promise.resolve(true);
      const title =
        issues.length === 1 && issues[0]
          ? `${key ? `${key}-` : ''}${issues[0].number} ${issues[0].title}`
          : `Задач: ${issues.length}`;
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setPending({ title, items: dodItems(project) });
      });
    },
    [],
  );

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  const dialog = pending ? (
    <Dialog title="Перевести в Done?" onClose={() => finish(false)}>
      <DodForm pending={pending} onConfirm={() => finish(true)} onCancel={() => finish(false)} />
    </Dialog>
  ) : null;
  return { ask, dialog };
}

function DodForm({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(pending.items.map(() => false));
  const done = checked.filter(Boolean).length;
  const all = done === pending.items.length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (all) onConfirm();
      }}
    >
      <p className="muted">{pending.title}</p>
      <fieldset className="dod-list">
        <legend>Definition of Done</legend>
        {pending.items.map((item, n) => (
          <label key={n} className="check">
            <input
              type="checkbox"
              checked={checked[n] ?? false}
              onChange={() => setChecked(checked.map((c, i) => (i === n ? !c : c)))}
            />{' '}
            {item}
          </label>
        ))}
      </fieldset>
      <p className="muted" role="status">
        Отмечено {done} из {pending.items.length}: «Подтвердить» станет доступна, когда отмечены все
        пункты.
      </p>
      <button type="submit" className="primary" disabled={!all}>
        Подтвердить
      </button>{' '}
      <button type="button" onClick={onCancel}>
        Отмена
      </button>
    </form>
  );
}
