import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { BackupStatus } from '../../src/domain/backups';
import { buildDiagnostics, publicSettings } from './about';
import { buildApp } from './app';
import { readConfig } from './config';
import { openPglite, type Connection } from './db';
import { LogStore, RotatingLog } from './logs';
import { importDataset, readSeedFile } from './seed';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tt-logs-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('RotatingLog', () => {
  it('сдвигает файлы при достижении предела и хранит не больше keep файлов', () => {
    const log = new RotatingLog(dir, 'server', 100, 3);
    for (let i = 0; i < 30; i += 1)
      log.append(`строка ${String(i).padStart(2, '0')} ${'x'.repeat(30)}`);
    const files = readdirSync(dir).sort();
    expect(files).toEqual(['server.log', 'server.log.1', 'server.log.2']);
    // текущий файл — самые новые строки; самые старые удалены
    const newest = log.lines(1)[0] ?? '';
    expect(newest).toContain('строка 29');
    const all = log.lines(1000).join('\n');
    expect(all).not.toContain('строка 00');
    for (const f of files) expect(readFileSync(join(dir, f)).length).toBeLessThanOrEqual(200);
  });

  it('не падает, если каталог журнала недоступен', () => {
    const log = new RotatingLog(join(dir, 'file.txt', 'logs'), 'x');
    expect(() => log.append('строка')).not.toThrow();
  });
});

describe('LogStore', () => {
  it('пишет сервер и клиент раздельно и отдаёт общий список от новых к старым', () => {
    const logs = new LogStore(dir);
    logs.write('server', { message: 'раньше' }, new Date('2026-10-29T10:00:00Z'));
    logs.write(
      'client',
      { message: 'позже', where: '/projects/DEMO/board' },
      new Date('2026-10-29T11:00:00Z'),
    );
    expect(readdirSync(dir).sort()).toEqual(['client.log', 'server.log']);
    expect(logs.recent().map((e) => [e.source, e.message])).toEqual([
      ['client', 'позже'],
      ['server', 'раньше'],
    ]);
  });

  it('обрезает слишком длинные сообщения', () => {
    const logs = new LogStore(dir);
    logs.write('client', { message: 'a'.repeat(5000), stack: 'b'.repeat(9000) });
    const [entry] = logs.recent();
    expect(entry?.message.length).toBeLessThanOrEqual(2001);
    expect(entry?.stack?.length).toBeLessThanOrEqual(6001);
  });

  it('пропускает повреждённые строки', () => {
    const logs = new LogStore(dir);
    logs.write('server', { message: 'ok' });
    new RotatingLog(dir, 'server').append('не json');
    expect(logs.recent().map((e) => e.message)).toEqual(['ok']);
  });
});

describe('диагностика', () => {
  it('настройки не содержат строку подключения и паролей', () => {
    const config = readConfig({
      DATABASE_URL: 'postgres://user:SECRET-PASSWORD@db:5432/tracker',
      DATA_DIR: dir,
    });
    const text = JSON.stringify(publicSettings(config));
    expect(text).not.toContain('SECRET-PASSWORD');
    expect(text).not.toContain('postgres://');
    expect(publicSettings(config).database).toBe('postgres');
  });

  it('архив содержит версию, настройки, копии и журнал, но не данные задач', () => {
    const logs = new LogStore(dir);
    logs.write('server', { message: 'сбой записи', stack: 'Error: сбой\n  at x' });
    const config = readConfig({ DATA_DIR: dir });
    const zip = buildDiagnostics({
      about: {
        version: '9.9.9',
        buildDate: null,
        node: 'v22',
        platform: 'linux',
        database: 'pglite',
        startedAt: '2026-10-29T10:00:00.000Z',
      },
      settings: publicSettings(config),
      backups: null as BackupStatus | null,
      logs,
      now: new Date('2026-10-29T12:00:00Z'),
    });
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      'backups.json',
      'errors.log',
      'settings.json',
      'version.json',
    ]);
    expect(strFromU8(files['version.json'] ?? new Uint8Array())).toContain('9.9.9');
    expect(strFromU8(files['errors.log'] ?? new Uint8Array())).toContain('сбой записи');
    expect(strFromU8(files['settings.json'] ?? new Uint8Array())).toContain('pglite');
  });
});

describe('маршруты журнала', () => {
  let connection: Connection;
  let app: FastifyInstance;
  let logs: LogStore;

  beforeEach(async () => {
    logs = new LogStore(join(dir, 'logs'));
    connection = await openPglite();
    await importDataset(connection.db, readSeedFile('data/seed.json'));
    app = buildApp({
      db: connection.db,
      allowRegistration: true,
      logs,
      about: {
        version: '1.2.3',
        buildDate: null,
        node: 'v22',
        platform: 'linux',
        database: 'pglite',
        startedAt: '2026-10-29T10:00:00.000Z',
      },
      settings: { port: 3000 },
    });
    await app.ready();
  }, 60_000);

  afterEach(async () => {
    await app.close();
    await connection.close();
  });

  async function signUp(email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'secret-pass', name: 'Тест' },
    });
    return `tt_session=${res.cookies[0]?.value ?? ''}`;
  }

  it('принимает ошибки клиента без входа и пишет их в журнал', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/client-errors',
      payload: { message: 'TypeError: x', where: '/projects/DEMO/board' },
    });
    expect(res.statusCode).toBe(204);
    expect(logs.recent()[0]).toMatchObject({ source: 'client', message: 'TypeError: x' });
  });

  it('отклоняет слишком длинное сообщение клиента', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/client-errors',
      payload: { message: 'a'.repeat(3000) },
    });
    expect(res.statusCode).toBe(422);
  });

  it('ограничивает частоту ошибок клиента', async () => {
    let last = 0;
    for (let i = 0; i < 61; i += 1) {
      last = (
        await app.inject({
          method: 'POST',
          url: '/api/client-errors',
          payload: { message: `e${i}` },
        })
      ).statusCode;
    }
    expect(last).toBe(429);
  });

  it('журнал и диагностика — только администратору, версия — любому вошедшему', async () => {
    const admin = await signUp('admin@example.com'); // первая учётка — администратор
    const dev = await signUp('dev@example.com');
    const get = (url: string, cookie: string) =>
      app.inject({ method: 'GET', url, headers: { cookie } });

    expect((await get('/api/about', dev)).json()).toMatchObject({ version: '1.2.3' });
    expect((await app.inject({ method: 'GET', url: '/api/about' })).statusCode).toBe(401);
    expect((await get('/api/admin/log', dev)).statusCode).toBe(403);
    expect((await get('/api/admin/diagnostics', dev)).statusCode).toBe(403);
    expect((await get('/api/admin/log', admin)).statusCode).toBe(200);

    const zip = await get('/api/admin/diagnostics', admin);
    expect(zip.statusCode).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(Object.keys(unzipSync(new Uint8Array(zip.rawPayload)))).toContain('version.json');
  });
});
