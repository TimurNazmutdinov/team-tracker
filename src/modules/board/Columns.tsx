import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { StatusDef } from '../../domain/schema';
import {
  CATEGORY_LABELS,
  activeStatuses,
  boardStatuses,
  statusClass,
  type StatusCategory,
  type StatusResult,
} from '../../domain/statuses';
import { useStatusActions } from '../../state/actions';
import { usePermissions } from '../../state/current-user';
import { joinErrors, useNotices } from '../../state/notices';
import { useStatusList } from '../../state/queries';
import { Dialog } from '../../ui/Dialog';

// Колонки досок как корзины в Planner (D-1, wireframes.md 27.2): двойной клик — переименовать,
// «⋯» — меню колонки, заголовок перетаскивается, «+» — новая колонка, удаление — с переносом задач.

/** Знак типа колонки: пустой круг — не начато, половина — в работе, полный — готово. */
export function CategoryMark({ category }: { category: StatusCategory }) {
  return (
    <span
      className={`cat-mark cat-mark-${category}`}
      role="img"
      aria-label={`Тип колонки: ${CATEGORY_LABELS[category]}`}
      title={`Тип колонки: ${CATEGORY_LABELS[category]}`}
    />
  );
}

/** Может ли пользователь менять колонки (право «Колонки досок»). */
export function useCanEditColumns(): boolean {
  return usePermissions().can('board.columns');
}

function useReport() {
  const push = useNotices((s) => s.push);
  return (result: StatusResult) => {
    if (!result.ok) push(joinErrors(result.errors), 'error');
    return result.ok;
  };
}

const DRAG_TYPE = 'application/x-tt-column';

export function ColumnHead({
  status,
  summary,
  warning,
  wipHref,
}: {
  status: StatusDef;
  /** «3 · 8 sp» */
  summary: ReactNode;
  warning?: ReactNode;
  /** Ссылка на WIP-лимиты проекта (доска одного проекта). */
  wipHref?: string | undefined;
}) {
  const statuses = useStatusList();
  const board = boardStatuses(statuses);
  const index = board.findIndex((s) => s.id === status.id);
  const editable = useCanEditColumns();
  const actions = useStatusActions();
  const report = useReport();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(status.name);
  const [menu, setMenu] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const saveName = async () => {
    setEditing(false);
    if (name.trim() === status.name) return;
    if (!report(await actions.rename(status.id, name))) setName(status.name);
  };

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_TYPE, status.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropSide(e.clientX < box.left + box.width / 2 ? 'left' : 'right');
  };
  const onDrop = async (e: DragEvent) => {
    const id = e.dataTransfer.getData(DRAG_TYPE);
    const side = dropSide;
    setDropSide(null);
    if (!id || id === status.id) return;
    e.preventDefault();
    const from = board.findIndex((s) => s.id === id);
    let to = index + (side === 'right' ? 1 : 0);
    if (from < to) to -= 1;
    report(await actions.move(id, { to }));
  };

  return (
    <div
      className={`col-head ${statusClass(statuses, status.id)}${dropSide ? ` drop-${dropSide}` : ''}`}
      draggable={editable && !editing}
      onDragStart={editable ? onDragStart : undefined}
      onDragOver={editable ? onDragOver : undefined}
      onDragLeave={() => setDropSide(null)}
      onDrop={editable ? (e) => void onDrop(e) : undefined}
      title={
        editable ? 'Двойной клик — переименовать; перетащите заголовок, чтобы сдвинуть' : undefined
      }
    >
      <CategoryMark category={status.category} />
      {editing ? (
        <input
          className="col-name-input"
          aria-label={`Новое название колонки «${status.name}»`}
          value={name}
          autoFocus
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveName();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setName(status.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <strong onDoubleClick={editable ? () => setEditing(true) : undefined}>{status.name}</strong>
      )}
      <span className="muted">{summary}</span>
      {warning}
      {editable && (
        <div className="col-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="plain col-menu-button"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={`Меню колонки «${status.name}»`}
            title="Меню колонки"
            onClick={() => setMenu(!menu)}
          >
            ⋯
          </button>
          {menu && (
            <div className="col-menu" role="menu" aria-label={`Колонка «${status.name}»`}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  setEditing(true);
                }}
              >
                Переименовать
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={index <= 0}
                onClick={async () => {
                  setMenu(false);
                  report(await actions.move(status.id, { delta: -1 }));
                }}
              >
                Сдвинуть влево
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={index === -1 || index >= board.length - 1}
                onClick={async () => {
                  setMenu(false);
                  report(await actions.move(status.id, { delta: 1 }));
                }}
              >
                Сдвинуть вправо
              </button>
              <div className="col-menu-types" role="group" aria-label="Тип колонки">
                {(['todo', 'progress', 'done'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitemradio"
                    aria-checked={status.category === c}
                    className={status.category === c ? 'selected' : ''}
                    title="Тип решает, что считается «готово» для отчётов, DoD и velocity"
                    onClick={async () => {
                      setMenu(false);
                      report(await actions.setCategory(status.id, c));
                    }}
                  >
                    <CategoryMark category={c} /> {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
              {wipHref && (
                <Link role="menuitem" to={wipHref} onClick={() => setMenu(false)}>
                  WIP-лимит — в настройках проекта
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                className="danger-text"
                onClick={() => {
                  setMenu(false);
                  setRemoving(true);
                }}
              >
                Удалить колонку…
              </button>
            </div>
          )}
        </div>
      )}
      {removing && <RemoveColumnDialog status={status} onClose={() => setRemoving(false)} />}
    </div>
  );
}

/** Окно удаления колонки: задачи из неё переносятся в выбранную колонку во всех проектах. */
function RemoveColumnDialog({ status, onClose }: { status: StatusDef; onClose: () => void }) {
  const statuses = useStatusList();
  const actions = useStatusActions();
  const push = useNotices((s) => s.push);
  const others = activeStatuses(statuses).filter((s) => s.id !== status.id);
  // по умолчанию — соседняя колонка доски слева (или справа), а не служебный «бэклог»
  const board = boardStatuses(statuses);
  const at = board.findIndex((s) => s.id === status.id);
  const neighbour = board[at - 1] ?? board[at + 1];
  const [target, setTarget] = useState(neighbour?.id ?? others[0]?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={`Удалить колонку «${status.name}»?`} onClose={onClose}>
      <p>
        Задачи из этой колонки (во всех проектах) перейдут в выбранную колонку; в истории останется
        старое название.
      </p>
      <div className="field">
        <label htmlFor="remove-column-target">Куда перенести задачи</label>
        <select
          id="remove-column-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {others.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({CATEGORY_LABELS[s.category]})
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !target}
          onClick={async () => {
            setBusy(true);
            const result = await actions.remove(status.id, target);
            setBusy(false);
            if (!result.ok) {
              setError(joinErrors(result.errors));
              return;
            }
            push(`Колонка «${status.name}» удалена`);
            onClose();
          }}
        >
          Перенести и удалить
        </button>
        <button type="button" onClick={onClose}>
          Отмена
        </button>
      </div>
    </Dialog>
  );
}

/** «+» в конце заголовков: новая колонка встаёт перед первой колонкой «готово». */
export function AddColumn() {
  const actions = useStatusActions();
  const report = useReport();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const save = async () => {
    if (!name.trim()) {
      setOpen(false);
      return;
    }
    if (report(await actions.add({ name }))) {
      setName('');
      setOpen(false);
    }
  };
  if (!open)
    return (
      <button
        type="button"
        className="add-column"
        aria-label="Добавить колонку"
        title="Добавить колонку: встанет перед колонкой «готово»"
        onClick={() => setOpen(true)}
      >
        +
      </button>
    );
  return (
    <div className="add-column open">
      <input
        aria-label="Название новой колонки"
        placeholder="Название колонки"
        value={name}
        autoFocus
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setName('');
            setOpen(false);
          }
        }}
      />
    </div>
  );
}
