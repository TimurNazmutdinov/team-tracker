import { create } from 'zustand';

// Состояние интерфейса (Zustand): короткие уведомления сверху страницы.

interface Notice {
  id: number;
  text: string;
}

interface NoticeState {
  notices: Notice[];
  push: (text: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useNotices = create<NoticeState>((set) => ({
  notices: [],
  push: (text) => set((s) => ({ notices: [...s.notices, { id: nextId++, text }] })),
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));
