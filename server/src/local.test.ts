import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { createAccount, listAccounts } from './auth';
import { readConfig } from './config';
import { openPglite, type Connection } from './db';
import { acquireLock, lockPath, lockedBy } from './lock';
import { importDataset, readSeedFile } from './seed';

// Локальное развёртывание без Docker и PostgreSQL (ADR-011): закрытая регистрация, учётки от
// администратора с временным паролем, настройки, защита базы от двойного открытия, копии.

const PASSWORD = 'admin-pass-1';

describe('настройки', () => {
  it('значения по умолчанию рассчитаны на один компьютер', () => {
    const c = readConfig({});
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(3000);
    expect(c.databaseUrl).toBeUndefined();
    expect(c.dataDir).toBe(resolve('./local-data'));
    expect(c.allowRegistration).toBe(false);
    expect(c).toMatchObject({
      backupAuto: true,
      backupTime: '18:00',
      backupKeepDaily: 30,
      backupKeepMonthly: 12,
    });
  });

  it('читает переменные окружения и проверяет числа', () => {
    const c = readConfig({
      HOST: '0.0.0.0',
      PORT: '8080',
      DATABASE_URL: 'postgres://x',
      DATA_DIR: '/tmp/data',
      ALLOW_REGISTRATION: 'true',
      BACKUP_KEEP_DAILY: '3',
      BACKUP_KEEP_MONTHLY: '2',
      BACKUP_TIME: '7:05',
      BACKUP_AUTO: 'false',
    });
    expect(c).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      databaseUrl: 'postgres://x',
      dataDir: resolve('/tmp/data'),
      allowRegistration: true,
      backupKeepDaily: 3,
      backupKeepMonthly: 2,
      backupTime: '07:05',
      backupAuto: false,
    });
    expect(() => readConfig({ PORT: 'abc' })).toThrow('PORT');
    expect(() => readConfig({ PORT: '70000' })).toThrow('PORT');
    expect(readConfig({ ALLOW_REGISTRATION: 'yes' }).allowRegistration).toBe(false);
    expect(readConfig({ DATABASE_URL: '  ' }).databaseUrl).toBeUndefined();
    expect(() => readConfig({ BACKUP_TIME: '25:00' })).toThrow('BACKUP_TIME');
    expect(() => readConfig({ BACKUP_KEEP_DAILY: '0' })).toThrow('BACKUP_KEEP_DAILY');
  });
});

describe('метка занятой базы', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-lock-'));
  const data = join(dir, 'data');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('занимает и освобождает', () => {
    expect(lockedBy(data)).toBeNull();
    const release = acquireLock(data);
    expect(lockedBy(data)).toBe(process.pid);
    release();
    expect(existsSync(lockPath(data))).toBe(false);
  });

  it('живой чужой процесс блокирует, завершённый — нет', () => {
    writeFileSync(lockPath(data), String(process.ppid));
    expect(() => acquireLock(data)).toThrow('уже запущен');
    writeFileSync(lockPath(data), '2147483646');
    expect(lockedBy(data)).toBeNull();
    const release = acquireLock(data);
    release();
  });
});

describe('закрытая регистрация и учётки от администратора', () => {
  let connection: Connection;
  let app: FastifyInstance;
  const cookieOf = (res: { cookies: { value: string }[] }) => `tt_session=${res.cookies[0]?.value}`;
  const json = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

  beforeAll(async () => {
    connection = await openPglite();
    await importDataset(connection.db, readSeedFile('data/seed.json'));
    app = buildApp({ db: connection.db });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await connection.close();
  });

  const login = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });

  it('по умолчанию регистрации нет, до администратора это видно в настройках', async () => {
    expect(json(await app.inject({ url: '/api/config' }))).toEqual({
      registration: false,
      needsAdmin: true,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.ru', password: PASSWORD, name: 'Взлом' },
    });
    expect(res.statusCode).toBe(403);
    expect(await listAccounts(connection.db)).toHaveLength(0);
  });

  it('открытая регистрация включается настройкой', async () => {
    const open = buildApp({ db: connection.db, allowRegistration: true });
    expect(json(await open.inject({ url: '/api/config' })).registration).toBe(true);
    await open.close();
  });

  let adminCookie = '';
  let memberId = '';
  let memberCookie = '';

  it('администратор создаётся из командной строки (createAccount) и входит', async () => {
    const admin = await createAccount(connection.db, {
      email: 'Admin@Example.com',
      name: 'Админ',
      password: PASSWORD,
      role: 'admin',
    });
    expect(admin).toMatchObject({ role: 'admin', mustChangePassword: false });
    expect(json(await app.inject({ url: '/api/config' })).needsAdmin).toBe(false);
    await expect(
      createAccount(connection.db, {
        email: 'admin@example.com',
        name: 'Дубль',
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      createAccount(connection.db, { email: 'x', name: '', password: '1' }),
    ).rejects.toMatchObject({ status: 422 });
    const res = await login('admin@example.com', PASSWORD);
    expect(res.statusCode).toBe(200);
    adminCookie = cookieOf(res);
  });

  it('участника создаёт только администратор, пароль у него временный', async () => {
    const payload = { email: 'ivan@example.com', name: 'Иван', password: 'temp-pass-1' };
    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: adminCookie },
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(json(created)).toMatchObject({ role: 'developer', mustChangePassword: true });
    memberId = String(json(created).id);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/users',
          headers: { cookie: adminCookie },
          payload,
        })
      ).statusCode,
    ).toBe(409);
    const asMember = await login('ivan@example.com', 'temp-pass-1');
    memberCookie = cookieOf(asMember);
    expect(json(asMember).mustChangePassword).toBe(true);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/users',
          headers: { cookie: memberCookie },
          payload: { ...payload, email: 'x@example.com' },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('с временным паролем данные закрыты, пока пароль не сменён', async () => {
    const get = (url: string, cookie: string) => app.inject({ url, headers: { cookie } });
    const blocked = await get('/api/projects', memberCookie);
    expect(blocked.statusCode).toBe(403);
    expect((json(blocked).error as { code: string }).code).toBe('password_change_required');
    expect((await get('/api/auth/me', memberCookie)).statusCode).toBe(200);

    const change = (current: string, next: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: { cookie: memberCookie },
        payload: { current, next },
      });
    expect((await change('не-тот-пароль', 'new-pass-123')).statusCode).toBe(401);
    expect((await change('temp-pass-1', 'short')).statusCode).toBe(422);
    expect((await change('temp-pass-1', 'temp-pass-1')).statusCode).toBe(422);
    const ok = await change('temp-pass-1', 'new-pass-123');
    expect(ok.statusCode).toBe(204);

    // прежняя сессия закрыта, выдана новая; данные открыты, старый пароль не работает
    expect((await get('/api/auth/me', memberCookie)).statusCode).toBe(401);
    memberCookie = cookieOf(ok);
    expect((await get('/api/projects', memberCookie)).statusCode).toBe(200);
    expect((await login('ivan@example.com', 'temp-pass-1')).statusCode).toBe(401);
    expect(json(await login('ivan@example.com', 'new-pass-123')).mustChangePassword).toBe(false);
  });

  it('администратор выдаёт новый временный пароль: сессии закрыты, смена снова нужна', async () => {
    const reset = (cookie: string, password: string) =>
      app.inject({
        method: 'POST',
        url: `/api/users/${memberId}/password`,
        headers: { cookie },
        payload: { password },
      });
    expect((await reset(memberCookie, 'whatever-123')).statusCode).toBe(403);
    expect((await reset(adminCookie, 'short')).statusCode).toBe(422);
    expect((await reset(adminCookie, 'temp-pass-2')).statusCode).toBe(204);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie: memberCookie } })).statusCode,
    ).toBe(401);
    expect(json(await login('ivan@example.com', 'temp-pass-2')).mustChangePassword).toBe(true);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/users/нет/password',
      headers: { cookie: adminCookie },
      payload: { password: 'temp-pass-3' },
    });
    expect(missing.statusCode).toBe(404);
  });
});
