import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

// Журналы ошибок в DATA_DIR/logs (часть 2 доработок, ADR-015): отдельные файлы сервера и клиента,
// запись — по одной JSON-строке; когда файл достигает предела, он сдвигается: name.log → name.log.1
// → … → name.log.(keep-1), самый старый удаляется.

export type LogSource = 'server' | 'client';

export interface LogEntry {
  at: string;
  source: LogSource;
  message: string;
  stack?: string | undefined;
  /** Адрес страницы (клиент) или «МЕТОД путь» (сервер). */
  where?: string | undefined;
}

export const LOG_MAX_BYTES = 1024 * 1024;
export const LOG_KEEP = 5;
const MESSAGE_MAX = 2000;
const STACK_MAX = 6000;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

export class RotatingLog {
  constructor(
    private readonly dir: string,
    private readonly name: string,
    private readonly maxBytes = LOG_MAX_BYTES,
    private readonly keep = LOG_KEEP,
  ) {}

  private file(n = 0): string {
    return join(this.dir, n === 0 ? `${this.name}.log` : `${this.name}.log.${n}`);
  }

  append(line: string): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      const size = existsSync(this.file()) ? statSync(this.file()).size : 0;
      if (size > 0 && size + Buffer.byteLength(line) + 1 > this.maxBytes) this.rotate();
      appendFileSync(this.file(), `${line}\n`);
    } catch {
      // журнал недоступен (нет места, права): работа трекера из-за этого не прерывается
    }
  }

  private rotate(): void {
    rmSync(this.file(this.keep - 1), { force: true });
    for (let n = this.keep - 2; n >= 0; n -= 1) {
      if (existsSync(this.file(n))) renameSync(this.file(n), this.file(n + 1));
    }
  }

  /** Строки журнала от новых к старым (сначала текущий файл, затем сдвинутые). */
  lines(limit: number): string[] {
    const out: string[] = [];
    for (let n = 0; n < this.keep && out.length < limit; n += 1) {
      if (!existsSync(this.file(n))) continue;
      const rows = readFileSync(this.file(n), 'utf8').split('\n').filter(Boolean).reverse();
      out.push(...rows.slice(0, limit - out.length));
    }
    return out;
  }

  files(): string[] {
    return Array.from({ length: this.keep }, (_, n) => this.file(n)).filter((f) => existsSync(f));
  }
}

/** Журналы сервера и клиента в одном каталоге. */
export class LogStore {
  private readonly server: RotatingLog;
  private readonly client: RotatingLog;

  constructor(
    readonly dir: string,
    maxBytes = LOG_MAX_BYTES,
    keep = LOG_KEEP,
  ) {
    this.server = new RotatingLog(dir, 'server', maxBytes, keep);
    this.client = new RotatingLog(dir, 'client', maxBytes, keep);
  }

  write(source: LogSource, entry: Omit<LogEntry, 'at' | 'source'>, at = new Date()): void {
    const record: LogEntry = {
      at: at.toISOString(),
      source,
      message: clip(entry.message, MESSAGE_MAX),
      ...(entry.stack ? { stack: clip(entry.stack, STACK_MAX) } : {}),
      ...(entry.where ? { where: clip(entry.where, 300) } : {}),
    };
    (source === 'server' ? this.server : this.client).append(JSON.stringify(record));
  }

  /** Последние записи обоих журналов, от новых к старым. */
  recent(limit = 50): LogEntry[] {
    const parse = (line: string): LogEntry | null => {
      try {
        const value = JSON.parse(line) as LogEntry;
        return typeof value.at === 'string' && typeof value.message === 'string' ? value : null;
      } catch {
        return null;
      }
    };
    return [...this.server.lines(limit), ...this.client.lines(limit)]
      .map(parse)
      .filter((e): e is LogEntry => e !== null)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  }

  files(): string[] {
    return [...this.server.files(), ...this.client.files()];
  }
}
