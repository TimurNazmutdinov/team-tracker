import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { BackupCounts, BackupEntry, BackupStatus } from '../../../src/domain/backups';
import type { Connection } from '../db';
import { HttpError } from '../errors';
import { BUNDLE_RE, SAFETY_PREFIX, bundleDate, bundleName, planRotation } from './rotation';
import { dailyDue, nextRun, startupDue } from './schedule';
import { takeSnapshot } from './snapshot';
import {
  FORMAT,
  backupJsonSchema,
  countsOf,
  type BackupJson,
  type Entities,
  type Snapshot,
} from './types';
import { buildXlsx, localStamp, readXlsx } from './xlsx';

// Резервные копии (ADR-012): комплект из tracker.xlsx, tracker.json и копии базы в папке
// BACKUP_DIR/ГГГГ-ММ-ДД_ЧЧ-ММ/. Копия не останавливает трекер, проверяется после создания, а её
// результат пишется в журнал backup-log.txt.

export const LOG_FILE = 'backup-log.txt';
export const JSON_FILE = 'tracker.json';
export const XLSX_FILE = 'tracker.xlsx';

const OVERDUE_MS = 48 * 3600 * 1000;
const RECENT = 10;

export interface BackupOptions {
  connection: Connection;
  dir: string;
  appVersion: string;
  keepDaily: number;
  keepMonthly: number;
  /** Время ежедневной копии, ЧЧ:ММ; автокопирование включается вызовом `start()`. */
  time: string;
  auto: boolean;
  now?: () => Date;
  onLog?: (message: string) => void;
}

export interface RunResult {
  bundle: string;
  dir: string;
  counts: BackupCounts;
  warnings: string[];
  durationMs: number;
}

const ENTITY_KEYS = [
  'projects',
  'people',
  'sprints',
  'issues',
  'links',
  'comments',
  'history',
] as const;

/** Расхождения между снимком и прочитанной обратно копией (количества и состав id). */
export function compareEntities(label: string, expected: Entities, actual: Entities): string[] {
  const problems: string[] = [];
  for (const key of ENTITY_KEYS) {
    const want = new Set(expected[key].map((r) => r.id));
    const got = new Set(actual[key].map((r) => r.id));
    if (want.size !== got.size || expected[key].length !== actual[key].length) {
      problems.push(
        `${label}: ${key} — в базе ${expected[key].length}, в копии ${actual[key].length}`,
      );
      continue;
    }
    const missing = [...want].filter((id) => !got.has(id));
    if (missing.length > 0)
      problems.push(`${label}: ${key} — не хватает записей (${missing.length})`);
  }
  return problems;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
}

function parseLocal(stamp: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(stamp);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return new Date(y, mo - 1, d, h, mi, s);
}

function countsText(c: BackupCounts): string {
  return `проекты ${c.projects}, люди ${c.people}, спринты ${c.sprints}, задачи ${c.issues}, связи ${c.links}, комментарии ${c.comments}, история ${c.history}`;
}

function parseCounts(text: string): BackupCounts | null {
  const g = (word: string) => Number(new RegExp(`${word} (\\d+)`).exec(text)?.[1] ?? Number.NaN);
  const c = {
    projects: g('проекты'),
    people: g('люди'),
    sprints: g('спринты'),
    issues: g('задачи'),
    links: g('связи'),
    comments: g('комментарии'),
    history: g('история'),
  };
  return Object.values(c).every((n) => Number.isInteger(n)) ? c : null;
}

export class BackupService {
  private running = false;
  private lastAttemptAt: Date | null = null;
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private dirPath: string;
  /** Результат последнего запуска в памяти: виден, даже если журнал недоступен. */
  private lastRunEntry: BackupEntry | null = null;

  constructor(private readonly options: BackupOptions) {
    this.now = options.now ?? (() => new Date());
    this.dirPath = options.dir;
  }

  get dir(): string {
    return this.dirPath;
  }

  /** Меняет папку копий (выбор в настройках); прежние комплекты остаются на месте. */
  setDir(dir: string): void {
    this.dirPath = dir;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ------------------------------------------------------------ создание копии

  /**
   * Делает комплект копии и проверяет его. При ошибке пишет в журнал и пробрасывает её.
   * Комплект сначала собирается во временной папке и переименовывается только после проверки.
   */
  async run(reason: string, prefix = ''): Promise<RunResult> {
    if (this.running) throw new HttpError(409, 'backup_running', 'Копия уже делается');
    this.running = true;
    const started = this.now();
    this.lastAttemptAt = started;
    try {
      const result = await this.build(reason, prefix, started);
      this.log(
        started,
        'OK',
        result.bundle,
        reason,
        `${countsText(result.counts)}${result.warnings.length ? `; предупреждения: ${result.warnings.join('; ')}` : ''}`,
      );
      this.rotate();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log(started, 'ОШИБКА', '-', reason, message);
      throw e;
    } finally {
      this.running = false;
    }
  }

  private async build(reason: string, prefix: string, started: Date): Promise<RunResult> {
    const t0 = Date.now();
    const { appVersion } = this.options;
    const dir = this.dirPath;
    mkdirSync(dir, { recursive: true });

    const snapshot = await takeSnapshot(this.options.connection.db);
    let name = bundleName(started, prefix);
    // Страховочный комплект (перед восстановлением) никогда не заменяет прежний: добавляется номер
    for (let n = 2; prefix && existsSync(join(dir, name)); n++) {
      name = `${bundleName(started, prefix)}-${n}`;
    }
    const tmp = join(dir, `.tmp-${name}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp);
    try {
      const counts = countsOf(snapshot.data);
      const warnings: string[] = [];
      const meta = {
        createdAt: started,
        reason,
        appVersion,
        schemaVersion: snapshot.schemaVersion,
      };

      const json: BackupJson = {
        format: FORMAT,
        createdAt: started.toISOString(),
        reason,
        appVersion,
        schemaVersion: snapshot.schemaVersion,
        counts,
        data: snapshot.data,
        accounts: snapshot.accounts,
      };
      writeFileSync(join(tmp, JSON_FILE), JSON.stringify(json, null, 2));
      const xlsx = await buildXlsx(snapshot, meta);
      warnings.push(...xlsx.warnings);
      writeFileSync(join(tmp, XLSX_FILE), xlsx.data);

      const dump = await this.options.connection.nativeDump();
      if ('skipped' in dump) warnings.push(dump.skipped);
      else writeFileSync(join(tmp, dump.file), dump.data);

      const problems = await this.verify(tmp, snapshot);
      if (problems.length > 0) {
        throw new Error(`проверка копии не пройдена: ${problems.join('; ')}`);
      }

      const final = join(dir, name);
      rmSync(final, { recursive: true, force: true });
      renameSync(tmp, final);
      return { bundle: name, dir: final, counts, warnings, durationMs: Date.now() - t0 };
    } catch (e) {
      rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
  }

  /** Перечитывает json и xlsx из папки и сверяет их с тем, что было в базе. */
  async verify(folder: string, snapshot: Snapshot): Promise<string[]> {
    const problems: string[] = [];
    try {
      const raw: unknown = JSON.parse(readFileSync(join(folder, JSON_FILE), 'utf8'));
      const parsed = backupJsonSchema.safeParse(raw);
      if (!parsed.success) {
        problems.push(`tracker.json: ${parsed.error.issues[0]?.message ?? 'неверная структура'}`);
      } else {
        problems.push(...compareEntities('tracker.json', snapshot.data, parsed.data.data));
        if (parsed.data.accounts.length !== snapshot.accounts.length) {
          problems.push(
            `tracker.json: учётных записей ${parsed.data.accounts.length} вместо ${snapshot.accounts.length}`,
          );
        }
      }
    } catch (e) {
      problems.push(`tracker.json не читается: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const fromXlsx = await readXlsx(readFileSync(join(folder, XLSX_FILE)));
      problems.push(...compareEntities('tracker.xlsx', snapshot.data, fromXlsx.snapshot.data));
      if (fromXlsx.snapshot.accounts.length !== snapshot.accounts.length) {
        problems.push(
          `tracker.xlsx: учётных записей ${fromXlsx.snapshot.accounts.length} вместо ${snapshot.accounts.length}`,
        );
      }
    } catch (e) {
      problems.push(`tracker.xlsx не читается: ${e instanceof Error ? e.message : String(e)}`);
    }
    return problems;
  }

  // ------------------------------------------------------------ ротация и журнал

  /** Удаляет лишние комплекты: остаются keepDaily ежедневных и keepMonthly ежемесячных. */
  rotate(): string[] {
    const { keepDaily, keepMonthly } = this.options;
    const dir = this.dirPath;
    const doomed = planRotation(this.bundles(), keepDaily, keepMonthly);
    for (const name of doomed) rmSync(join(dir, name), { recursive: true, force: true });
    return doomed;
  }

  /** Комплекты в папке (только имена вида ГГГГ-ММ-ДД_ЧЧ-ММ с tracker.json). */
  bundles(): string[] {
    const dir = this.dirPath;
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((n) => BUNDLE_RE.test(n) && existsSync(join(dir, n, JSON_FILE)))
      .sort();
  }

  private log(
    at: Date,
    result: 'OK' | 'ОШИБКА',
    bundle: string,
    reason: string,
    message: string,
  ): void {
    const line = [localStamp(at), result, bundle, reason, clean(message)].join(' | ');
    try {
      mkdirSync(this.dirPath, { recursive: true });
      appendFileSync(join(this.dirPath, LOG_FILE), `${line}\n`);
    } catch {
      // журнал недоступен — результат всё равно виден в интерфейсе по последней копии
    }
    this.lastRunEntry = {
      // как в журнале — с точностью до секунды, чтобы запись не дублировалась
      at: new Date(Math.floor(at.getTime() / 1000) * 1000).toISOString(),
      ok: result === 'OK',
      bundle: result === 'OK' ? bundle : null,
      reason,
      message: result === 'OK' ? '' : clean(message),
      counts: result === 'OK' ? parseCounts(message) : null,
    };
    this.options.onLog?.(line);
  }

  private entries(): BackupEntry[] {
    const file = join(this.dirPath, LOG_FILE);
    const out: BackupEntry[] = [];
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    for (const line of text.split('\n')) {
      const [stamp, result, bundle, reason, ...rest] = line.split(' | ');
      const at = stamp ? parseLocal(stamp) : null;
      if (!at || (result !== 'OK' && result !== 'ОШИБКА') || !reason) continue;
      const message = rest.join(' | ');
      const ok = result === 'OK';
      out.push({
        at: at.toISOString(),
        ok,
        bundle: ok && bundle ? bundle : null,
        reason,
        message: ok ? '' : message,
        counts: ok ? parseCounts(message) : null,
      });
    }
    const recent = out.slice(-RECENT).reverse();
    const mem = this.lastRunEntry;
    if (mem && (!recent[0] || mem.at > recent[0].at)) recent.unshift(mem);
    return recent.slice(0, RECENT);
  }

  /** Время последней успешной копии: по комплектам в папке (журнал можно удалить). */
  lastOkAt(): Date | null {
    const latest = this.bundles().at(-1);
    return latest ? bundleDate(latest) : null;
  }

  status(): BackupStatus {
    const { auto, time, keepDaily, keepMonthly } = this.options;
    const dir = this.dirPath;
    const now = this.now();
    const recent = this.entries();
    const last = recent[0] ?? null;
    const lastOk = this.lastOkAt();
    let warning: string | null = null;
    if (last && !last.ok) {
      warning = `Резервная копия от ${localStamp(new Date(last.at)).slice(0, 16)} не создана: ${last.message || 'ошибка'}`;
    } else if (auto && (!lastOk || now.getTime() - lastOk.getTime() > OVERDUE_MS)) {
      warning = lastOk
        ? `Резервной копии нет больше двух суток (последняя — ${localStamp(lastOk).slice(0, 16)})`
        : 'Резервных копий ещё нет';
    }
    return {
      dir,
      auto,
      time,
      nextAt: auto ? nextRun(now, time).toISOString() : null,
      running: this.running,
      last,
      lastOkAt: lastOk ? lastOk.toISOString() : null,
      recent,
      warning,
      keepDaily,
      keepMonthly,
    };
  }

  /** Последний комплект с Excel-файлом: для кнопки «Скачать Excel». */
  latestXlsx(): { path: string; bundle: string } | null {
    for (const name of this.bundles().reverse()) {
      const path = join(this.dirPath, name, XLSX_FILE);
      if (existsSync(path)) return { path, bundle: name };
    }
    return null;
  }

  // ------------------------------------------------------------ расписание

  /** Включает автокопирование: проверка раз в минуту и копия при запуске, если последней больше 24 ч. */
  start(): void {
    if (!this.options.auto || this.timer) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
    this.startupTimer = setTimeout(() => {
      if (startupDue(this.now(), this.lastOkAt())) void this.attempt('при запуске');
    }, 3_000);
    this.startupTimer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.timer = null;
    this.startupTimer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    const due = dailyDue({
      now: this.now(),
      time: this.options.time,
      lastOkAt: this.lastOkAt(),
      lastAttemptAt: this.lastAttemptAt,
    });
    if (due) await this.attempt('по расписанию');
  }

  private async attempt(reason: string): Promise<void> {
    if (this.running) return;
    try {
      await this.run(reason);
    } catch {
      // ошибка уже записана в журнал; следующая попытка — через час
    }
  }
}

export { SAFETY_PREFIX };
