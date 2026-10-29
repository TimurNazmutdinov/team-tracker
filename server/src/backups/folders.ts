import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { HttpError } from '../errors';

// Выбор папки для копий в настройках (ADR-012): проверка пути и просмотр папок компьютера, на
// котором работает сервер. Только для администратора.

function inside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Проверяет папку для копий: полный путь, не внутри папки данных базы, её можно создать и в неё
 * можно писать. Возвращает нормализованный путь.
 */
export function checkBackupDir(input: string, dataDir: string): string {
  const raw = input.trim();
  if (raw === '') throw new HttpError(422, 'invalid_data', 'Укажите папку для копий');
  if (!isAbsolute(raw)) {
    throw new HttpError(422, 'invalid_data', 'Укажите полный путь, например D:\\Backups\\tracker', [
      'Относительные пути не принимаются: непонятно, от какой папки их считать',
    ]);
  }
  const dir = resolve(raw);
  if (inside(dir, dataDir) || inside(dataDir, dir)) {
    throw new HttpError(
      422,
      'invalid_data',
      'Папка копий не должна быть связана с папкой данных базы',
      [`Папка данных: ${dataDir}`],
    );
  }
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.write-test-${process.pid}`);
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
  } catch (e) {
    throw new HttpError(422, 'invalid_data', 'В эту папку нельзя записать', [
      e instanceof Error ? e.message : String(e),
    ]);
  }
  return dir;
}

export interface FolderListing {
  /** Текущая папка; пусто — список дисков (Windows). */
  path: string;
  parent: string | null;
  sep: string;
  /** Диски Windows (C:\, D:\ …); на других системах пусто. */
  roots: string[];
  folders: { name: string; path: string }[];
}

const MAX_FOLDERS = 500;

function drives(): string[] {
  if (process.platform !== 'win32') return [];
  const out: string[] = [];
  for (let c = 67; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    if (existsSync(root)) out.push(root);
  }
  return out;
}

/** Подпапки каталога `path` (скрытые не показываются); без пути — домашняя папка пользователя. */
export function listFolders(path: string | undefined): FolderListing {
  const roots = drives();
  if (path === '' && roots.length > 0) {
    return {
      path: '',
      parent: null,
      sep,
      roots,
      folders: roots.map((r) => ({ name: r, path: r })),
    };
  }
  const dir = resolve(path || homedir());
  if (!isAbsolute(dir) || !existsSync(dir)) {
    throw new HttpError(404, 'not_found', `Папка не найдена: ${dir}`);
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new HttpError(403, 'forbidden', 'Папку нельзя открыть', [
      e instanceof Error ? e.message : String(e),
    ]);
  }
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$'))
    .map((e) => ({ name: e.name, path: join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .slice(0, MAX_FOLDERS);
  const up = dirname(dir);
  const atRoot = parse(dir).root === dir;
  return {
    path: dir,
    parent: atRoot ? (roots.length > 0 ? '' : null) : up,
    sep,
    roots,
    folders,
  };
}
