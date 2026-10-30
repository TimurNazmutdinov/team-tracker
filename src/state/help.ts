import { create } from 'zustand';

interface HelpState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

/** Справка по «?» (ADR-020): открывается клавишей и кнопкой в шапке. */
export const useHelp = create<HelpState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
