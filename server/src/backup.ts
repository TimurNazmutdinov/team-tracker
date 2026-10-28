import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { lockedBy } from './lock';

// Резервные копии встроенной базы (ADR-011): архив каталога данных PGlite. Работает только при
// остановленном трекере. С PostgreSQL копии делает scripts/backup.sh (pg_dump).

const PREFIX = 'tracker-';
const SUFFIX = '.tar.gz';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Метка времени для имени файла: ГГГГММДД-ЧЧММСС по местному времени. */
export function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function assertStopped(dataDir: string): void {
  const pid = lockedBy(dataDir);
  if (pid !== null) {
    throw new Error(`Трекер запущен (процесс ${pid}). Остановите его и повторите.`);
  }
}

/** Старые копии удаляются, остаются `keep` последних. */
function prune(dir: string, keep: number): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .sort()
    .reverse();
  for (const old of files.slice(keep)) rmSync(join(dir, old), { force: true });
}

export async function backupPglite(
  dataDir: string,
  backupDir: string,
  keep: number,
  now: Date = new Date(),
): Promise<string> {
  assertStopped(dataDir);
  if (!existsSync(dataDir)) throw new Error(`Нет данных для копии: каталог ${dataDir} не найден.`);
  const { PGlite } = await import('@electric-sql/pglite');
  const client = new PGlite(dataDir);
  try {
    await client.waitReady;
    const archive = await client.dumpDataDir('gzip');
    mkdirSync(backupDir, { recursive: true });
    const file = join(backupDir, `${PREFIX}${stamp(now)}${SUFFIX}`);
    writeFileSync(`${file}.part`, Buffer.from(await archive.arrayBuffer()));
    renameSync(`${file}.part`, file);
    prune(backupDir, keep);
    return file;
  } finally {
    await client.close();
  }
}

/**
 * Восстанавливает базу из копии. Текущий каталог данных не удаляется, а переименовывается в
 * `<каталог>.before-restore-<время>`: если копия не та, данные можно вернуть.
 */
export async function restorePglite(
  file: string,
  dataDir: string,
  now: Date = new Date(),
): Promise<{ previous: string | null }> {
  assertStopped(dataDir);
  if (!existsSync(file)) throw new Error(`Файл копии не найден: ${file}`);
  const archive = new Blob([readFileSync(file)]);
  let previous: string | null = null;
  if (existsSync(dataDir)) {
    previous = `${dataDir}.before-restore-${stamp(now)}`;
    renameSync(dataDir, previous);
  }
  const { PGlite } = await import('@electric-sql/pglite');
  try {
    const client = new PGlite(dataDir, { loadDataDir: archive });
    try {
      await client.waitReady;
      await client.query('select 1 from users limit 1');
    } finally {
      await client.close();
    }
  } catch (e) {
    // не вышло — возвращаем прежние данные на место
    rmSync(dataDir, { recursive: true, force: true });
    if (previous) renameSync(previous, dataDir);
    throw new Error(
      `Не удалось восстановить базу из ${file}: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  return { previous };
}
