import { create } from 'zustand';
import { isGroupField, type GroupField } from '../domain/board';

// Выбор группировки доски запоминается в браузере (wireframes.md, раздел 5).

const KEY = 'team-tracker:board-group';

function read(): GroupField {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isGroupField(stored) ? stored : 'assignee';
  } catch {
    return 'assignee';
  }
}

interface BoardPrefs {
  groupBy: GroupField;
  setGroupBy: (field: GroupField) => void;
}

export const useBoardPrefs = create<BoardPrefs>((set) => ({
  groupBy: read(),
  setGroupBy: (field) => {
    try {
      window.localStorage.setItem(KEY, field);
    } catch {
      // выбор просто не запомнится
    }
    set({ groupBy: field });
  },
}));
