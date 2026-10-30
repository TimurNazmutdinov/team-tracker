import { create } from 'zustand';

// Последний открытый проект: на «Портфеле» и «Аналитике» шапка показывает его вкладки (wireframes.md, 24.1).

const KEY = 'team-tracker:last-project';

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

interface LastProjectState {
  key: string | null;
  set: (key: string) => void;
}

export const useLastProject = create<LastProjectState>((set) => ({
  key: read(),
  set: (key) => {
    try {
      window.localStorage.setItem(KEY, key);
    } catch {
      // выбор действует, но не запомнится в этом браузере
    }
    set({ key });
  },
}));
