import { create } from 'zustand';
import type { IssueType } from '../domain/schema';

export interface CreatePreset {
  type?: IssueType;
  parentId?: string;
  sprintId?: string;
}

interface CreateDialogState {
  open: boolean;
  preset: CreatePreset;
  show: (preset?: CreatePreset) => void;
  hide: () => void;
}

/** Окно «Создать задачу» открывается из бэклога и из карточки задачи (подзадача). */
export const useCreateDialog = create<CreateDialogState>((set) => ({
  open: false,
  preset: {},
  show: (preset = {}) => set({ open: true, preset }),
  hide: () => set({ open: false }),
}));
