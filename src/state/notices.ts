import { create } from 'zustand';

// Состояние интерфейса (Zustand): всплывающие сообщения в углу экрана (D-7, ADR-024).
// Успех и сведения исчезают сами, предупреждения — чуть позже, ошибки остаются до закрытия.

export type NoticeKind = 'success' | 'info' | 'warn' | 'error';

/** Ссылка в сообщении («Открыть DEMO-17»). */
export interface NoticeLink {
  to: string;
  label: string;
}

export interface Notice {
  id: number;
  text: string;
  kind: NoticeKind;
  link?: NoticeLink;
}

interface NoticeState {
  notices: Notice[];
  push: (text: string, kind?: NoticeKind, link?: NoticeLink) => void;
  dismiss: (id: number) => void;
  /** Пауза автоскрытия (указатель или фокус на сообщении). */
  hold: (id: number) => void;
  /** Снять паузу: сообщение исчезнет через короткое время. */
  release: (id: number) => void;
}

/** Сколько живёт сообщение, мс; null — пока не закроют. */
export const NOTICE_LIFETIME: Record<NoticeKind, number | null> = {
  success: 4000,
  info: 4000,
  warn: 7000,
  error: null,
};
/** Одновременно на экране — не больше стольких сообщений. */
export const MAX_NOTICES = 3;
const AFTER_HOLD = 2000;

/** Текст ошибок по полям одной строкой. */
export const joinErrors = (errors: Record<string, string>) => Object.values(errors).join('. ');

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function stop(id: number) {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

export const useNotices = create<NoticeState>((set, get) => {
  const schedule = (id: number, ms: number | null) => {
    stop(id);
    if (ms === null) return;
    timers.set(
      id,
      setTimeout(() => get().dismiss(id), ms),
    );
  };
  return {
    notices: [],
    push: (text, kind = 'success', link) => {
      const id = nextId++;
      const notice: Notice = link ? { id, text, kind, link } : { id, text, kind };
      set((s) => {
        const all = [...s.notices, notice];
        // лишние уходят: сначала самые старые не-ошибки, затем самые старые вообще
        while (all.length > MAX_NOTICES) {
          const i = all.findIndex((n) => n.kind !== 'error');
          const [gone] = all.splice(i === -1 ? 0 : i, 1);
          if (gone) stop(gone.id);
        }
        return { notices: all };
      });
      schedule(id, NOTICE_LIFETIME[kind]);
    },
    dismiss: (id) => {
      stop(id);
      set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
    },
    hold: (id) => stop(id),
    release: (id) => {
      const notice = get().notices.find((n) => n.id === id);
      if (notice && NOTICE_LIFETIME[notice.kind] !== null) schedule(id, AFTER_HOLD);
    },
  };
});
