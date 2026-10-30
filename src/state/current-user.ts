import { create } from 'zustand';
import {
  DEFAULT_ROLES,
  can,
  canChangeStatus,
  type Action,
  type Role,
  type RoleDef,
} from '../domain/permissions';
import type { Issue, Person } from '../domain/schema';
import { usePeople, useRoles } from './queries';
import { useSession } from './session';

// Кто выполняет действия. С сервером (ADR-010) — вошедший пользователь; в демо-режиме без входа —
// участник, выбранный в меню (ADR-006), с правами администратора.

const KEY = 'team-tracker:user';

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

interface UserState {
  userId: string | null;
  setUser: (id: string) => void;
}

export const useUserStore = create<UserState>((set) => ({
  userId: read(),
  setUser: (id) => {
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      // выбор просто не запомнится
    }
    set({ userId: id });
  },
}));

/** Автор действий: вошедший пользователь; в демо-режиме — выбранный участник или первый в списке. */
export function resolveAuthor(
  people: Person[],
  accountId: string | null,
  demoUserId: string | null,
): Person | undefined {
  if (accountId !== null) return people.find((p) => p.id === accountId);
  return people.find((p) => p.id === demoUserId) ?? people[0];
}

export function useCurrentUser(): Person | undefined {
  const people = usePeople();
  const accountId = useSession((s) => s.account?.id ?? null);
  const userId = useUserStore((s) => s.userId);
  return people.data ? resolveAuthor(people.data, accountId, userId) : undefined;
}

/** Роль вошедшего пользователя; без сервера ограничений нет — как у администратора. */
export function useRole(): Role {
  return useSession((s) => s.account?.role ?? 'admin');
}

export interface Permissions {
  role: Role;
  can: (action: Action) => boolean;
  canChangeStatus: (issue: Pick<Issue, 'assigneeId'>) => boolean;
}

/** Права текущего пользователя для скрытия недоступных действий; сервер проверяет их сам. */
export function usePermissions(): Permissions {
  const role = useRole();
  const user = useCurrentUser();
  const roles: readonly RoleDef[] = useRoles().data ?? DEFAULT_ROLES;
  return {
    role,
    can: (action) => can(roles, role, action),
    canChangeStatus: (issue) => canChangeStatus(roles, role, user?.id ?? '', issue),
  };
}
