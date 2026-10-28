import { create } from 'zustand';
import type { Person } from '../domain/schema';
import { usePeople } from './queries';

// Демо-режим без входа: действия выполняются от имени выбранного участника (автор в истории,
// автор задач и комментариев). Выбор запоминается в браузере; позже его заменит вход (ADR-006).

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

/** Выбранный участник; если выбора нет или он устарел, — первый в списке. */
export function resolveUser(people: Person[], userId: string | null): Person | undefined {
  return people.find((p) => p.id === userId) ?? people[0];
}

export function useCurrentUser(): Person | undefined {
  const people = usePeople();
  const userId = useUserStore((s) => s.userId);
  return people.data ? resolveUser(people.data, userId) : undefined;
}
