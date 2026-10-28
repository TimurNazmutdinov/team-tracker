import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useStorage } from '../app/storage-context';
import { resolveUser, useUserStore } from '../state/current-user';
import { useNotices } from '../state/notices';
import { usePeople } from '../state/queries';

/** Меню профиля. В демо-режиме содержит «Сбросить данные» (возврат к seed.json). */
export function UserMenu() {
  const storage = useStorage();
  const queryClient = useQueryClient();
  const push = useNotices((s) => s.push);
  const people = usePeople();
  const userId = useUserStore((s) => s.userId);
  const setUser = useUserStore((s) => s.setUser);
  const current = people.data ? resolveUser(people.data, userId) : undefined;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const reset = storage.reset?.bind(storage);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const onReset = async () => {
    setOpen(false);
    if (!reset) return;
    if (!window.confirm('Вернуть демо-данные к исходным? Все изменения будут потеряны.')) return;
    try {
      await reset();
      await queryClient.invalidateQueries();
      push('Данные сброшены к исходным (seed.json).');
    } catch (e) {
      push(`Не удалось сбросить данные: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="user-menu" ref={root}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {current ? current.name : 'Меню'} ▾
      </button>
      {open && (
        <div className="menu" role="menu">
          {people.data && (
            <label className="menu-field">
              Работаю как
              <select value={current?.id ?? ''} onChange={(e) => setUser(e.target.value)}>
                {people.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {reset ? (
            <button type="button" role="menuitem" onClick={() => void onReset()}>
              Сбросить данные
            </button>
          ) : (
            <span className="muted">Нет действий</span>
          )}
        </div>
      )}
    </div>
  );
}
