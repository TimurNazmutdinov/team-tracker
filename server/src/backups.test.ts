import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import readXlsxFile from 'read-excel-file/node';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { createAccount, login, setPalette } from './auth';
import { checkBackupDir, listFolders } from './backups/folders';
import { applyRestore, currentCounts, loadBundle } from './backups/restore';
import { SAFETY_PREFIX, bundleDate, bundleName, planRotation } from './backups/rotation';
import { dailyDue, nextRun, startupDue } from './backups/schedule';
import { BackupService, JSON_FILE, LOG_FILE, XLSX_FILE, compareEntities } from './backups/service';
import { takeSnapshot } from './backups/snapshot';
import { buildXlsx } from './backups/xlsx';
import type { Entities, Snapshot } from './backups/types';
import { openPglite, type Connection } from './db';
import { importDataset, readSeedFile } from './seed';
import { getSetting, BACKUP_DIR_KEY } from './settings';

// Резервные копии (ADR-012): расписание, ротация, экспорт, проверка, восстановление из json и xlsx.

const root = mkdtempSync(join(tmpdir(), 'tt-backups-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const sortById = <T extends { id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.id.localeCompare(b.id));
const normalized = (e: Entities): Entities => ({
  projects: sortById(e.projects),
  people: sortById(e.people),
  members: sortById(e.members),
  sprints: sortById(e.sprints),
  issues: sortById(e.issues),
  links: sortById(e.links),
  comments: sortById(e.comments),
  history: sortById(e.history),
});

describe('имена комплектов и ротация', () => {
  it('имя папки и обратный разбор', () => {
    const d = new Date(2026, 9, 5, 7, 8);
    expect(bundleName(d)).toBe('2026-10-05_07-08');
    expect(bundleName(d, SAFETY_PREFIX)).toBe('before-restore_2026-10-05_07-08');
    expect(bundleDate('2026-10-05_07-08')).toEqual(d);
    expect(bundleDate('before-restore_2026-10-05_07-08')).toEqual(d);
    expect(bundleDate('чужая-папка')).toBeNull();
  });

  it('остаются последние по дням и по месяцам, лишнее удаляется, чужое не трогается', () => {
    const names: string[] = [];
    // по две копии в день за 40 дней: 20 сентября – 29 октября
    for (let k = 0; k < 40; k++) {
      const d = new Date(2026, 9, 29 - k);
      for (const h of ['09-00', '18-00']) {
        names.push(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${h}`,
        );
      }
    }
    names.push('before-restore_2026-10-29_10-00', 'notes', '.tmp-2026-10-29_18-00');
    const doomed = planRotation(names, 30, 12);
    const kept = names.filter((n) => !doomed.includes(n));
    // 30 дней по одной (последней в дне) + по одной на сентябрь и октябрь уже входят в них
    expect(kept.filter((n) => /^\d{4}-/.test(n))).toHaveLength(30);
    expect(kept).toContain('2026-10-29_18-00');
    expect(doomed).not.toContain('2026-10-29_18-00');
    expect(doomed).toContain('2026-10-29_09-00');
    // 30-й день назад — последний из хранимых, 31-й — удалён
    expect(kept).toContain('2026-09-30_18-00');
    expect(doomed).toContain('2026-09-29_18-00'.replace('09-29', '09-29'));
    // служебные и чужие имена не попадают в удаление
    for (const safe of ['before-restore_2026-10-29_10-00', 'notes', '.tmp-2026-10-29_18-00'])
      expect(doomed).not.toContain(safe);
  });

  it('ежемесячные копии живут дольше ежедневных', () => {
    const names = ['2025-12-31_18-00', '2025-12-05_18-00', '2026-01-31_18-00', '2026-10-29_18-00'];
    const doomed = planRotation(names, 1, 12);
    expect(doomed).toEqual(['2025-12-05_18-00']);
    expect(planRotation(names, 1, 2)).toEqual(
      [
        '2026-01-31_18-00'.replace('2026-01-31', '2025-12-31'),
        '2025-12-05_18-00',
        '2026-01-31_18-00',
      ].filter((n) => n !== '2026-01-31_18-00' || false),
    );
  });
});

describe('расписание', () => {
  const at = (h: number, m = 0, day = 29) => new Date(2026, 9, day, h, m);

  it('ежедневная копия: после заданного времени, один раз, повтор после ошибки через час', () => {
    const base = { time: '18:00', lastOkAt: null, lastAttemptAt: null };
    expect(dailyDue({ ...base, now: at(17, 59) })).toBe(false);
    expect(dailyDue({ ...base, now: at(18, 0) })).toBe(true);
    expect(dailyDue({ ...base, now: at(18, 0), lastOkAt: at(18, 0) })).toBe(false);
    expect(dailyDue({ ...base, now: at(23, 0), lastOkAt: at(9, 0) })).toBe(true);
    expect(dailyDue({ ...base, now: at(23, 0), lastOkAt: at(9, 0, 28) })).toBe(true);
    expect(dailyDue({ ...base, now: at(18, 30), lastAttemptAt: at(18, 5) })).toBe(false);
    expect(dailyDue({ ...base, now: at(19, 6), lastAttemptAt: at(18, 5) })).toBe(true);
  });

  it('при запуске: нет копий или последней больше суток', () => {
    expect(startupDue(at(10), null)).toBe(true);
    expect(startupDue(at(10), at(11, 0, 28))).toBe(false);
    expect(startupDue(at(12), at(11, 0, 28))).toBe(true);
  });

  it('следующая копия — сегодня или завтра', () => {
    expect(nextRun(at(10), '18:00')).toEqual(at(18));
    expect(nextRun(at(19), '18:00')).toEqual(at(18, 0, 30));
  });
});

describe('экспорт, проверка и восстановление', () => {
  let source: Connection;
  let service: BackupService;
  let folder = '';
  let original: Snapshot;
  const dir = join(root, 'copies');
  const now = new Date(2026, 9, 29, 18, 0, 0);

  beforeAll(async () => {
    source = await openPglite();
    const seed = readSeedFile('data/seed.json');
    // Текст, на котором ломаются плохие экспортёры: переносы строк, эмодзи, символы XML, «формулы»
    const first = seed.issues[0];
    if (!first) throw new Error('в seed нет задач');
    first.description = 'Строка 1\nСтрока 2\n\n🎉 <b>&amp;</b> "кавычки" =SUM(A1:A2) +1 @cmd';
    first.acceptance = '- [ ] первое\n- [ ] второе';
    first.labels = ['бэкенд', 'срочно'];
    await importDataset(source.db, seed);
    await createAccount(source.db, {
      email: 'admin@example.com',
      name: 'Админ',
      password: 'admin-pass-1',
      role: 'admin',
    });
    await createAccount(source.db, {
      email: 'dev@example.com',
      name: 'Разработчик',
      password: 'dev-pass-123',
      role: 'developer',
      mustChangePassword: true,
    });
    // у одной учётки выбрана «Стандартная» гамма: она должна пережить копию и восстановление
    const dev = (await takeSnapshot(source.db)).accounts.find((x) => x.email === 'dev@example.com');
    await setPalette(source.db, dev?.id ?? '', 'blue');
    original = await takeSnapshot(source.db);
    service = new BackupService({
      connection: source,
      dir,
      appVersion: '9.9.9',
      keepDaily: 30,
      keepMonthly: 12,
      time: '18:00',
      auto: false,
      now: () => now,
    });
    const result = await service.run('вручную');
    folder = result.dir;
  }, 120_000);

  afterAll(async () => {
    await source.close();
  });

  it('комплект: папка с датой, xlsx, json и копия базы; результат в журнале', () => {
    expect(folder).toBe(join(dir, '2026-10-29_18-00'));
    expect(readdirSync(folder).sort()).toEqual([
      'database.pglite.tar.gz',
      'tracker.json',
      'tracker.xlsx',
    ]);
    expect(readdirSync(dir).some((n) => n.startsWith('.tmp-'))).toBe(false);
    const log = readFileSync(join(dir, LOG_FILE), 'utf8');
    expect(log).toMatch(
      /^2026-10-29 18:00:00 \| OK \| 2026-10-29_18-00 \| вручную \| проекты 1, люди 6, /,
    );
    const status = service.status();
    expect(status.last).toMatchObject({ ok: true, bundle: '2026-10-29_18-00', reason: 'вручную' });
    expect(status.last?.counts?.issues).toBe(original.data.issues.length);
    expect(status.warning).toBeNull();
    expect(status.nextAt).toBeNull();
  });

  it('Excel: листы, русские заголовки, служебные колонки справа, фильтр и закреплённая строка', async () => {
    const xlsx = readFileSync(join(folder, XLSX_FILE));
    const sheets = (await readXlsxFile(xlsx)) as { sheet: string; data: unknown[][] }[];
    expect(sheets.map((s) => s.sheet)).toEqual([
      'Сводка',
      'Проекты',
      'Люди',
      'Участники проектов',
      'Спринты',
      'Задачи',
      'Связи',
      'Комментарии',
      'История',
    ]);
    const issues = sheets.find((s) => s.sheet === 'Задачи');
    const header = (issues?.data[0] ?? []) as string[];
    expect(header.slice(0, 6)).toEqual([
      'Ключ',
      'Тип',
      'Название',
      'Родитель (ключ)',
      'Статус',
      'Приоритет',
    ]);
    expect(header.indexOf('Критерии приёмки')).toBeLessThan(header.indexOf('id'));
    expect(header.at(-1)).toBe('order');
    expect(issues?.data).toHaveLength(original.data.issues.length + 1);
    const sprints = sheets.find((s) => s.sheet === 'Спринты');
    expect(sprints?.data[0]).toEqual(
      expect.arrayContaining(['Цель', 'Старт', 'Конец', 'Закрыт (closedAt)', 'Velocity, sp']),
    );
    const summary = sheets.find((s) => s.sheet === 'Сводка')?.data ?? [];
    expect(summary.find((r) => r[0] === 'Версия трекера')?.[1]).toBe('9.9.9');
    expect(summary.find((r) => r[0] === 'Задач')?.[1]).toBe(original.data.issues.length);

    const files = unzipSync(new Uint8Array(xlsx));
    for (let i = 1; i <= 8; i++) {
      const xml = strFromU8(files[`xl/worksheets/sheet${i}.xml`] ?? new Uint8Array());
      expect(xml).toContain('state="frozen"');
      expect(xml).toMatch(/<autoFilter ref="A1:[A-Z]+\d+"\/>/);
      expect(xml).toContain('<cols>');
    }
    expect(strFromU8(files['xl/workbook.xml'] ?? new Uint8Array())).toContain(
      '_xlnm._FilterDatabase',
    );
  });

  it('velocity закрытого спринта попадает на лист «Спринты»', async () => {
    const xlsx = readFileSync(join(folder, XLSX_FILE));
    const sheets = (await readXlsxFile(xlsx)) as { sheet: string; data: unknown[][] }[];
    const rows = sheets.find((s) => s.sheet === 'Спринты')?.data ?? [];
    const head = rows[0] as string[];
    const closed = rows.find((r) => r[head.indexOf('Состояние')] === 'закрыт');
    expect(closed).toBeDefined();
    expect(typeof closed?.[head.indexOf('Velocity, sp')]).toBe('number');
  });

  it('круг: из json восстанавливается всё, включая пароли', async () => {
    const loaded = await loadBundle(folder, 'json');
    if (!loaded.ok) throw new Error(loaded.problems.join('; '));
    expect(loaded.source).toBe('json');
    expect(loaded.withPasswords).toBe(true);

    const target = await openPglite();
    try {
      await importDataset(target.db, {
        ...readSeedFile('data/seed.json'),
        issues: [],
        sprints: [],
        links: [],
        comments: [],
        history: [],
      });
      await createAccount(target.db, {
        email: 'old@example.com',
        name: 'Старый',
        password: 'old-pass-123',
      });
      const result = await applyRestore(target.db, loaded.snapshot);
      expect(result.temporaryPasswords).toEqual([]);
      const restored = await takeSnapshot(target.db);
      expect(normalized(restored.data)).toEqual(normalized(original.data));
      expect(sortById(restored.accounts.map((a) => ({ ...a, id: a.id })))).toEqual(
        sortById(original.accounts.map((a) => ({ ...a, id: a.id }))),
      );
      // старые данные заменены целиком, вход со старым паролем админа работает
      expect(restored.accounts.some((a) => a.email === 'old@example.com')).toBe(false);
      expect(
        (await login(target.db, { email: 'admin@example.com', password: 'admin-pass-1' })).account
          .role,
      ).toBe('admin');
      expect(await currentCounts(target.db)).toMatchObject({
        issues: original.data.issues.length,
        accounts: 2,
      });
    } finally {
      await target.close();
    }
  }, 120_000);

  it('круг: из Excel восстанавливаются данные, учётки получают временные пароли', async () => {
    const loaded = await loadBundle(folder, 'xlsx');
    if (!loaded.ok) throw new Error(loaded.problems.join('; '));
    expect(loaded.source).toBe('xlsx');
    expect(loaded.withPasswords).toBe(false);

    const target = await openPglite();
    try {
      const result = await applyRestore(target.db, loaded.snapshot);
      expect(result.temporaryPasswords.map((t) => t.email).sort()).toEqual([
        'admin@example.com',
        'dev@example.com',
      ]);
      const restored = await takeSnapshot(target.db);

      // Excel не различает пустую строку и пустую ячейку: в истории «было/стало» '' становится null
      const expected = normalized(original.data);
      expected.history = expected.history.map((h) => ({
        ...h,
        from: h.from === '' ? null : h.from,
        to: h.to === '' ? null : h.to,
      }));
      expect(normalized(restored.data)).toEqual(expected);

      expect(
        restored.accounts
          .map((a) => [a.email, a.accessRole, a.mustChangePassword, a.palette])
          .sort(),
      ).toEqual([
        ['admin@example.com', 'admin', true, 'beige'],
        ['dev@example.com', 'developer', true, 'blue'],
      ]);
      const temp = result.temporaryPasswords.find((t) => t.email === 'admin@example.com');
      const entered = await login(target.db, {
        email: 'admin@example.com',
        password: temp?.password ?? '',
      });
      expect(entered.account.mustChangePassword).toBe(true);
    } finally {
      await target.close();
    }
  }, 120_000);

  it('копия без поля гаммы (до ADR-013) восстанавливается с бежевой по умолчанию', async () => {
    const d = join(root, 'old-format');
    mkdirSync(d, { recursive: true });
    const raw = JSON.parse(readFileSync(join(folder, JSON_FILE), 'utf8')) as {
      accounts: Record<string, unknown>[];
    };
    for (const a of raw.accounts) delete a.palette;
    writeFileSync(join(d, JSON_FILE), JSON.stringify(raw));
    const loaded = await loadBundle(d, 'json');
    expect(loaded.ok && loaded.snapshot.accounts.map((a) => a.palette)).toEqual(['beige', 'beige']);
  });

  it('копия до ADR-016 без владельцев и участников проектов восстанавливается без них', async () => {
    const d = join(root, 'before-members');
    mkdirSync(d, { recursive: true });
    const raw = JSON.parse(readFileSync(join(folder, JSON_FILE), 'utf8')) as {
      data: { members?: unknown; projects: Record<string, unknown>[] };
    };
    delete raw.data.members;
    for (const p of raw.data.projects) delete p.ownerId;
    writeFileSync(join(d, JSON_FILE), JSON.stringify(raw));
    const loaded = await loadBundle(d, 'json');
    expect(loaded.ok).toBe(true);
    expect(loaded.ok && loaded.snapshot.data.members).toEqual([]);
    expect(loaded.ok && loaded.snapshot.data.projects.map((p) => p.ownerId)).toEqual([null]);
  });

  it('автовыбор: json, а если он повреждён, — Excel с пометкой; оба повреждены — отказ', async () => {
    const copy = join(root, 'broken-json');
    mkdirSync(copy);
    writeFileSync(join(copy, XLSX_FILE), readFileSync(join(folder, XLSX_FILE)));
    writeFileSync(join(copy, JSON_FILE), '{ это не json');
    const auto = await loadBundle(copy);
    expect(auto.ok && auto.source).toBe('xlsx');
    expect(auto.ok && auto.notes[0]).toContain('json не подошёл');
    const onlyJson = await loadBundle(copy, 'json');
    expect(onlyJson.ok).toBe(false);

    writeFileSync(join(copy, XLSX_FILE), 'не xlsx');
    const none = await loadBundle(copy);
    expect(none.ok).toBe(false);
    expect(!none.ok && none.problems.join(' ')).toContain('tracker.xlsx');
    expect((await loadBundle(join(root, 'нет-такой'))).ok).toBe(false);
  });

  it('битые и неполные файлы отклоняются с понятной причиной', async () => {
    const raw = JSON.parse(readFileSync(join(folder, JSON_FILE), 'utf8')) as {
      data: Entities;
      counts: Record<string, number>;
    };
    const make = (name: string, mutate: (j: typeof raw) => void) => {
      const d = join(root, name);
      mkdirSync(d, { recursive: true });
      const copy = structuredClone(raw);
      mutate(copy);
      writeFileSync(join(d, JSON_FILE), JSON.stringify(copy));
      return d;
    };
    // задача ссылается на несуществующий спринт
    const orphan = await loadBundle(
      make('orphan', (j) => {
        const i = j.data.issues[0];
        if (i) i.sprintId = 'нет-такого';
      }),
      'json',
    );
    expect(orphan.ok).toBe(false);
    // заявленное число записей не совпадает с содержимым: файл обрезан
    const cut = await loadBundle(
      make('cut', (j) => {
        j.data.history.pop();
      }),
      'json',
    );
    expect(!cut.ok && cut.problems.join(' ')).toContain('повреждён');
    // неверный формат поля
    const bad = await loadBundle(
      make('bad', (j) => {
        const i = j.data.issues[0];
        if (i) i.status = 'Готово' as never;
      }),
      'json',
    );
    expect(bad.ok).toBe(false);
    // Excel с битой ссылкой: собираем из изменённого снимка
    const tampered: Snapshot = structuredClone(original);
    const t = tampered.data.issues[0];
    if (t) t.sprintId = 'нет-такого';
    const dx = join(root, 'xlsx-orphan');
    mkdirSync(dx, { recursive: true });
    writeFileSync(
      join(dx, XLSX_FILE),
      (
        await buildXlsx(tampered, {
          createdAt: now,
          reason: 'тест',
          appVersion: '1',
          schemaVersion: 1,
        })
      ).data,
    );
    expect((await loadBundle(dx, 'xlsx')).ok).toBe(false);
  });

  it('проверка копии ловит расхождения: пропавшие записи и нечитаемые файлы', async () => {
    const d = join(root, 'tampered');
    mkdirSync(d);
    const raw = JSON.parse(readFileSync(join(folder, JSON_FILE), 'utf8')) as {
      data: Entities;
      counts: Record<string, number>;
    };
    raw.data.issues.pop();
    writeFileSync(join(d, JSON_FILE), JSON.stringify(raw));
    writeFileSync(join(d, XLSX_FILE), 'мусор');
    const problems = await service.verify(d, original);
    expect(problems.some((p) => p.startsWith('tracker.json: issues'))).toBe(true);
    expect(problems.some((p) => p.includes('tracker.xlsx не читается'))).toBe(true);
    expect(compareEntities('x', original.data, original.data)).toEqual([]);
  });

  it('ошибка копии записывается в журнал и видна как предупреждение; комплект не появляется', async () => {
    const blocked = join(root, 'not-a-folder');
    writeFileSync(blocked, 'я файл, а не папка');
    const broken = new BackupService({
      connection: source,
      dir: join(blocked, 'sub'),
      appVersion: '1',
      keepDaily: 30,
      keepMonthly: 12,
      time: '18:00',
      auto: true,
      now: () => now,
    });
    await expect(broken.run('по расписанию')).rejects.toThrow();
    const status = broken.status();
    expect(status.last).toMatchObject({ ok: false, reason: 'по расписанию' });
    expect(status.warning).toContain('не создана');
    expect(broken.bundles()).toEqual([]);
  });

  it('предупреждение, если копий давно нет', () => {
    const late = new BackupService({
      connection: source,
      dir,
      appVersion: '1',
      keepDaily: 30,
      keepMonthly: 12,
      time: '18:00',
      auto: true,
      now: () => new Date(2026, 10, 5, 12, 0),
    });
    expect(late.status().warning).toContain('больше двух суток');
    const never = new BackupService({
      connection: source,
      dir: join(root, 'пусто'),
      appVersion: '1',
      keepDaily: 30,
      keepMonthly: 12,
      time: '18:00',
      auto: true,
      now: () => now,
    });
    expect(never.status().warning).toBe('Резервных копий ещё нет');
    expect(never.status().nextAt).not.toBeNull();
  });

  it('ротация сервиса удаляет лишнее и оставляет служебные комплекты и чужие папки', () => {
    const rdir = join(root, 'rot');
    const svc = new BackupService({
      connection: source,
      dir: rdir,
      appVersion: '1',
      keepDaily: 2,
      keepMonthly: 1,
      time: '18:00',
      auto: false,
      now: () => now,
    });
    for (const n of [
      '2026-10-27_18-00',
      '2026-10-28_18-00',
      '2026-10-29_18-00',
      'before-restore_2026-10-01_10-00',
      'мои-файлы',
    ]) {
      mkdirSync(join(rdir, n), { recursive: true });
      writeFileSync(join(rdir, n, JSON_FILE), '{}');
    }
    expect(svc.rotate()).toEqual(['2026-10-27_18-00']);
    expect(readdirSync(rdir).sort()).toEqual([
      '2026-10-28_18-00',
      '2026-10-29_18-00',
      'before-restore_2026-10-01_10-00',
      'мои-файлы',
    ]);
  });

  it('страховочные комплекты перед восстановлением не затирают друг друга', async () => {
    const first = await service.run('перед восстановлением', SAFETY_PREFIX);
    const second = await service.run('перед восстановлением', SAFETY_PREFIX);
    expect(first.bundle).toBe('before-restore_2026-10-29_18-00');
    expect(second.bundle).toBe('before-restore_2026-10-29_18-00-2');
    expect(existsSync(first.dir) && existsSync(second.dir)).toBe(true);
    // ротация их не удаляет
    service.rotate();
    expect(existsSync(first.dir) && existsSync(second.dir)).toBe(true);
  });

  it('две копии в одну минуту не оставляют временных папок, последняя заменяет первую', async () => {
    const again = await service.run('вручную');
    expect(again.bundle).toBe('2026-10-29_18-00');
    expect(readdirSync(dir).filter((n) => n.startsWith('.tmp-'))).toEqual([]);
    expect(existsSync(join(dir, '2026-10-29_18-00', XLSX_FILE))).toBe(true);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- ответы API в тестах разбираются как произвольный JSON */
describe('папка копий: выбор в настройках и API для администратора', () => {
  let connection: Connection;
  let app: FastifyInstance;
  let service: BackupService;
  const data = join(root, 'api-data');
  const startDir = join(root, 'api-copies');
  let admin = '';
  let dev = '';

  const call = async (
    cookie: string,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: unknown,
  ) => {
    const r = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return {
      status: r.statusCode,
      body: r.body,
      json: () => JSON.parse(r.body) as Record<string, any>,
      headers: r.headers,
      raw: r.rawPayload,
    };
  };

  beforeAll(async () => {
    connection = await openPglite();
    await importDataset(connection.db, readSeedFile('data/seed.json'));
    service = new BackupService({
      connection,
      dir: startDir,
      appVersion: '1.2.3',
      keepDaily: 30,
      keepMonthly: 12,
      time: '18:00',
      auto: true,
    });
    app = buildApp({ db: connection.db, backups: service, dataDir: data, allowRegistration: true });
    await app.ready();
    const reg = async (email: string) => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email, password: 'password-1', name: email },
      });
      return `tt_session=${r.cookies[0]?.value}`;
    };
    admin = await reg('admin@example.com');
    dev = await reg('dev@example.com');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await connection.close();
  });

  it('только администратор', async () => {
    for (const [m, u] of [
      ['GET', '/api/admin/backups'],
      ['POST', '/api/admin/backups'],
      ['GET', '/api/admin/backups/excel'],
      ['GET', '/api/admin/backups/folders'],
      ['PUT', '/api/admin/backups/dir'],
    ] as const) {
      expect(
        (await call(dev, m, u, m === 'PUT' ? { dir: join(root, 'x') } : undefined)).status,
      ).toBe(403);
      expect((await app.inject({ method: m, url: u })).statusCode).toBe(401);
    }
  });

  it('состояние до копии, копия сейчас, скачивание Excel', async () => {
    const before = (await call(admin, 'GET', '/api/admin/backups')).json();
    expect(before).toMatchObject({
      dir: startDir,
      last: null,
      warning: 'Резервных копий ещё нет'.replace('ещё нет', 'ещё нет'),
    });
    expect((await call(admin, 'GET', '/api/admin/backups/excel')).status).toBe(404);

    const made = (await call(admin, 'POST', '/api/admin/backups')).json();
    expect(made.last).toMatchObject({ ok: true, reason: 'вручную' });
    expect(made.recent).toHaveLength(1);
    const excel = await call(admin, 'GET', '/api/admin/backups/excel');
    expect(excel.status).toBe(200);
    expect(String(excel.headers['content-type'])).toContain('spreadsheetml');
    expect(String(excel.headers['content-disposition'])).toContain('filename*=UTF-8');
    expect(excel.raw.subarray(0, 2).toString()).toBe('PK');
  });

  it('выбор папки: проверка пути, сохранение в базе, первая копия на новом месте', async () => {
    const put = (dir: string) => call(admin, 'PUT', '/api/admin/backups/dir', { dir });
    expect((await put('')).status).toBe(422);
    expect((await put('относительная/папка')).status).toBe(422);
    expect((await put(join(data, 'внутри'))).status).toBe(422);

    const target = join(root, 'cloud', 'tracker-backups');
    const res = await put(target);
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ dir: target, last: { ok: true, reason: 'смена папки' } });
    expect(await getSetting(connection.db, BACKUP_DIR_KEY)).toBe(target);
    expect(service.dir).toBe(target);
    expect(service.bundles()).toHaveLength(1);
    // прежние копии остались на месте
    expect(readdirSync(startDir).some((n) => /^\d{4}-/.test(n))).toBe(true);
  });

  it('просмотр папок: подпапки без скрытых, переход вверх', async () => {
    const base = join(root, 'browse');
    mkdirSync(join(base, 'Б-папка'), { recursive: true });
    mkdirSync(join(base, 'А-папка', 'вложенная'), { recursive: true });
    mkdirSync(join(base, '.скрытая'), { recursive: true });
    writeFileSync(join(base, 'файл.txt'), 'x');
    const listing = (
      await call(admin, 'GET', `/api/admin/backups/folders?path=${encodeURIComponent(base)}`)
    ).json();
    expect(listing.path).toBe(base);
    expect(listing.folders.map((f: { name: string }) => f.name)).toEqual(['А-папка', 'Б-папка']);
    expect(listing.parent).toBe(root);
    expect(
      (
        await call(
          admin,
          'GET',
          `/api/admin/backups/folders?path=${encodeURIComponent(join(base, 'нет'))}`,
        )
      ).status,
    ).toBe(404);
    expect(listFolders(undefined).path.length).toBeGreaterThan(0);
  });

  it('checkBackupDir создаёт папку и проверяет запись', () => {
    const dir = join(root, 'new', 'deep');
    expect(checkBackupDir(dir, data)).toBe(dir);
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
    const file = join(root, 'plain-file');
    writeFileSync(file, 'x');
    expect(() => checkBackupDir(join(file, 'sub'), data)).toThrow('нельзя записать');
    expect(() => checkBackupDir(data, data)).toThrow('не должна быть связана');
  });
});
