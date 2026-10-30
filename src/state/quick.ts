import { create } from 'zustand';

interface QuickState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

/** Командная палитра Ctrl+K (ADR-017): открывается с клавиатуры и кнопкой «Поиск». */
export const useQuick = create<QuickState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
