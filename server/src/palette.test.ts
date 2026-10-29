import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { createAccount, listAccounts, login } from './auth';
import { openPglite, type Connection } from './db';

// Цветовая гамма в профиле (ADR-013): хранится на сервере, видна с любого компьютера.

describe('цветовая гамма профиля', () => {
  let connection: Connection;
  let app: FastifyInstance;
  const cookieOf = (res: { cookies: { value: string }[] }) => `tt_session=${res.cookies[0]?.value}`;
  const json = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

  beforeAll(async () => {
    connection = await openPglite();
    app = buildApp({ db: connection.db });
    await app.ready();
    await createAccount(connection.db, {
      email: 'anna@example.com',
      name: 'Анна',
      password: 'password-1',
      role: 'admin',
    });
    await createAccount(connection.db, {
      email: 'igor@example.com',
      name: 'Игорь',
      password: 'password-2',
    });
    await createAccount(connection.db, {
      email: 'temp@example.com',
      name: 'Временный',
      password: 'password-3',
      mustChangePassword: true,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await connection.close();
  });

  const signIn = async (email: string, password: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });
    return { cookie: cookieOf(res), account: json(res) };
  };
  const patch = (cookie: string, payload: unknown) =>
    app.inject({
      method: 'PATCH',
      url: '/api/auth/preferences',
      headers: { cookie },
      payload: payload as object,
    });

  it('по умолчанию — бежевая', async () => {
    const { cookie, account } = await signIn('anna@example.com', 'password-1');
    expect(account.palette).toBe('beige');
    expect(json(await app.inject({ url: '/api/auth/me', headers: { cookie } })).palette).toBe(
      'beige',
    );
  });

  it('выбор сохраняется на сервере и виден при новом входе (с другого компьютера)', async () => {
    const first = await signIn('anna@example.com', 'password-1');
    const res = await patch(first.cookie, { palette: 'blue' });
    expect(res.statusCode).toBe(200);
    expect(json(res).palette).toBe('blue');
    expect(
      json(await app.inject({ url: '/api/auth/me', headers: { cookie: first.cookie } })).palette,
    ).toBe('blue');

    // новая сессия — как вход с другого компьютера
    const second = await signIn('anna@example.com', 'password-1');
    expect(second.account.palette).toBe('blue');

    // вернуть можно
    expect(json(await patch(second.cookie, { palette: 'beige' })).palette).toBe('beige');
    expect((await signIn('anna@example.com', 'password-1')).account.palette).toBe('beige');
  });

  it('у каждого пользователя своя гамма', async () => {
    const anna = await signIn('anna@example.com', 'password-1');
    const igor = await signIn('igor@example.com', 'password-2');
    await patch(anna.cookie, { palette: 'blue' });
    expect(
      json(await app.inject({ url: '/api/auth/me', headers: { cookie: igor.cookie } })).palette,
    ).toBe('beige');
    const byEmail = Object.fromEntries(
      (await listAccounts(connection.db)).map((a) => [a.email, a.palette]),
    );
    expect(byEmail).toMatchObject({ 'anna@example.com': 'blue', 'igor@example.com': 'beige' });
  });

  it('неверные значения и вход без сессии отклоняются', async () => {
    const { cookie } = await signIn('igor@example.com', 'password-2');
    for (const bad of [{ palette: 'red' }, { palette: '' }, {}, { palette: 1 }]) {
      expect((await patch(cookie, bad)).statusCode).toBe(422);
    }
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/auth/preferences',
          payload: { palette: 'blue' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await signIn('igor@example.com', 'password-2')).account.palette).toBe('beige');
  });

  it('выбрать гамму можно и с временным паролем', async () => {
    const { cookie, account } = await signIn('temp@example.com', 'password-3');
    expect(account.mustChangePassword).toBe(true);
    expect((await patch(cookie, { palette: 'blue' })).statusCode).toBe(200);
    expect(
      (await login(connection.db, { email: 'temp@example.com', password: 'password-3' })).account
        .palette,
    ).toBe('blue');
  });
});
