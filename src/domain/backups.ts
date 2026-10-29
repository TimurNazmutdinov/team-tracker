// Типы состояния резервных копий: общие для сервера и интерфейса администратора (ADR-012).

export interface BackupCounts {
  projects: number;
  people: number;
  sprints: number;
  issues: number;
  links: number;
  comments: number;
  history: number;
}

/** Одна запись журнала копий. */
export interface BackupEntry {
  /** Когда копия делалась (ISO). */
  at: string;
  ok: boolean;
  /** Имя папки комплекта; null, если копия не создана. */
  bundle: string | null;
  /** Причина: «по расписанию», «при запуске», «вручную», «перед восстановлением». */
  reason: string;
  /** Сообщение об ошибке или предупреждение; пусто, если всё хорошо. */
  message: string;
  counts: BackupCounts | null;
}

export interface BackupStatus {
  dir: string;
  auto: boolean;
  /** Время ежедневной копии, ЧЧ:ММ. */
  time: string;
  /** Следующая копия по расписанию (ISO); null, если автокопирование выключено. */
  nextAt: string | null;
  running: boolean;
  last: BackupEntry | null;
  /** Время последней успешной копии. */
  lastOkAt: string | null;
  /** Последние записи журнала, новые первыми. */
  recent: BackupEntry[];
  /** Заметное предупреждение для администратора; null, если всё в порядке. */
  warning: string | null;
  keepDaily: number;
  keepMonthly: number;
}
