import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Встроенную базу PGlite нельзя открывать двумя процессами сразу — данные повредятся. Рядом с
// каталогом данных лежит файл-метка с номером процесса сервера: второй запуск, копия и
// восстановление видят её и отказываются работать, пока сервер не остановлен.

export function lockPath(dataDir: string): string {
  return `${dataDir}.lock`;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM — процесс есть, но чужой
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Номер процесса, который держит базу, или null (метки нет или процесс уже завершён). */
export function lockedBy(dataDir: string): number | null {
  const file = lockPath(dataDir);
  if (!existsSync(file)) return null;
  const pid = Number(readFileSync(file, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 && alive(pid) ? pid : null;
}

/** Занимает базу для этого процесса; возвращает функцию освобождения. */
export function acquireLock(dataDir: string): () => void {
  const pid = lockedBy(dataDir);
  if (pid !== null && pid !== process.pid) {
    throw new Error(
      `Трекер уже запущен (процесс ${pid}): база ${dataDir} используется. Закройте его окно и повторите.`,
    );
  }
  writeFileSync(lockPath(dataDir), String(process.pid));
  return () => {
    if (lockedBy(dataDir) === process.pid) rmSync(lockPath(dataDir), { force: true });
  };
}
