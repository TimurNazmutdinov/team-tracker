// Когда делать копию автоматически (ADR-012): ежедневно в заданное время и при запуске, если
// последней копии больше суток. Чистые функции — чтобы расписание проверялось тестами.

const HOUR = 3600 * 1000;
export const RETRY_AFTER_ERROR_MS = HOUR;
export const STARTUP_MAX_AGE_MS = 24 * HOUR;

export function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number);
  return { hours: h ?? 18, minutes: m ?? 0 };
}

export function dueAt(day: Date, time: string): Date {
  const { hours, minutes } = parseTime(time);
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** Пора ли делать ежедневную копию: время наступило, сегодня удачной копии ещё нет, после ошибки прошёл час. */
export function dailyDue(args: {
  now: Date;
  time: string;
  lastOkAt: Date | null;
  lastAttemptAt: Date | null;
}): boolean {
  const due = dueAt(args.now, args.time);
  if (args.now < due) return false;
  if (args.lastOkAt && args.lastOkAt >= due) return false;
  if (args.lastAttemptAt && args.now.getTime() - args.lastAttemptAt.getTime() < RETRY_AFTER_ERROR_MS) {
    return false;
  }
  return true;
}

/** При запуске: копия нужна, если удачных копий нет или последней больше 24 часов. */
export function startupDue(now: Date, lastOkAt: Date | null): boolean {
  return !lastOkAt || now.getTime() - lastOkAt.getTime() > STARTUP_MAX_AGE_MS;
}

/** Следующая копия по расписанию: сегодня, если время ещё не наступило, иначе завтра. */
export function nextRun(now: Date, time: string): Date {
  const today = dueAt(now, time);
  if (now < today) return today;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dueAt(tomorrow, time);
}
