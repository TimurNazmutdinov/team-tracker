import { create } from 'zustand';
import type { Role } from '../domain/permissions';

// Сессия входа (ADR-010). В демо-режиме (без сервера) входа нет: account всегда null, а права не
// ограничиваются — всё как до этапа 8.

export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Пароль временный: до его смены доступна только смена пароля (ADR-011). */
  mustChangePassword: boolean;
}

export type SessionStatus = 'unknown' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  account: Account | null;
  set: (account: Account | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'unknown',
  account: null,
  set: (account) => set({ account, status: account ? 'signedIn' : 'signedOut' }),
}));
