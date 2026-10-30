import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useStorage } from '../app/storage-context';
import { SERVER_MODE } from '../app/create-storage';
import { authClient } from '../app/auth-client';
import { PALETTES, PALETTE_LABELS, type Palette } from '../domain/palettes';
import { DEFAULT_ROLES, roleName } from '../domain/permissions';
import { usePalette } from '../state/palette';
import { resolveAuthor, useUserStore } from '../state/current-user';
import { useSession } from '../state/session';
import { useNotices } from '../state/notices';
import { usePeople, useRoles } from '../state/queries';

/** Выбор цветовой гаммы (ADR-013): применяется сразу; с сервером сохраняется в профиле. */
export function PaletteField() {
  const palette = usePalette((s) => s.palette);
  const apply = usePalette((s) => s.set);
  const account = useSession((s) => s.account);
  const setAccount = useSession((s) => s.set);
  const push = useNotices((s) => s.push);

  const choose = async (next: Palette) => {
    if (next === palette) return;
    const previous = palette;
    apply(next);
    if (!SERVER_MODE || !account) return;
    try {
      setAccount(await authClient.setPalette(next));
    } catch {
      apply(previous);
      push('Не удалось сохранить цветовую гамму: проверьте связь с сервером');
    }
  };

  return (
    <fieldset className="palette-field">
      <legend>Цветовая гамма</legend>
      {PALETTES.map((p) => (
        <label key={p} className={`palette-option${p === palette ? ' selected' : ''}`}>
          <input
            type="radio"
            name="palette"
            value={p}
            checked={p === palette}
            onChange={() => void choose(p)}
          />
          <span>{PALETTE_LABELS[p]}</span>
          <span className="swatches" data-swatch={p} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </label>
      ))}
      <p className="hint">Применяется сразу{SERVER_MODE ? '; сохраняется в вашем профиле' : ''}.</p>
    </fieldset>
  );
}

/** Меню профиля. В демо-режиме содержит «Сбросить данные» (возврат к seed.json). */
export function UserMenu() {
  const storage = useStorage();
  const queryClient = useQueryClient();
  const push = useNotices((s) => s.push);
  const people = usePeople();
  const roles = useRoles();
  const userId = useUserStore((s) => s.userId);
  const setUser = useUserStore((s) => s.setUser);
  const account = useSession((s) => s.account);
  const setAccount = useSession((s) => s.set);
  const current = people.data ? resolveAuthor(people.data, account?.id ?? null, userId) : undefined;
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

  const onLogout = async () => {
    setOpen(false);
    await authClient.logout().catch(() => undefined);
    setAccount(null);
  };

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
          {SERVER_MODE && account && (
            <p className="muted">
              {account.email}
              <br />
              {roleName(roles.data ?? DEFAULT_ROLES, account.role)}
            </p>
          )}
          {!SERVER_MODE && people.data && (
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
          <PaletteField />
          <Link to="/about" role="menuitem" onClick={() => setOpen(false)}>
            О программе
          </Link>
          {SERVER_MODE ? (
            <button type="button" role="menuitem" onClick={() => void onLogout()}>
              Выйти
            </button>
          ) : reset ? (
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
