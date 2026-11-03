import { create } from 'zustand';
import { isGroupField, type GroupField } from '../domain/board';

// Выбор дорожек доски запоминается в браузере (wireframes.md, разделы 5 и 27.1); по умолчанию — по эпикам.

const KEY = 'team-tracker:board-group';

function read(): GroupField {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isGroupField(stored) ? stored : 'epic';
  } catch {
    return 'epic';
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
